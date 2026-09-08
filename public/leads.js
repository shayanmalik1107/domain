document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    
    const loginContainer = document.getElementById('login-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    const tableWrapper = document.getElementById('table-wrapper');
    const leadCount = document.getElementById('lead-count');

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

        // Extract headers from the first object keys (assuming uniform data)
        // Set collects all unique keys across all objects just in case
        const headersSet = new Set();
        data.forEach(row => {
            Object.keys(row).forEach(key => headersSet.add(key));
        });
        const headers = Array.from(headersSet);

        // Build Table HTML dynamically
        let html = '<table><thead><tr>';
        
        // Corner cell
        html += '<th class="row-num">#</th>';

        // Column Headers
        headers.forEach(header => {
            html += `<th>${escapeHtml(header)}</th>`;
        });
        html += '</tr></thead><tbody>';

        // Rows
        data.forEach((row, index) => {
            html += `<tr>`;
            html += `<td class="row-num">${index + 1}</td>`;
            headers.forEach(header => {
                const cellValue = row[header] !== undefined && row[header] !== null ? row[header] : '';
                html += `<td>${escapeHtml(String(cellValue))}</td>`;
            });
            html += `</tr>`;
        });

        html += '</tbody></table>';
        tableWrapper.innerHTML = html;
    }

    // Utility to prevent XSS if data contains HTML tags
    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
});
