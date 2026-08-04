import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get, set, push, child } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC4gHkaYop8l1uFfvE2Y2IjiQSmATJoAOk",
  authDomain: "domain-checker-20477.firebaseapp.com",
  projectId: "domain-checker-20477",
  storageBucket: "domain-checker-20477.firebasestorage.app",
  messagingSenderId: "895848788559",
  appId: "1:895848788559:web:a31de9ebbf935f2710b03a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Toast Notification System
function showToast(message, type = 'error', title = null) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg class="toast-icon" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    } else if (type === 'warning') {
        iconSvg = `<svg class="toast-icon" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
    } else {
        iconSvg = `<svg class="toast-icon" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    }

    if (!title) {
        if (type === 'success') title = 'Success';
        else if (type === 'warning') title = 'Warning';
        else title = 'Error';
    }

    toast.innerHTML = `
        ${iconSvg}
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        toast.remove();
    });

    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);

    container.appendChild(toast);
}

// Friendly Firebase Auth Error Message helper
function getFriendlyAuthError(err) {
    const code = err.code || '';
    switch (code) {
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
            return 'Invalid email or password. Please try again.';
        case 'auth/user-not-found':
            return 'No account exists with this email address.';
        case 'auth/wrong-password':
            return 'Incorrect password. Please try again.';
        case 'auth/email-already-in-use':
            return 'This email address is already in use by another account.';
        case 'auth/weak-password':
            return 'Password is too weak. It must be at least 6 characters.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/popup-closed-by-user':
            return 'Sign-in window closed before authentication completed.';
        default:
            return err.message || 'An unexpected authentication error occurred.';
    }
}

const checkBtn = document.getElementById('check-btn');
const nameInput = document.getElementById('domain-names');
const resultsPanel = document.getElementById('results-panel');
const tableHeaderRow = document.getElementById('results-table-header');
const tableBody = document.getElementById('results-table-body');
const statsContainer = document.getElementById('stats-container');
const tldCheckboxes = document.querySelectorAll('input[type="checkbox"]');

// AI Elements
const aiPromptInput = document.getElementById('ai-prompt');
const aiGenerateBtn = document.getElementById('ai-generate-btn');
const aiBtnText = aiGenerateBtn?.querySelector('.ai-btn-text');
const aiLoader = aiGenerateBtn?.querySelector('.ai-loader');

// Auth Elements
const authOverlay = document.getElementById('auth-overlay');
const appContainer = document.getElementById('app-container');
const googleSigninBtn = document.getElementById('google-signin-btn');
const emailSigninBtn = document.getElementById('email-signin-btn');
const emailSignupBtn = document.getElementById('email-signup-btn');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const closeAuthBtn = document.getElementById('close-auth-btn');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const historyBtn = document.getElementById('history-btn');
const userEmailSpan = document.getElementById('user-email');

// History Drawer Elements
const historyDrawer = document.getElementById('history-drawer');
const historyOverlay = document.getElementById('history-overlay');
const closeDrawerBtn = document.getElementById('close-drawer-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const aiHistoryList = document.getElementById('ai-history-list');
const domainsHistoryList = document.getElementById('domains-history-list');

let currentUser = null;

// ─── Authentication ────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authOverlay.classList.add('hidden');
        userEmailSpan.style.display = 'inline';
        userEmailSpan.textContent = user.email;
        logoutBtn.style.display = 'inline-block';
        loginBtn.style.display = 'none';
    } else {
        currentUser = null;
        userEmailSpan.style.display = 'none';
        userEmailSpan.textContent = '';
        logoutBtn.style.display = 'none';
        loginBtn.style.display = 'inline-block';
    }
});

loginBtn.addEventListener('click', () => authOverlay.classList.remove('hidden'));
closeAuthBtn.addEventListener('click', () => authOverlay.classList.add('hidden'));

historyBtn.addEventListener('click', () => {
    if (!currentUser) {
        authOverlay.classList.remove('hidden');
    } else {
        historyOverlay.classList.remove('hidden');
        historyDrawer.classList.remove('closed');
        loadHistory();
    }
});

closeDrawerBtn.addEventListener('click', () => {
    historyOverlay.classList.add('hidden');
    historyDrawer.classList.add('closed');
});
historyOverlay.addEventListener('click', () => {
    historyOverlay.classList.add('hidden');
    historyDrawer.classList.add('closed');
});

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const activePanel = document.getElementById(btn.dataset.tab);
        if (activePanel) {
            activePanel.classList.add('active');
            activePanel.classList.remove('hidden'); // Safeguard against cached HTML classes
        }
    });
});

async function loadHistory() {
    if (!currentUser) return;
    
    // Clear and set to default empty state before fetching
    aiHistoryList.innerHTML = '<div class="empty-state">No AI history found.</div>';
    domainsHistoryList.innerHTML = '<div class="empty-state">No domain checks found.</div>';
    
    const dbRef = ref(db);
    try {
        const snap = await get(child(dbRef, `user_history/${currentUser.uid}`));
        const data = snap.exists() ? snap.val() : {};
        
        // AI Prompts
        if (data.ai_prompts) {
            const prompts = Object.values(data.ai_prompts).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
            aiHistoryList.innerHTML = prompts.map(p => {
                const names = Array.isArray(p.names) ? p.names : (p.names ? Object.values(p.names) : []);
                const dateStr = p.timestamp ? new Date(p.timestamp).toLocaleString() : 'Unknown Date';
                return `
                    <div class="history-item">
                        <div class="history-item-header"><span>${dateStr}</span></div>
                        <div class="history-item-content"><strong>Prompt:</strong> ${p.prompt || ''}</div>
                        <div class="history-item-content" style="margin-top:8px; font-size:0.85rem; color:var(--text-muted);">${names.join(', ')}</div>
                    </div>
                `;
            }).join('');
        }
        
        // Domain Checks
        if (data.domain_checks) {
            const checks = Object.values(data.domain_checks).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
            domainsHistoryList.innerHTML = checks.map(c => {
                const domains = Array.isArray(c.domains) ? c.domains : (c.domains ? Object.values(c.domains) : []);
                const dateStr = c.timestamp ? new Date(c.timestamp).toLocaleString() : 'Unknown Date';
                return `
                    <div class="history-item">
                        <div class="history-item-header"><span>${dateStr}</span></div>
                        <div class="history-domains">
                            ${domains.map(d => `<span class="history-domain-badge">${d}</span>`).join('')}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (e) {
        console.error("Error loading history", e);
    }
}

emailSigninBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value;
    if (!email || !pass) {
        showToast('Enter email and password', 'warning');
        return;
    }
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
        showToast(getFriendlyAuthError(err), 'error');
    }
});

emailSignupBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value;
    if (!email || !pass) {
        showToast('Enter email and password', 'warning');
        return;
    }
    try {
        await createUserWithEmailAndPassword(auth, email, pass);
    } catch (err) {
        showToast(getFriendlyAuthError(err), 'error');
    }
});

googleSigninBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Auth error:", error);
        showToast(getFriendlyAuthError(error), 'error');
    }
});

logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

// ─── Utilities ─────────────────────────────────────────────────────────────
const sortTlds = (tlds) => [...tlds].sort((a, b) => b.length - a.length);

async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── State ─────────────────────────────────────────────────────────────────
let currentTlds = [];
let stats = { checked: 0, available: 0, taken: 0, errors: 0 };
let lastPrompt = '';
let lastGeneratedNames = [];

// ─── AI Generate Button ───────────────────────────────────────────────────
if (aiGenerateBtn) {
    aiGenerateBtn.addEventListener('click', async () => {
        const prompt = aiPromptInput.value.trim();
        if (!prompt) {
            showToast('Please describe your business first.', 'warning');
            return;
        }

        if (prompt === lastPrompt && lastGeneratedNames.length > 0) {
            nameInput.value = lastGeneratedNames.join('\n');
            checkBtn.click();
            return;
        }

        aiGenerateBtn.disabled = true;
        aiBtnText.textContent = 'Generating...';
        aiLoader.classList.remove('hidden');

        try {
            const promptHash = await hashString(prompt);
            const dbRef = ref(db);
            
            // Check cache
            const snapshot = await get(child(dbRef, `ai_cache/${promptHash}`));
            let names = [];
            
            if (snapshot.exists()) {
                console.log("Loaded AI generated names from Firebase Cache!");
                names = snapshot.val().names;
            } else {
                console.log("Not in cache, calling Groq AI API...");
                const response = await fetch('/api/generate-names', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt })
                });

                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(data.error || `Failed to generate names (Status: ${response.status})`);
                }
                
                if (!data.names || data.names.length === 0) {
                    showToast('AI could not generate names. Please refine your description.', 'warning');
                    return;
                }
                names = data.names;
                
                // Save to cache
                await set(ref(db, `ai_cache/${promptHash}`), {
                    prompt: prompt,
                    names: names,
                    timestamp: Date.now(),
                    userId: currentUser ? currentUser.uid : 'guest'
                });
                
                // Save to user history if logged in
                if (currentUser) {
                    push(ref(db, `user_history/${currentUser.uid}/ai_prompts`), {
                        prompt: prompt,
                        names: names,
                        timestamp: Date.now()
                    });
                }
            }

            lastPrompt = prompt;
            lastGeneratedNames = names;
            
            nameInput.value = names.join('\n');
            checkBtn.click();
        } catch (err) {
            console.error('AI Generation Error:', err);
            showToast(err.message || 'Error generating names.', 'error');
        } finally {
            aiGenerateBtn.disabled = false;
            aiBtnText.textContent = 'Generate Names & Check';
            aiLoader.classList.add('hidden');
        }
    });
}

