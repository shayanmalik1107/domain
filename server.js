require('dotenv').config();
const express = require('express');
const cors = require('cors');
const whois = require('whois');
const path = require('path');
const https = require('https');
const Groq = require('groq-sdk');

const getGroqClient = () => {
    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) {
        throw new Error('GROQ_API_KEY environment variable is not configured on Vercel.');
    }
    return new Groq({ apiKey });
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// ─── Per-TLD WHOIS servers (verified from live test responses) ───────────────
const TLD_WHOIS_SERVERS = {
    'com':    'whois.verisign-grs.com',  // Prevent IANA routing to random registrar WHOIS
    'net':    'whois.verisign-grs.com',
    'pk':     'whois.pknic.net.pk',
    'ai':     'whois.nic.ai',
    'co':     'whois.registry.co',
    'online': 'whois.nic.online',
};

// ─── RDAP endpoints for TLDs where WHOIS is broken or unsupported ───────────
const TLD_RDAP_SERVERS = {
    'agency': 'https://rdap.identitydigital.services/rdap/domain/',
};

// ─── RDAP-based check (HTTP JSON API, more reliable than WHOIS) ──────────────
const checkRdapDomain = (domain, tld) => {
    return new Promise((resolve, reject) => {
        const baseUrl = TLD_RDAP_SERVERS[tld];
        if (!baseUrl) return reject(new Error('No RDAP server for TLD'));
        const url = `${baseUrl}${encodeURIComponent(domain)}`;
        
        const options = {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };

        https.get(url, options, (res) => {
            // Drop incoming data (we only care about the status code)
            res.on('data', () => {});
            res.on('end', () => {
                if (res.statusCode === 404) return resolve('AVAILABLE'); // 404 = not registered
                if (res.statusCode === 200) return resolve('TAKEN');     // 200 = registered
                resolve('UNKNOWN');
            });
        }).on('error', reject);
    });
};

// ─── Core WHOIS lookup with custom server override ───────────────────────────
const lookupDomain = (domain) => {
    return new Promise((resolve, reject) => {
        const tld = domain.split('.').pop();
        const server = TLD_WHOIS_SERVERS[tld] || null;
        const options = { timeout: 7000 };
        if (server) {
            options.server = server;
            options.follow = 0; // Don't follow IANA redirect — use ONLY our server
        }
        whois.lookup(domain, options, (err, data) => {
            if (err) return reject(err);
            resolve(data || '');
        });
    });
};

// ─── Per-TLD availability detection built from real response samples ──────────
// .com AVAILABLE: "No match for domain\"ZXQWERTY...\"." 
// .com TAKEN:     "Domain Name: google.com" 
// .ai  AVAILABLE: "Domain not found."
// .ai  TAKEN:     (empty or very short — privacy redacted)
// .pk  AVAILABLE: "Status: Not Registered" / "Available: Yes."
// .pk  TAKEN:     "Status: Domain is Registered"
// .co  → using RDAP HTTP 404/200
const isAvailableFromResponse = (domain, data) => {
    const tld = domain.split('.').pop();
    const text = (data || '').toLowerCase();

    if (tld === 'pk') {
        // PKNIC is explicit — check for the taken phrase first
        if (text.includes('domain is registered')) return false;
        if (text.includes('not registered') || text.includes('available: yes')) return true;
        return false; // default to taken if uncertain
    }

    if (tld === 'online') {
        if (text.includes('is available for registration')) return true;
        return false;
    }

    if (tld === 'ai') {
        // .ai WHOIS returns empty/blank for taken (privacy) and "Domain not found." for available
        if (text.includes('domain not found')) return true;
        if (text.trim().length < 30) return false; // empty = taken (privacy redacted)
        return false;
    }

    // Generic phrases for .com and other TLDs
    const AVAILABLE_PHRASES = [
        'no match for',
        'not found',
        'no data found',
        'no entries found',
        'is not registered',
        'domain not found',
        'status: free',
    ];
    return AVAILABLE_PHRASES.some(p => text.includes(p));
};

// ─── Lookup with 1 auto-retry on transient failure ───────────────────────────
const lookupWithRetry = async (domain) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            return await Promise.race([
                lookupDomain(domain),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 7000))
            ]);
        } catch (err) {
            if (attempt === 2) throw err;
            console.warn(`Retrying ${domain}: ${err.message}`);
            await delay(1200);
        }
    }
};

