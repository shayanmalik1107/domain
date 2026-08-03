const whois = require('whois');

// Known taken domains (definitely registered)
const TAKEN = {
    'online': 'casino.online',
    'agency': 'creative.agency',
};

// Known available domains (random garbage, definitely not registered)
const AVAILABLE = {
    'online': 'zxqwerty98765abcdef.online',
    'agency': 'zxqwerty98765abcdef.agency',
};

const TLD_WHOIS_SERVERS = {
    'pk': 'whois.pknic.net.pk',
    'co': 'whois.nic.co',
    'ai': 'whois.nic.ai',
};

const lookup = (domain) => new Promise((resolve, reject) => {
    const tld = domain.split('.').pop();
    const server = TLD_WHOIS_SERVERS[tld] || null;
    const options = { timeout: 8000 };
    if (server) options.server = server;
    whois.lookup(domain, options, (err, data) => {
        if (err) return reject(err);
        resolve(data);
    });
});

const separator = (label) => {
    console.log('\n' + '='.repeat(60));
    console.log(` ${label}`);
    console.log('='.repeat(60));
};

(async () => {
    const tlds = ['online', 'agency'];

    for (const tld of tlds) {
        // --- TAKEN ---
        const takenDomain = TAKEN[tld];
        separator(`TAKEN: ${takenDomain}`);
        try {
            const res = await lookup(takenDomain);
            // Print first 30 lines only (enough to see the pattern)
            const lines = res.split('\n').slice(0, 30).join('\n');
            console.log(lines);
        } catch (e) {
            console.log(`ERROR: ${e.message}`);
        }

        await new Promise(r => setTimeout(r, 1500));

        // --- AVAILABLE ---
        const availDomain = AVAILABLE[tld];
        separator(`AVAILABLE: ${availDomain}`);
        try {
            const res = await lookup(availDomain);
            const lines = res.split('\n').slice(0, 30).join('\n');
            console.log(lines);
        } catch (e) {
            console.log(`ERROR: ${e.message}`);
        }

        await new Promise(r => setTimeout(r, 1500));
    }

    console.log('\n\nDone. Use the responses above to build detection logic.');
})();
