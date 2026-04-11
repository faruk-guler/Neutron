// Theme toggle functionality
document.addEventListener('DOMContentLoaded', function() {
    // Set theme based on cookie or system preference
    const savedTheme = getCookie('theme');
    const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            themeToggle.checked = savedTheme === 'dark';
        } else if (prefersDarkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.checked = true;
        }
        
        // Theme toggle event listener
        themeToggle.addEventListener('change', function(e) {
            const theme = e.target.checked ? 'dark' : 'light';
            document.getElementById('theme-form').querySelector('input[name="theme"]').value = theme;
            document.getElementById('theme-form').submit();
        });
    }
    
    // Mobile menu toggle
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', function() {
            document.querySelector('.sidebar').classList.toggle('active');
        });
    }
    
    // Initialize common components
    initializeTables();
});

// Helper function to get cookie value
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

// Basic Table functionality (if needed for inventory)
function initializeTables() {
    const tables = document.querySelectorAll('.data-table');
    
    tables.forEach(table => {
        // Add search functionality
        const tableContainer = table.closest('.data-table-container');
        if (tableContainer) {
            const searchInput = tableContainer.querySelector('.search-input');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    const searchText = searchInput.value.toLowerCase();
                    const rows = table.querySelectorAll('tbody tr');
                    rows.forEach(row => {
                        const text = row.textContent.toLowerCase();
                        row.style.display = text.includes(searchText) ? '' : 'none';
                    });
                });
            }
        }
    });
}

// Show a toast notification (Global helper)
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '❓';
    switch(type) {
        case 'success': icon = '✓'; break;
        case 'error': icon = '✗'; break;
        case 'warning': icon = '⚠'; break;
        case 'info': icon = 'ℹ'; break;
    }
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close">×</button>
    `;
    
    document.body.appendChild(toast);
    toast.offsetHeight;
    
    setTimeout(() => { toast.classList.add('show'); }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { if (toast.parentNode) document.body.removeChild(toast); }, 300);
    }, 5000);
    
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.classList.remove('show');
        setTimeout(() => { if (toast.parentNode) document.body.removeChild(toast); }, 300);
    });
}