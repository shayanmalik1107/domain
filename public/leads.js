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

            renderTable(data.data);
            leadCount.textContent = `(${data.count.toLocaleString()} records)`;

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

    function renderTable(data) {
        if (!data || data.length === 0) {
            tableWrapper.innerHTML = '<div class="loading-state">No records found in the Excel file.</div>';
            return;
        }

        const headersSet = new Set();
        data.forEach(row => {
            Object.keys(row).forEach(key => headersSet.add(key));
        });
        const headers = Array.from(headersSet);

        // Setup DOM for Clusterize
        let domHtml = '<div id="scrollArea" class="clusterize-scroll" style="flex: 1; min-height: 0; width: 100%; overflow: auto;"><table><thead><tr>';
        domHtml += '<th class="row-num">#</th>';

        headers.forEach(header => {
            domHtml += `<th>${escapeHtml(String(header))}</th>`;
        });
        domHtml += '</tr></thead><tbody id="contentArea" class="clusterize-content">';
        domHtml += '</tbody></table></div>';
        
        tableWrapper.innerHTML = domHtml;

        // Build array of string rows for the virtual list
        const rowsArray = data.map((row, index) => {
            let trHtml = `<tr><td class="row-num">${index + 1}</td>`;
            headers.forEach(header => {
                const cellValue = row[header] !== undefined && row[header] !== null ? row[header] : '';
                trHtml += `<td>${escapeHtml(String(cellValue))}</td>`;
            });
            trHtml += `</tr>`;
            return trHtml;
        });

        // Initialize Virtual Scrolling AFTER a short delay to ensure flexbox height calculation is complete
        setTimeout(() => {
            new Clusterize({
                rows: rowsArray,
                scrollId: 'scrollArea',
                contentId: 'contentArea'
            });
        }, 100);
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
