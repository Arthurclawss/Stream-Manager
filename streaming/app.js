/**
 * StreamManager - Streaming Account Reseller Controller
 * Pure Javascript, localStorage persistence, inline confirmation popovers.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Authentication Guard ---
    const token = localStorage.getItem('financadia_token');
    const username = localStorage.getItem('financadia_username');
    if (!token) {
        window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
        return;
    }

    // --- Application State ---
    let accounts = [];
    let customers = [];
    let activeTab = 'tab-dashboard';

    // --- DOM Elements ---
    const btnLogout = document.getElementById('btn-logout');
    const btnExport = document.getElementById('btn-export');
    const btnImportTrigger = document.getElementById('btn-import-trigger');
    const inputImport = document.getElementById('input-import');
    const navLinks = document.querySelectorAll('.nav-link');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const pageTitle = document.getElementById('page-title');
    const headerDate = document.getElementById('header-date');
    const themeToggle = document.getElementById('theme-toggle');

    // Modals
    const modalAccount = document.getElementById('modal-account');
    const modalCustomer = document.getElementById('modal-customer');
    const btnOpenModalAccount = document.getElementById('btn-open-modal-account');
    const btnOpenModalCustomer = document.getElementById('btn-open-modal-customer');
    const btnCloseModals = document.querySelectorAll('.btn-close-modal');

    // Forms
    const formAccount = document.getElementById('form-account');
    const formCustomer = document.getElementById('form-customer');

    // Account Form Fields
    const accId = document.getElementById('account-id');
    const accPlatform = document.getElementById('account-platform');
    const accCustomPlatformGroup = document.getElementById('group-custom-platform');
    const accCustomPlatformInput = document.getElementById('account-custom-platform');
    const accEmail = document.getElementById('account-email');
    const accPassword = document.getElementById('account-password');
    const accPlan = document.getElementById('account-plan');
    const accActivation = document.getElementById('account-activation');
    const accExpiry = document.getElementById('account-expiry');
    const accStatus = document.getElementById('account-status');
    const btnTogglePassword = document.querySelector('.btn-toggle-password');

    // Customer Form Fields
    const custId = document.getElementById('customer-id');
    const custName = document.getElementById('customer-name');
    const custPhone = document.getElementById('customer-phone');
    const custAccountLink = document.getElementById('customer-account-link');
    const custStartDate = document.getElementById('customer-start-date');

    // Dashboard Stats
    const statActiveCount = document.getElementById('stat-active-count');
    const statWarningCount = document.getElementById('stat-warning-count');
    const statExpiredCount = document.getElementById('stat-expired-count');
    const statCustomersCount = document.getElementById('stat-customers-count');
    const upcomingExpirationsList = document.getElementById('upcoming-expirations-list');
    const dashboardEmptyAlerts = document.getElementById('dashboard-empty-alerts');
    const tableUpcomingExpirations = document.getElementById('table-upcoming-expirations');

    // Filters
    const searchAccounts = document.getElementById('search-accounts');
    const filterPlatform = document.getElementById('filter-platform');
    const filterStatus = document.getElementById('filter-status');
    const accountsTableList = document.getElementById('accounts-table-list');
    const accountsEmptyState = document.getElementById('accounts-empty-state');

    const searchCustomers = document.getElementById('search-customers');
    const customersTableList = document.getElementById('customers-table-list');
    const customersEmptyState = document.getElementById('customers-empty-state');

    // --- Initialization ---
    initApp();

    function initApp() {
        // Set welcome message
        const welcomeEl = document.getElementById('user-welcome');
        if (welcomeEl && username) {
            welcomeEl.textContent = `Olá, ${username}`;
        }

        // Set current date in header
        updateHeaderDate();

        // Setup theme
        initTheme();

        // Setup navigation tabs
        setupNavigation();

        // Setup modals triggers
        setupModals();

        // Populate forms date fields defaults
        accActivation.value = getLocalTodayDate();
        accExpiry.value = getExpiryDefaultDate();
        custStartDate.value = getLocalTodayDate();

        // Platform dropdown listener to show "other" input
        accPlatform.addEventListener('change', handlePlatformChange);

        // Password visibility toggler
        btnTogglePassword.addEventListener('click', togglePasswordVisibility);

        // Filters listeners
        searchAccounts.addEventListener('input', updateAccountsTab);
        filterPlatform.addEventListener('change', updateAccountsTab);
        filterStatus.addEventListener('change', updateAccountsTab);
        searchCustomers.addEventListener('input', updateCustomersTab);

        // Core UI Update (Loads from local database with localStorage fallback)
        loadAllData();

        // Lucide
        if (window.lucide) {
            lucide.createIcons();
        }

        if (btnLogout) {
            btnLogout.addEventListener('click', handleLogout);
        }
        if (btnExport) {
            btnExport.addEventListener('click', exportBackup);
        }
        if (btnImportTrigger) {
            btnImportTrigger.addEventListener('click', () => inputImport.click());
        }
        if (inputImport) {
            inputImport.addEventListener('change', importBackup);
        }
    }

    function handleLogout() {
        localStorage.removeItem('financadia_token');
        localStorage.removeItem('financadia_username');
        window.location.href = '/login.html';
    }

    function exportBackup() {
        const backupData = { accounts, customers };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `streaming_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }

    function importBackup(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(event) {
            try {
                const importedData = JSON.parse(event.target.result);
                if (importedData && Array.isArray(importedData.accounts) && Array.isArray(importedData.customers)) {
                    if (confirm(`Tem certeza que deseja importar ${importedData.accounts.length} contas e ${importedData.customers.length} clientes? Isso substituirá seus registros atuais.`)) {
                        accounts = importedData.accounts;
                        customers = importedData.customers;
                        await saveAccounts();
                        await saveCustomers();
                        updateUI();
                        alert("Backup importado e sincronizado com sucesso!");
                    }
                } else {
                    alert("Formato de backup inválido. O arquivo deve conter contas e clientes.");
                }
            } catch (err) {
                alert("Erro ao ler o arquivo de backup: " + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    // --- Date Helpers ---
    function getLocalTodayDate() {
        const localDate = new Date();
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, '0');
        const day = String(localDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getExpiryDefaultDate() {
        const localDate = new Date();
        localDate.setDate(localDate.getDate() + 30); // 30 days from now
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, '0');
        const day = String(localDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function updateHeaderDate() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        headerDate.textContent = new Date().toLocaleDateString('pt-BR', options);
    }

    function formatDateBR(dateStr) {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    }

    function getDaysDifference(dateStr) {
        if (!dateStr) return 0;
        const today = new Date(getLocalTodayDate());
        const target = new Date(dateStr);
        // Reset time parts to check purely calendar days
        today.setHours(0, 0, 0, 0);
        target.setHours(0, 0, 0, 0);
        
        const diffTime = target - today;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // --- Dynamic Status Calculator ---
    function getAccountStatus(expiryDate) {
        const diff = getDaysDifference(expiryDate);
        if (diff < 0) return 'expired';
        if (diff <= 3) return 'warning';
        return 'active';
    }

    function getStatusLabel(status) {
        if (status === 'active') return 'Ativa';
        if (status === 'warning') return 'Vence em breve';
        return 'Vencida / Suspensa';
    }

    // --- Theme Manager ---
    function initTheme() {
        const savedTheme = localStorage.getItem('streammanager_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('streammanager_theme', newTheme);
    });

    // --- Navigation Tabs ---
    function setupNavigation() {
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                const targetTab = link.getAttribute('data-tab');
                
                // Toggle links
                navLinks.forEach(nl => nl.classList.remove('active'));
                link.classList.add('active');

                // Toggle panels
                tabPanels.forEach(panel => panel.classList.remove('active'));
                document.getElementById(targetTab).classList.add('active');

                activeTab = targetTab;
                
                // Update title
                if (targetTab === 'tab-dashboard') pageTitle.textContent = 'Painel Principal';
                else if (targetTab === 'tab-accounts') pageTitle.textContent = 'Contas e Telas';
                else if (targetTab === 'tab-customers') pageTitle.textContent = 'Clientes';

                // Refresh tab content
                updateUI();
            });
        });
    }

    // --- Modals Manager ---
    function setupModals() {
        // Open Modal Account (Add mode)
        btnOpenModalAccount.addEventListener('click', () => {
            formAccount.reset();
            accId.value = '';
            accCustomPlatformGroup.classList.add('hidden');
            document.getElementById('modal-account-title').textContent = 'Cadastrar Nova Conta';
            accActivation.value = getLocalTodayDate();
            accExpiry.value = getExpiryDefaultDate();
            modalAccount.classList.add('active');
        });

        // Open Modal Customer (Add mode)
        btnOpenModalCustomer.addEventListener('click', () => {
            formCustomer.reset();
            custId.value = '';
            document.getElementById('modal-customer-title').textContent = 'Cadastrar Novo Cliente';
            custStartDate.value = getLocalTodayDate();
            populateAccountsDropdown();
            modalCustomer.classList.add('active');
        });

        // Close Modals
        btnCloseModals.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                modalAccount.classList.remove('active');
                modalCustomer.classList.remove('active');
            });
        });

        // Close on overlay click
        [modalAccount, modalCustomer].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Form Account submit
        formAccount.addEventListener('submit', handleAccountSubmit);

        // Form Customer submit
        formCustomer.addEventListener('submit', handleCustomerSubmit);
    }

    function handlePlatformChange() {
        if (accPlatform.value === 'Outra') {
            accCustomPlatformGroup.classList.remove('hidden');
            accCustomPlatformInput.setAttribute('required', 'true');
        } else {
            accCustomPlatformGroup.classList.add('hidden');
            accCustomPlatformInput.removeAttribute('required');
        }
    }

    function togglePasswordVisibility() {
        const type = accPassword.getAttribute('type') === 'password' ? 'text' : 'password';
        accPassword.setAttribute('type', type);
        
        const icon = btnTogglePassword.querySelector('i');
        if (type === 'text') {
            icon.setAttribute('data-lucide', 'eye-off');
        } else {
            icon.setAttribute('data-lucide', 'eye');
        }
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // Populate Account select dropdown in Customer Modal
    function populateAccountsDropdown(selectedAccId = '') {
        custAccountLink.innerHTML = '<option value="">-- Nenhuma conta vinculada (Sem assinatura) --</option>';
        
        // Filter accounts that are either:
        // 1. Not linked to any customer
        // 2. OR is the account currently linked to this customer (when editing)
        accounts.forEach(acc => {
            const linkedCust = customers.find(c => c.accountId == acc.id);
            const isAvailable = !linkedCust || acc.id == selectedAccId;
            
            if (isAvailable) {
                const daysLeft = getDaysDifference(acc.expiryDate);
                const statusStr = daysLeft < 0 ? 'VENCIDA' : `${daysLeft}d restantes`;
                
                const option = document.createElement('option');
                option.value = acc.id;
                option.textContent = `${acc.platform} - ${acc.email} (${acc.plan} | ${statusStr})`;
                if (acc.id == selectedAccId) {
                    option.selected = true;
                }
                custAccountLink.appendChild(option);
            }
        });
    }

    // --- Submit Handlers ---
    function handleAccountSubmit(e) {
        e.preventDefault();

        let platformVal = accPlatform.value;
        if (platformVal === 'Outra') {
            platformVal = accCustomPlatformInput.value.trim() || 'Outra';
        }

        const emailVal = accEmail.value.trim();
        const passwordVal = accPassword.value.trim();
        const planVal = accPlan.value.trim();
        const activationVal = accActivation.value;
        const expiryVal = accExpiry.value;
        const idVal = accId.value;

        if (idVal) {
            // Edit mode
            const index = accounts.findIndex(a => a.id == idVal);
            if (index !== -1) {
                accounts[index] = {
                    ...accounts[index],
                    platform: platformVal,
                    email: emailVal,
                    password: passwordVal,
                    plan: planVal,
                    activationDate: activationVal,
                    expiryDate: expiryVal
                };
            }
        } else {
            // Add mode
            const newAcc = {
                id: Date.now(),
                platform: platformVal,
                email: emailVal,
                password: passwordVal,
                plan: planVal,
                activationDate: activationVal,
                expiryDate: expiryVal
            };
            accounts.push(newAcc);
        }

        saveAccounts();
        modalAccount.classList.remove('active');
        updateUI();
    }

    function handleCustomerSubmit(e) {
        e.preventDefault();

        const nameVal = custName.value.trim();
        const phoneVal = custPhone.value.trim().replace(/\D/g, ''); // Keep only numbers
        const accountIdVal = custAccountLink.value;
        const startDateVal = custStartDate.value;
        const idVal = custId.value;

        if (idVal) {
            // Edit mode
            const index = customers.findIndex(c => c.id == idVal);
            if (index !== -1) {
                customers[index] = {
                    ...customers[index],
                    name: nameVal,
                    phone: phoneVal,
                    accountId: accountIdVal ? parseInt(accountIdVal) : '',
                    startDate: startDateVal
                };
            }
        } else {
            // Add mode
            const newCust = {
                id: Date.now(),
                name: nameVal,
                phone: phoneVal,
                accountId: accountIdVal ? parseInt(accountIdVal) : '',
                startDate: startDateVal
            };
            customers.push(newCust);
        }

        saveCustomers();
        modalCustomer.classList.remove('active');
        updateUI();
    }

    // --- Edit Mode Activators ---
    function startEditAccount(acc) {
        accId.value = acc.id;
        
        // Handle platform dropdown and custom text input
        const presetPlatforms = ['Netflix', 'Prime Video', 'Disney+', 'Max', 'Paramount+', 'Spotify', 'Youtube', 'Claro TV', 'Vivo Play', 'Globoplay', 'Sky+', 'IPTV'];
        if (presetPlatforms.includes(acc.platform)) {
            accPlatform.value = acc.platform;
            accCustomPlatformGroup.classList.add('hidden');
        } else {
            accPlatform.value = 'Outra';
            accCustomPlatformGroup.classList.remove('hidden');
            accCustomPlatformInput.value = acc.platform;
        }

        accEmail.value = acc.email;
        accPassword.value = acc.password;
        accPlan.value = acc.plan;
        accActivation.value = acc.activationDate;
        accExpiry.value = acc.expiryDate;

        document.getElementById('modal-account-title').textContent = 'Editar Conta';
        modalAccount.classList.add('active');
    }

    function startEditCustomer(cust) {
        custId.value = cust.id;
        custName.value = cust.name;
        custPhone.value = cust.phone;
        custStartDate.value = cust.startDate;

        populateAccountsDropdown(cust.accountId);

        document.getElementById('modal-customer-title').textContent = 'Editar Cliente';
        modalCustomer.classList.add('active');
    }

    // --- Expiry Renewal (+30 days) ---
    function handleRenewAccount(accIdVal) {
        const index = accounts.findIndex(a => a.id == accIdVal);
        if (index !== -1) {
            const currentExpiry = accounts[index].expiryDate;
            const diffDays = getDaysDifference(currentExpiry);
            
            let baseDate = new Date();
            // If already expired, start from today. If active, add to existing expiry date.
            if (diffDays >= 0) {
                baseDate = new Date(currentExpiry);
            }
            
            // Add 30 calendar days
            baseDate.setDate(baseDate.getDate() + 30);
            
            const year = baseDate.getFullYear();
            const month = String(baseDate.getMonth() + 1).padStart(2, '0');
            const day = String(baseDate.getDate()).padStart(2, '0');
            
            accounts[index].expiryDate = `${year}-${month}-${day}`;
            
            saveAccounts();
            updateUI();
        }
    }

    // --- Deletions ---
    function executeDeleteAccount(id) {
        // Unlink customers associated with this account
        customers.forEach((cust, index) => {
            if (cust.accountId == id) {
                customers[index].accountId = '';
            }
        });
        saveCustomers();

        accounts = accounts.filter(a => a.id != id);
        saveAccounts();
        updateUI();
    }

    function executeDeleteCustomer(id) {
        customers = customers.filter(c => c.id != id);
        saveCustomers();
        updateUI();
    }

    // --- Local Server and LocalStorage persistence ---
    // --- Local Server and LocalStorage persistence ---
    async function saveAccounts() {
        localStorage.setItem('streaming_accounts', JSON.stringify(accounts));
        try {
            const response = await fetch('/api/streaming/accounts', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(accounts)
            });
            if (response.status === 401) {
                handleLogout();
            }
        } catch (e) {
            console.warn("Could not save accounts to local database server:", e);
        }
    }

    async function saveCustomers() {
        localStorage.setItem('streaming_customers', JSON.stringify(customers));
        try {
            const response = await fetch('/api/streaming/customers', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(customers)
            });
            if (response.status === 401) {
                handleLogout();
            }
        } catch (e) {
            console.warn("Could not save customers to local database server:", e);
        }
    }

    async function loadAllData() {
        try {
            // Fetch accounts
            const accRes = await fetch('/api/streaming/accounts', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (accRes.status === 401) {
                handleLogout();
                return;
            }

            let dbAccounts = [];
            if (accRes.ok) {
                dbAccounts = await accRes.json();
            } else {
                throw new Error("Accounts API failed");
            }

            // Fetch customers
            const custRes = await fetch('/api/streaming/customers', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (custRes.status === 401) {
                handleLogout();
                return;
            }

            let dbCustomers = [];
            if (custRes.ok) {
                dbCustomers = await custRes.json();
            } else {
                throw new Error("Customers API failed");
            }

            const localAccounts = JSON.parse(localStorage.getItem('streaming_accounts')) || [];
            const localCustomers = JSON.parse(localStorage.getItem('streaming_customers')) || [];

            // Auto-migration if local database files are empty and localStorage has existing data
            if (dbAccounts.length === 0 && dbCustomers.length === 0 && (localAccounts.length > 0 || localCustomers.length > 0)) {
                console.log("Migrating streaming accounts and customers from localStorage to local database server...");
                accounts = localAccounts;
                customers = localCustomers;
                await saveAccounts();
                await saveCustomers();
            } else {
                accounts = dbAccounts;
                customers = dbCustomers;
            }
        } catch (e) {
            console.warn("Server offline or error. Falling back to localStorage:", e);
            accounts = JSON.parse(localStorage.getItem('streaming_accounts')) || [];
            customers = JSON.parse(localStorage.getItem('streaming_customers')) || [];
        }
        updateUI();
    }

    // --- UI Update Coordination ---
    function updateUI() {
        // Recalculate metrics
        let activeCount = 0;
        let warningCount = 0;
        let expiredCount = 0;

        accounts.forEach(acc => {
            const status = getAccountStatus(acc.expiryDate);
            if (status === 'active') activeCount++;
            else if (status === 'warning') warningCount++;
            else expiredCount++;
        });

        // Set metrics
        statActiveCount.textContent = activeCount;
        statWarningCount.textContent = warningCount;
        statExpiredCount.textContent = expiredCount;
        statCustomersCount.textContent = customers.length;

        // Render based on active tab
        if (activeTab === 'tab-dashboard') {
            updateDashboardTab();
        } else if (activeTab === 'tab-accounts') {
            updateAccountsTab();
        } else if (activeTab === 'tab-customers') {
            updateCustomersTab();
        }

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // --- Render Tab: Dashboard ---
    function updateDashboardTab() {
        upcomingExpirationsList.innerHTML = '';

        // Accounts that are either expired or warning (vencendo em breve)
        const alerts = accounts.filter(acc => {
            const status = getAccountStatus(acc.expiryDate);
            return status === 'expired' || status === 'warning';
        });

        // Sort by expiration days (ascending: oldest/soonest first)
        alerts.sort((a, b) => getDaysDifference(a.expiryDate) - getDaysDifference(b.expiryDate));

        if (alerts.length === 0) {
            tableUpcomingExpirations.classList.add('hidden');
            dashboardEmptyAlerts.classList.remove('hidden');
            return;
        }

        tableUpcomingExpirations.classList.remove('hidden');
        dashboardEmptyAlerts.classList.add('hidden');

        alerts.forEach(acc => {
            const status = getAccountStatus(acc.expiryDate);
            const daysLeft = getDaysDifference(acc.expiryDate);
            const client = customers.find(c => c.accountId == acc.id);
            const clientName = client ? client.name : '<span style="color: var(--status-active); font-weight: 600;">Disponível</span>';

            let daysText = '';
            if (daysLeft < 0) {
                daysText = `Vencido há ${Math.abs(daysLeft)}d`;
            } else if (daysLeft === 0) {
                daysText = 'Vence hoje';
            } else {
                daysText = `Vence em ${daysLeft}d`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="platform-badge">
                        <span class="platform-icon ${getPlatformBgClass(acc.platform)}">${acc.platform[0]}</span>
                        ${acc.platform}
                    </div>
                </td>
                <td>${acc.email}</td>
                <td>${clientName}</td>
                <td>${acc.plan}</td>
                <td>${formatDateBR(acc.expiryDate)}</td>
                <td>
                    <span class="status-badge status-${status}">${daysText}</span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn-table-action btn-table-action-renew" title="Renovar (+30 dias)">
                            <i data-lucide="refresh-cw"></i>
                        </button>
                    </div>
                </td>
            `;

            // Action
            tr.querySelector('.btn-table-action-renew').addEventListener('click', () => handleRenewAccount(acc.id));

            upcomingExpirationsList.appendChild(tr);
        });
    }

    // --- Render Tab: Accounts ---
    function updateAccountsTab() {
        accountsTableList.innerHTML = '';
        const searchVal = searchAccounts.value.toLowerCase().trim();
        const platFilter = filterPlatform.value;
        const statusFilter = filterStatus.value;

        let filtered = accounts.filter(acc => {
            const status = getAccountStatus(acc.expiryDate);
            const client = customers.find(c => c.accountId == acc.id);
            const clientName = client ? client.name.toLowerCase() : '';

            // Search Filter
            const matchesSearch = 
                acc.email.toLowerCase().includes(searchVal) ||
                acc.platform.toLowerCase().includes(searchVal) ||
                acc.plan.toLowerCase().includes(searchVal) ||
                clientName.includes(searchVal);

            // Platform Filter
            const matchesPlatform = platFilter === 'all' || acc.platform === platFilter;

            // Status Filter
            let matchesStatus = true;
            if (statusFilter === 'active') matchesStatus = status === 'active';
            else if (statusFilter === 'warning') matchesStatus = status === 'warning';
            else if (statusFilter === 'expired') matchesStatus = status === 'expired';

            return matchesSearch && matchesPlatform && matchesStatus;
        });

        // Sort chronologically by expiry date
        filtered.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

        if (filtered.length === 0) {
            accountsEmptyState.classList.remove('hidden');
            return;
        }
        accountsEmptyState.classList.add('hidden');

        filtered.forEach(acc => {
            const status = getAccountStatus(acc.expiryDate);
            const client = customers.find(c => c.accountId == acc.id);
            const clientName = client ? client.name : '<span style="color: var(--status-active); font-weight: 600;">Disponível</span>';

            const tr = document.createElement('tr');
            tr.setAttribute('data-id', acc.id);
            
            tr.innerHTML = `
                <td>
                    <div class="platform-badge">
                        <span class="platform-icon ${getPlatformBgClass(acc.platform)}">${acc.platform[0]}</span>
                        ${acc.platform}
                    </div>
                </td>
                <td>
                    <div style="font-weight: 500;">${acc.email}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                        Senha: <span class="pass-hidden" title="Passe o mouse para revelar">${acc.password}</span>
                    </div>
                </td>
                <td>${acc.plan}</td>
                <td>${clientName}</td>
                <td>${formatDateBR(acc.expiryDate)}</td>
                <td>
                    <span class="status-badge status-${status}">${getStatusLabel(status)}</span>
                </td>
                <td class="cell-actions-target">
                    <div class="table-actions">
                        <button class="btn-table-action btn-table-action-renew" title="Renovar (+30 dias)">
                            <i data-lucide="refresh-cw"></i>
                        </button>
                        <button class="btn-table-action btn-table-action-edit" title="Editar conta">
                            <i data-lucide="edit-2"></i>
                        </button>
                        <button class="btn-table-action btn-table-action-delete" title="Excluir conta">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            `;

            // Actions setup
            tr.querySelector('.btn-table-action-renew').addEventListener('click', () => handleRenewAccount(acc.id));
            tr.querySelector('.btn-table-action-edit').addEventListener('click', () => startEditAccount(acc));
            
            // Delete with inline confirmation
            const btnDelete = tr.querySelector('.btn-table-action-delete');
            const btnEdit = tr.querySelector('.btn-table-action-edit');
            const btnRenew = tr.querySelector('.btn-table-action-renew');
            const actionsCell = tr.querySelector('.cell-actions-target');
            const actionsContainer = tr.querySelector('.table-actions');

            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const confirmContainer = document.createElement('div');
                confirmContainer.className = 'confirm-actions-wrapper';
                confirmContainer.innerHTML = `
                    <span class="confirm-label">Excluir?</span>
                    <button type="button" class="btn-table-action btn-table-action-confirm-yes" title="Confirmar exclusão">
                        <i data-lucide="check"></i>
                    </button>
                    <button type="button" class="btn-table-action btn-table-action-confirm-no" title="Cancelar">
                        <i data-lucide="x"></i>
                    </button>
                `;
                
                actionsContainer.classList.add('hidden');
                actionsCell.appendChild(confirmContainer);
                
                if (window.lucide) {
                    lucide.createIcons();
                }
                
                confirmContainer.querySelector('.btn-table-action-confirm-yes').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    executeDeleteAccount(acc.id);
                });
                
                confirmContainer.querySelector('.btn-table-action-confirm-no').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    confirmContainer.remove();
                    actionsContainer.classList.remove('hidden');
                });
            });

            accountsTableList.appendChild(tr);
        });
    }

    // --- Render Tab: Customers ---
    function updateCustomersTab() {
        customersTableList.innerHTML = '';
        const searchVal = searchCustomers.value.toLowerCase().trim();

        const filtered = customers.filter(cust => {
            const phoneStr = cust.phone || '';
            return cust.name.toLowerCase().includes(searchVal) || phoneStr.includes(searchVal);
        });

        filtered.sort((a, b) => a.name.localeCompare(b.name));

        if (filtered.length === 0) {
            customersEmptyState.classList.remove('hidden');
            return;
        }
        customersEmptyState.classList.add('hidden');

        filtered.forEach(cust => {
            const acc = accounts.find(a => a.id == cust.accountId);
            let accInfo = '<span style="color: var(--text-muted);">Nenhuma conta vinculada</span>';
            let waButtonHTML = '';

            if (acc) {
                const daysLeft = getDaysDifference(acc.expiryDate);
                const statusStr = daysLeft < 0 ? 'VENCIDA' : `${daysLeft}d restantes`;
                
                accInfo = `
                    <div style="font-weight: 500;">
                        <span class="platform-icon ${getPlatformBgClass(acc.platform)}" style="display:inline-flex; width:1.1rem; height:1.1rem; font-size:0.6rem; vertical-align:middle; margin-right:0.25rem;">${acc.platform[0]}</span>
                        ${acc.platform}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${acc.email} (${statusStr})</div>
                `;

                // Prefilled WhatsApp reminder
                if (cust.phone) {
                    let message = `Olá, ${cust.name}! Passando para lembrar que sua assinatura da plataforma ${acc.platform} (${acc.plan}) vence em ${formatDateBR(acc.expiryDate)}. `;
                    if (daysLeft < 0) {
                        message = `Olá, ${cust.name}! Sua assinatura da plataforma ${acc.platform} (${acc.plan}) venceu em ${formatDateBR(acc.expiryDate)}. `;
                    }
                    message += `Gostaria de realizar a renovação para continuar assistindo?`;
                    
                    const waLink = `https://wa.me/55${cust.phone}?text=${encodeURIComponent(message)}`;
                    waButtonHTML = `
                        <a href="${waLink}" target="_blank" class="btn-table-action btn-table-action-whatsapp" title="Enviar lembrete de vencimento no WhatsApp">
                            <i data-lucide="message-circle"></i>
                        </a>
                    `;
                }
            }

            const tr = document.createElement('tr');
            tr.setAttribute('data-id', cust.id);

            const phoneFormatted = cust.phone ? `(${cust.phone.substring(0,2)}) ${cust.phone.substring(2,7)}-${cust.phone.substring(7)}` : '<span style="color: var(--text-muted);">Não informado</span>';

            tr.innerHTML = `
                <td><span style="font-weight:600;">${cust.name}</span></td>
                <td>${phoneFormatted}</td>
                <td>${accInfo}</td>
                <td>${formatDateBR(cust.startDate)}</td>
                <td class="cell-actions-target">
                    <div class="table-actions">
                        ${waButtonHTML}
                        <button class="btn-table-action btn-table-action-edit" title="Editar cliente">
                            <i data-lucide="edit-2"></i>
                        </button>
                        <button class="btn-table-action btn-table-action-delete" title="Excluir cliente">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            `;

            // Actions setup
            tr.querySelector('.btn-table-action-edit').addEventListener('click', () => startEditCustomer(cust));

            // Delete with inline confirmation
            const btnDelete = tr.querySelector('.btn-table-action-delete');
            const btnEdit = tr.querySelector('.btn-table-action-edit');
            const actionsCell = tr.querySelector('.cell-actions-target');
            const actionsContainer = tr.querySelector('.table-actions');

            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const confirmContainer = document.createElement('div');
                confirmContainer.className = 'confirm-actions-wrapper';
                confirmContainer.innerHTML = `
                    <span class="confirm-label">Excluir?</span>
                    <button type="button" class="btn-table-action btn-table-action-confirm-yes" title="Confirmar exclusão">
                        <i data-lucide="check"></i>
                    </button>
                    <button type="button" class="btn-table-action btn-table-action-confirm-no" title="Cancelar">
                        <i data-lucide="x"></i>
                    </button>
                `;
                
                actionsContainer.classList.add('hidden');
                actionsCell.appendChild(confirmContainer);
                
                if (window.lucide) {
                    lucide.createIcons();
                }
                
                confirmContainer.querySelector('.btn-table-action-confirm-yes').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    executeDeleteCustomer(cust.id);
                });
                
                confirmContainer.querySelector('.btn-table-action-confirm-no').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    confirmContainer.remove();
                    actionsContainer.classList.remove('hidden');
                });
            });

            customersTableList.appendChild(tr);
        });
    }

    // Helper to style platform logo backgrounds
    function getPlatformBgClass(platform) {
        const plat = platform.toLowerCase();
        if (plat.includes('netflix')) return 'bg-netflix';
        if (plat.includes('prime') || plat.includes('amazon')) return 'bg-prime';
        if (plat.includes('disney')) return 'bg-disney';
        if (plat.includes('max') || plat.includes('hbo')) return 'bg-max';
        if (plat.includes('paramount')) return 'bg-paramount';
        if (plat.includes('spotify')) return 'bg-spotify';
        if (plat.includes('youtube')) return 'bg-youtube';
        if (plat.includes('claro')) return 'bg-claro';
        if (plat.includes('vivo')) return 'bg-vivo';
        if (plat.includes('globoplay')) return 'bg-globoplay';
        if (plat.includes('sky')) return 'bg-sky';
        if (plat.includes('iptv')) return 'bg-iptv';
        return 'bg-generic';
    }
});