// ─── Main check button ────────────────────────────────────────────────────
checkBtn.addEventListener('click', async () => {
    const rawNames = nameInput.value;
    if (!rawNames.trim()) {
        showToast('Please enter at least one name.', 'warning');
        return;
    }

    const names = [...new Set(rawNames.split(/[,\s]+/).map(n => n.trim().toLowerCase()).filter(Boolean))];
    if (names.length > 50) {
        showToast('Please enter a maximum of 50 names.', 'warning');
        return;
    }

    currentTlds = sortTlds(
        Array.from(tldCheckboxes).filter(cb => cb.checked).map(cb => cb.value)
    );
    if (currentTlds.length === 0) {
        showToast('Please select at least one TLD.', 'warning');
        return;
    }

    stats = { checked: 0, available: 0, taken: 0, errors: 0 };
    buildTable(names, currentTlds);
    resultsPanel.classList.remove('hidden');

    const allDomains = [];
    names.forEach(name => {
        currentTlds.forEach(tld => {
            allDomains.push(`${name}${tld}`);
        });
    });

    setLoading(true, `Checking 0/${allDomains.length}`);
    updateStats(false);

    const dbRef = ref(db);
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const uncachedDomains = [];

    // Check Firebase Cache for each domain
    for (const domain of allDomains) {
        const safeDomain = domain.replace(/\./g, '_'); // Firebase keys can't have periods
        try {
            const snapshot = await get(child(dbRef, `domain_cache/${safeDomain}`));
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (now - data.timestamp < ONE_WEEK_MS) {
                    // Valid cache hit
                    console.log(`Cache hit for ${domain}:`, data.status);
                    applyResult({
                        domain: domain,
                        isAvailable: data.status === 'available',
                        error: false
                    });
                    continue;
                } else {
                    console.log(`Cache expired for ${domain}`);
                }
            }
        } catch (e) {
            console.error("Firebase read error for", domain, e);
        }
        
        // If we reach here, it wasn't in cache or expired
        uncachedDomains.push(domain);
    }

    // Call API only for uncached domains
    if (uncachedDomains.length > 0) {
        await streamCheck({ domains: uncachedDomains }, allDomains.length);
    } else {
        // Everything was cached
        setLoading(false);
        updateStats(true);
    }
    
    // Save to user history if logged in
    if (currentUser) {
        push(ref(db, `user_history/${currentUser.uid}/domain_checks`), {
            domains: allDomains,
            timestamp: Date.now()
        });
    }
});

// ─── Build full fresh table ───────────────────────────────────────────────
function buildTable(names, tlds) {
    tableHeaderRow.innerHTML = '<th>Name</th>';
    tlds.forEach(tld => {
        const th = document.createElement('th');
        th.textContent = tld;
        tableHeaderRow.appendChild(th);
    });

    tableBody.innerHTML = '';
    names.forEach(name => {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.className = 'domain-name-cell';
        tdName.textContent = name;
        tr.appendChild(tdName);

        tlds.forEach(tld => {
            const td = document.createElement('td');
            td.id = cellId(name, tld);
            td.dataset.domain = `${name}${tld}`;
            setPending(td);
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });
}

// ─── Stream check API ─────────────────────────────────────────────────────
async function streamCheck(payload, totalDomains) {
    try {
        const response = await fetch('/api/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Network error');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            for (let i = 0; i < lines.length - 1; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const data = JSON.parse(line);

                if (data.type === 'batch') {
                    setLoading(true, `Checking ${stats.available + stats.taken + stats.errors + data.results.length}/${totalDomains}`);
                    
                    for (const item of data.results) {
                        applyResult(item);
                        // Save successfully checked domains to Firebase
                        if (!item.error) {
                            const safeDomain = item.domain.replace(/\./g, '_');
                            set(ref(db, `domain_cache/${safeDomain}`), {
                                status: item.isAvailable ? 'available' : 'taken',
                                timestamp: Date.now()
                            }).catch(e => console.error("Cache write error", e));
                        }
                    }
                    updateStats(false);
                }
            }
            buffer = lines[lines.length - 1];
        }

    } catch (err) {
        console.error(err);
    } finally {
        tableBody.querySelectorAll('td[data-status="pending"]').forEach(cell => {
            setError(cell);
            stats.errors++;
        });
        updateStats(true);
        setLoading(false);
    }
}

// ─── Retry: only re-check specific errored domains ────────────────────────
function attachRetryHandler() {
    const btn = document.getElementById('retry-errors-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const errorCells = tableBody.querySelectorAll('td[data-status="error"]');
        if (!errorCells.length) return;

        const domainsToRetry = [];
        errorCells.forEach(cell => {
            const domain = cell.dataset.domain;
            if (domain) {
                domainsToRetry.push(domain);
                setPending(cell);
                stats.errors--;
            }
        });

        updateStats(false);
        if (!domainsToRetry.length) return;

        const totalDomains = stats.available + stats.taken + stats.errors + domainsToRetry.length;
        await streamCheck({ domains: domainsToRetry }, totalDomains);
    });
}

