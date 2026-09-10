document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');

    const loginContainer = document.getElementById('login-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    const tableWrapper = document.getElementById('table-wrapper');
    const leadCount = document.getElementById('lead-count');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const eyeIcon = document.getElementById('eye-icon');

    // Toggle Password Visibility
    togglePasswordBtn.addEventListener('click', () => {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            // Eye-off icon
            eyeIcon.innerHTML = '<path d="m2 2 20 20"/><path d="M6.71 6.71a10 10 0 0 0-4.71 5.29s3 7 10 7a10 10 0 0 0 5.29-1.54"/><path d="M12 15a3 3 0 0 1-3-3"/><path d="M10.7 5.3A10 10 0 0 1 12 5c7 0 10 7 10 7a10.1 10.1 0 0 1-2.3 3.7"/>';
        } else {
            passwordInput.type = 'password';
            // Eye icon
            eyeIcon.innerHTML = '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
        }
    });

    // Handle Login
    loginBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            showError('Please enter both username and password.');
            return;
        }

        loginBtn.textContent = 'Authenticating...';
        loginBtn.disabled = true;
        loginError.style.display = 'none';

        try {
            const response = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                showError(data.error || 'Authentication failed.');
                loginBtn.textContent = 'Secure Login';
                loginBtn.disabled = false;
                return;
            }

            // Success! Transition to dashboard
            loginContainer.style.display = 'none';
            dashboardContainer.style.display = 'flex';

            allLeads = data.data || [];
            if (data.headers && data.headers.length > 0) {
                exactHeaders = data.headers;
            }
            updateTabs();
            renderTable();

        } catch (error) {
            showError('Network error. Please try again later.');
            loginBtn.textContent = 'Secure Login';
            loginBtn.disabled = false;
        }
    });

    // Handle Enter key for login
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') passwordInput.focus();
    });

    function showError(msg) {
        loginError.textContent = msg;
        loginError.style.display = 'block';
    }

    let allLeads = [];
    let exactHeaders = [];
    let currentTab = 'not_sent';
    let isTestMode = false;

    // Handle Test Mode Toggle
    const testModeToggle = document.getElementById('test-mode-toggle');
    if (testModeToggle) {
        testModeToggle.addEventListener('change', (e) => {
            isTestMode = e.target.checked;
            updateTabs(); // Update counts
            renderTable(); // Re-render instantly
        });
    }

    // Handle Tab Clicks
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.getAttribute('data-tab');
            updateActionButtons();
            renderTable();
        });
    });

    const startSenderBtn = document.getElementById('start-sender-btn');

    function updateActionButtons() {
        if (currentTab === 'not_sent') {
            startSenderBtn.textContent = 'Start Sender';
            startSenderBtn.style.display = 'block';
        } else if (currentTab === 'sent') {
            startSenderBtn.textContent = 'Send Follow-up 1';
            startSenderBtn.style.display = 'block';
        } else if (currentTab === 'fu1') {
            startSenderBtn.textContent = 'Send Follow-up 2';
            startSenderBtn.style.display = 'block';
        } else if (currentTab === 'fu2') {
            startSenderBtn.textContent = 'Send Follow-up 3';
            startSenderBtn.style.display = 'block';
        } else {
            startSenderBtn.style.display = 'none';
        }
    }

    function getFilteredLeads() {
        return allLeads.filter(lead => {
            const isCorrectMode = isTestMode ? lead.is_test === true : !lead.is_test;
            return isCorrectMode;
        });
    }

    function updateTabs() {
        const relevantLeads = getFilteredLeads();
        const counts = {
            not_sent: 0,
            sent: 0,
            opened: 0,
            response: 0,
            fu1: 0,
            fu2: 0,
            fu3: 0
        };

        relevantLeads.forEach(lead => {
            if (counts[lead.status] !== undefined) {
                counts[lead.status]++;
            }
            if (lead.opened === true) {
                counts.opened++;
            }
        });

        // Map titles to keys
        const titles = {
            not_sent: 'Not Sent',
            sent: 'Sent',
            opened: 'Opened',
            response: 'Response',
            fu1: 'Follow Up 1',
            fu2: 'Follow Up 2',
            fu3: 'Follow Up 3'
        };

        tabBtns.forEach(btn => {
            const tabKey = btn.getAttribute('data-tab');
            if (counts[tabKey] !== undefined) {
                btn.textContent = `${titles[tabKey]} (${counts[tabKey].toLocaleString()})`;
            }
        });

        leadCount.textContent = `(${relevantLeads.length.toLocaleString()} records total)`;
    }

    // Handle Action Button
    if (startSenderBtn) {
        startSenderBtn.addEventListener('click', async () => {
            if (!confirm(`Are you sure you want to start the ${isTestMode ? 'TEST ' : ''}background engine for ${currentTab}?`)) return;
            
            startSenderBtn.textContent = 'Starting...';
            startSenderBtn.disabled = true;

            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();

            let endpoint = '/api/leads/send';
            let payload = { username, password, testMode: isTestMode };

            if (currentTab === 'sent') {
                endpoint = '/api/leads/followup';
                payload.targetStatus = 'fu1';
            } else if (currentTab === 'fu1') {
                endpoint = '/api/leads/followup';
                payload.targetStatus = 'fu2';
            } else if (currentTab === 'fu2') {
                endpoint = '/api/leads/followup';
                payload.targetStatus = 'fu3';
            }

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (!response.ok) {
                    alert(data.error || 'Failed to trigger sender.');
                }
            } catch (err) {
                alert('Network error. Failed to trigger sender.');
            }

            updateActionButtons();
            startSenderBtn.disabled = false;
        });
    }

    async function fetchLeadsSilently() {
        if (dashboardContainer.style.display !== 'flex') return;
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        try {
            const response = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            if (response.ok) {
                const data = await response.json();
                allLeads = data.data || [];
                if (data.headers && data.headers.length > 0) {
                    exactHeaders = data.headers;
                }
                updateTabs();
                renderTable();
            }
        } catch (e) {
            // Ignore polling errors
        }
    }

    // Start Real-Time polling every 3 seconds
    setInterval(fetchLeadsSilently, 3000);

    function renderTable() {
        const relevantLeads = getFilteredLeads();
        const data = currentTab === 'opened' 
            ? relevantLeads.filter(lead => lead.opened === true) 
            : relevantLeads.filter(lead => lead.status === currentTab);

        
        if (!data || data.length === 0) {
            tableWrapper.innerHTML = `<div class="loading-state">No records found for status: ${currentTab.replace('_', ' ')}.</div>`;
            return;
        }

        // If backend provided exact headers, use them. Otherwise fallback to dynamically scanning keys.
        let headers = [];
        if (exactHeaders.length > 0) {
            headers = exactHeaders;
        } else {
            const headersSet = new Set();
            data.forEach(row => {
                Object.keys(row).forEach(key => {
                    if (!['id', 'history', 'status', 'is_test', 'mailbox_used', 'last_contacted_at'].includes(key)) {
                        headersSet.add(key);
                    }
                });
            });
            headers = Array.from(headersSet);
        }

        // Setup DOM for native HTML table
        let domHtml = '<table><thead><tr>';
        domHtml += '<th class="row-num">#</th>';

        headers.forEach(header => {
            domHtml += `<th>${escapeHtml(String(header))}</th>`;
        });
        domHtml += '</tr></thead><tbody>';
        
        // LIMIT TO 150 ROWS TO PREVENT BROWSER FREEZING
        const maxRows = 150;
        const displayData = data.slice(0, maxRows);

        // Build array of string rows
        displayData.forEach((row, index) => {
            domHtml += `<tr><td class="row-num">${index + 1}</td>`;
            headers.forEach(header => {
                const cellValue = row[header] !== undefined && row[header] !== null ? row[header] : '';
                domHtml += `<td>${escapeHtml(String(cellValue))}</td>`;
            });
            domHtml += `</tr>`;
        });

        if (data.length > maxRows) {
            domHtml += `<tr><td colspan="${headers.length + 1}" style="text-align: center; padding: 15px; color: var(--text-muted); font-size: 0.85rem;">Showing first ${maxRows} rows of ${data.length} to maintain performance...</td></tr>`;
        }

        domHtml += '</tbody></table>';
        tableWrapper.innerHTML = domHtml;
    }

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') unsafe = String(unsafe);
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