app.post(['/api/check', '/check'], async (req, res) => {
    const { names, tlds, domains: explicitDomains } = req.body;

    let allDomains = [];

    if (explicitDomains && Array.isArray(explicitDomains)) {
        // Retry mode: check only specific domain strings (e.g. ["lagra.co", "lavka.ai"])
        allDomains = explicitDomains.map(d => d.toLowerCase().trim());
    } else {
        if (!names || !tlds || !Array.isArray(names) || !Array.isArray(tlds)) {
            return res.status(400).json({ error: "Invalid request payload" });
        }
        // Normal mode: check all name x tld combinations
        for (const name of names) {
            for (const tld of tlds) {
                allDomains.push(`${name.toLowerCase().trim()}${tld}`);
            }
        }
    }

    // Prepare stream
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Reduced batch size to 5 to avoid triggering rate limits
    const BATCH_SIZE = 5;
    const total = allDomains.length;
    
    // Send initial metadata
    res.write(JSON.stringify({ type: 'start', total }) + '\n');
    
    for (let i = 0; i < allDomains.length; i += BATCH_SIZE) {
        const batch = allDomains.slice(i, i + BATCH_SIZE);
        
        // Process the batch concurrently but with a slight stagger
        const batchPromises = batch.map(async (domain, index) => {
            // Stagger each request by 200ms within the batch to prevent connection spikes
            await delay(index * 200);
            const tld = domain.split('.').pop();

            try {
                // Check if this TLD uses RDAP
                if (TLD_RDAP_SERVERS[tld]) {
                    const result = await Promise.race([
                        checkRdapDomain(domain, tld),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
                    ]);
                    return { domain, isAvailable: result === 'AVAILABLE', error: result === 'UNKNOWN' };
                }

                const data = await lookupWithRetry(domain);
                const isAvailable = isAvailableFromResponse(domain, data);
                return { domain, isAvailable, error: false };
            } catch (error) {
                console.error(`Error [${domain}]:`, error.message);
                return { domain, isAvailable: false, error: true, errorMessage: error.message };
            }
        });
        
        // Wait for the whole batch to finish
        const batchResults = await Promise.all(batchPromises);
        
        const checkedSoFar = Math.min(i + BATCH_SIZE, total);
        
        // Send batch results back to the client
        res.write(JSON.stringify({ type: 'batch', results: batchResults, checked: checkedSoFar, total }) + '\n');
        
        // Add a 1.5-second delay between batches to allow WHOIS servers to breathe
        if (checkedSoFar < total) {
            await delay(1500);
        }
    }

    res.write(JSON.stringify({ type: 'done' }) + '\n');
    res.end();
});

app.post(['/api/generate-names', '/generate-names'], async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    try {
        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.8,
            max_tokens: 400,
            messages: [
                {
                    role: 'system',
                    content: "You are a domain name generator. Based on the user's business description or name request, generate exactly 10 to 20 creative, short, and brandable domain name ideas (just the name part, no TLD). IMPORTANT: Your output MUST be ONLY a raw JSON array of strings. Do not include markdown, code blocks, or any other text. Example output: [\"shopify\",\"storefront\",\"quickshop\"]. If the user prompt is completely irrelevant, return an empty array []."
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
        });

        const responseText = completion.choices[0]?.message?.content || '[]';
        let names = [];
        try {
            // Strip markdown code blocks if present
            const cleaned = responseText.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
            names = JSON.parse(cleaned);
            if (!Array.isArray(names)) {
                names = names.names || Object.values(names)[0] || [];
            }
        } catch (e) {
            console.error('Failed to parse JSON:', responseText);
        }

        // Sanitize names: lowercased, only a-z0-9 and hyphens
        if (Array.isArray(names)) {
            names = names.map(n => n.toString().toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean);
        } else {
            names = [];
        }

        res.json({ names: names.slice(0, 20) });
    } catch (error) {
        console.error('Error generating names:', error);
        res.status(500).json({ error: error.message || 'Failed to generate names' });
    }
});

// ─── Static Page Routes ───────────────────────────────────────────────
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'public', 'about.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/privacy-policy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms-of-service.html')));
app.get('/terms-of-service', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms-of-service.html')));

// ─── 404 Fallback Handler ─────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

if (require.main === module) {
    const PORT = process.env.PORT || 5050;
    app.listen(PORT, () => {
        console.log(`Domain Checker Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;