// ─── Apply a single result to its table cell ─────────────────────────────
function applyResult(item) {
    const domain = item.domain;
    const tld = matchTld(domain, currentTlds);
    if (!tld) return;

    const name = domain.slice(0, -tld.length);
    const cell = document.getElementById(cellId(name, tld));
    if (!cell) return;

    const prevStatus = cell.dataset.status;

    if (item.error) {
        setError(cell);
        if (prevStatus !== 'error') stats.errors++;
        if (prevStatus === 'available') stats.available--;
        if (prevStatus === 'taken') stats.taken--;
    } else if (item.isAvailable) {
        setAvailable(cell);
        if (prevStatus === 'error') stats.errors--;
        if (prevStatus === 'taken') stats.taken--;
        if (prevStatus !== 'available') stats.available++;
    } else {
        setTaken(cell);
        if (prevStatus === 'error') stats.errors--;
        if (prevStatus === 'available') stats.available--;
        if (prevStatus !== 'taken') stats.taken++;
    }

    stats.checked = Math.max(stats.checked, stats.available + stats.taken + stats.errors);
}

// ─── Cell state setters ───────────────────────────────────────────────────
function setPending(cell) {
    cell.dataset.status = 'pending';
    cell.innerHTML = `<span class="status-badge pending"><div class="status-dot"></div>Pending</span>`;
}
function setAvailable(cell) {
    cell.dataset.status = 'available';
    cell.innerHTML = `<span class="status-badge available"><div class="status-dot"></div>Avb</span>`;
}
function setTaken(cell) {
    cell.dataset.status = 'taken';
    cell.innerHTML = `<span class="status-badge unavailable"><div class="status-dot"></div>Taken</span>`;
}
function setError(cell) {
    cell.dataset.status = 'error';
    cell.innerHTML = `<span class="status-badge error"><div class="status-dot"></div>Error</span>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function cellId(name, tld) {
    const safeName = name.replace(/[^a-z0-9-]/g, '');
    const safeTld  = tld.replace(/[^a-z0-9]/g, '');
    return `cell-${safeName}-${safeTld}`;
}

function matchTld(domain, tlds) {
    const sorted = sortTlds(tlds);
    for (const tld of sorted) {
        if (domain.endsWith(tld)) return tld;
    }
    return null;
}

function setLoading(isLoading, text = 'Checking...') {
    const btnText = checkBtn.querySelector('.btn-text');
    const loader  = checkBtn.querySelector('.loader');
    if (isLoading) {
        checkBtn.disabled = true;
        btnText.textContent = text;
        loader.classList.remove('hidden');
    } else {
        checkBtn.disabled = false;
        btnText.textContent = 'Check Availability';
        loader.classList.add('hidden');
    }
}

function updateStats(streamDone) {
    statsContainer.innerHTML = `
        <div class="stat-item">
            <span class="stat-value">${stats.available + stats.taken + stats.errors}</span>
            <span class="stat-label">Checked</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
            <span class="stat-value val-success">${stats.available}</span>
            <span class="stat-label">Available</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
            <span class="stat-value val-error">${stats.taken}</span>
            <span class="stat-label">Taken</span>
        </div>
        ${stats.errors > 0 ? `
        <div class="stat-divider"></div>
        <div class="stat-item stat-item-retry">
            <div>
                <span class="stat-value val-warning">${stats.errors}</span>
                <span class="stat-label">Errors</span>
            </div>
            ${streamDone ? `<button id="retry-errors-btn" class="retry-btn">↻ Retry</button>` : ''}
        </div>` : ''}
    `;
    if (streamDone && stats.errors > 0) attachRetryHandler();
}
