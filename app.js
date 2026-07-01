/**
 * FinançaDia - Daily Sales and Finance Control Logic
 * Pure Javascript, clean DOM manipulation, Chart.js integration.
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
    let transactions = [];
    let selectedDate = getLocalTodayDate();
    let showAll = false;
    let chartInstance = null;

    // --- DOM Elements ---
    const btnLogout = document.getElementById('btn-logout');
    const btnExport = document.getElementById('btn-export');
    const btnImportTrigger = document.getElementById('btn-import-trigger');
    const inputImport = document.getElementById('input-import');
    
    // Notifications DOM Elements
    const btnNotifications = document.getElementById('btn-notifications');
    const notificationsDropdown = document.getElementById('notifications-dropdown');
    const notificationBadge = document.getElementById('notification-badge');
    const btnNewMessage = document.getElementById('btn-new-message');
    const notificationsList = document.getElementById('notifications-list');
    const modalMessage = document.getElementById('modal-message');
    const btnCloseMessageModal = document.getElementById('btn-close-message-modal');
    const formSendMessage = document.getElementById('form-send-message');
    const msgRecipient = document.getElementById('msg-recipient');
    const msgText = document.getElementById('msg-text');
    const btnCancelMessage = document.getElementById('btn-cancel-message');

    const form = document.getElementById('finance-form');
    const inputSale = document.getElementById('entry-sale');
    const inputExpense = document.getElementById('entry-expense');
    const inputDesc = document.getElementById('entry-description');
    const inputDate = document.getElementById('entry-date');
    const inputId = document.getElementById('entry-id');
    const btnSubmit = document.getElementById('btn-submit');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');

    const displaySales = document.getElementById('total-sales');
    const displayExpenses = document.getElementById('total-expenses');
    const displayProfit = document.getElementById('total-profit');
    const profitContainer = document.getElementById('profit-metric-container');
    const profitStatusText = document.getElementById('profit-status-text');

    const globalDateFilter = document.getElementById('global-date-filter');
    const btnShowAll = document.getElementById('btn-show-all');
    const searchInput = document.getElementById('history-search');
    const historyList = document.getElementById('history-list');
    const historyEmptyState = document.getElementById('history-empty-state');
    const emptyStateMsg = document.getElementById('empty-state-msg');
    const historyFilterInfo = document.getElementById('history-filter-info');
    const btnClearHistory = document.getElementById('btn-clear-history');
    const themeToggle = document.getElementById('theme-toggle');

    const chartCanvas = document.getElementById('financeChart');
    const chartEmptyState = document.getElementById('chart-empty-state');

    // --- Initialization ---
    initApp();

    async function initApp() {
        // Initialize Lucide Icons
        if (window.lucide) {
            lucide.createIcons();
        }

        // Set welcome message
        const welcomeEl = document.getElementById('user-welcome');
        if (welcomeEl && username) {
            welcomeEl.textContent = `Olá, ${username}! Seu controle financeiro`;
        }

        // Set default dates in inputs
        inputDate.value = getLocalTodayDate();
        globalDateFilter.value = getLocalTodayDate();
        selectedDate = getLocalTodayDate();

        // Load theme from localStorage
        initTheme();

        // Load data from API database or fallback to localStorage
        await loadTransactions();

        // Set up Event Listeners
        form.addEventListener('submit', handleFormSubmit);
        btnCancelEdit.addEventListener('click', cancelEditing);
        globalDateFilter.addEventListener('change', handleDateFilterChange);
        btnShowAll.addEventListener('click', handleShowAllClick);
        searchInput.addEventListener('input', handleSearch);
        btnClearHistory.addEventListener('click', handleClearHistory);
        themeToggle.addEventListener('click', toggleTheme);
        if (btnLogout) {
            btnLogout.addEventListener('click', handleLogout);
        }

        // Set up Notifications toggle and handlers
        if (btnNotifications) {
            btnNotifications.addEventListener('click', toggleNotificationsDropdown);
        }
        if (btnNewMessage) {
            btnNewMessage.addEventListener('click', openMessageModal);
        }
        if (btnCloseMessageModal) {
            btnCloseMessageModal.addEventListener('click', closeMessageModal);
        }
        if (btnCancelMessage) {
            btnCancelMessage.addEventListener('click', closeMessageModal);
        }
        if (formSendMessage) {
            formSendMessage.addEventListener('submit', handleSendMessageSubmit);
        }
        
        loadNotifications();
        setInterval(loadNotifications, 30000); // Poll every 30 seconds
        
        document.addEventListener('click', (e) => {
            if (notificationsDropdown && btnNotifications && 
                !notificationsDropdown.contains(e.target) && 
                !btnNotifications.contains(e.target)) {
                notificationsDropdown.style.display = 'none';
            }
        });
    }

    function handleLogout() {
        localStorage.removeItem('financadia_token');
        localStorage.removeItem('financadia_username');
        window.location.href = '/login.html';
    }

    // --- Notifications and Messaging Logic ---
    let notifications = [];

    function toggleNotificationsDropdown() {
        if (!notificationsDropdown) return;
        const isHidden = notificationsDropdown.style.display === 'none' || notificationsDropdown.style.display === '';
        notificationsDropdown.style.display = isHidden ? 'flex' : 'none';
        
        // Mark all loaded notifications as read when opening dropdown
        if (isHidden) {
            notifications.forEach(n => {
                if (!n.isRead) {
                    markNotificationAsRead(n.id);
                }
            });
        }
    }

    function openMessageModal() {
        if (notificationsDropdown) notificationsDropdown.style.display = 'none';
        if (modalMessage) modalMessage.style.display = 'flex';
        loadUsers();
    }

    function closeMessageModal() {
        if (modalMessage) modalMessage.style.display = 'none';
        if (formSendMessage) formSendMessage.reset();
    }

    async function loadUsers() {
        try {
            const res = await fetch('/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(await res.text());
            const usersList = await res.json();
            
            if (msgRecipient) {
                msgRecipient.innerHTML = '<option value="" disabled selected>Selecione um usuário...</option>';
                usersList.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = u.username;
                    msgRecipient.appendChild(opt);
                });
            }
        } catch (err) {
            console.error("Erro ao carregar usuários:", err);
        }
    }

    async function loadNotifications() {
        try {
            const res = await fetch('/api/notifications', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(await res.text());
            notifications = await res.json();
            
            // Update badge
            const unreadCount = notifications.filter(n => !n.isRead).length;
            if (notificationBadge) {
                if (unreadCount > 0) {
                    notificationBadge.style.display = 'block';
                } else {
                    notificationBadge.style.display = 'none';
                }
            }

            // Render list
            if (notificationsList) {
                if (notifications.length === 0) {
                    notificationsList.innerHTML = `
                        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
                            Nenhuma mensagem recebida.
                        </div>
                    `;
                } else {
                    notificationsList.innerHTML = notifications.map(n => {
                        const dateStr = new Date(n.createdAt).toLocaleDateString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        const unreadBg = n.isRead ? 'transparent' : 'rgba(99, 102, 241, 0.05)';
                        const unreadDot = n.isRead ? '' : '<span style="width: 8px; height: 8px; background-color: var(--accent-profit); border-radius: 50%; display: inline-block;"></span>';
                        return `
                            <div class="notification-item" style="padding: 12px 16px; border-bottom: 1px solid var(--border-color); background-color: ${unreadBg}; display: flex; flex-direction: column; gap: 4px; transition: background-color 0.2s;">
                                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                                        ${unreadDot} ${n.senderUsername}
                                    </span>
                                    <span style="font-size: 0.7rem; color: var(--text-muted);">${dateStr}</span>
                                </div>
                                <p style="margin: 0; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4; word-break: break-word;">
                                    ${n.message}
                                </p>
                            </div>
                        `;
                    }).join('');
                }
            }
        } catch (err) {
            console.error("Erro ao carregar notificações:", err);
        }
    }

    async function handleSendMessageSubmit(e) {
        e.preventDefault();
        const receiverId = msgRecipient.value;
        const messageText = msgText.value.trim();

        if (!receiverId || !messageText) return;

        try {
            const res = await fetch('/api/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ receiverId, message: messageText })
            });

            if (!res.ok) throw new Error(await res.text());
            
            alert("Mensagem enviada com sucesso!");
            closeMessageModal();
        } catch (err) {
            alert("Erro ao enviar mensagem: " + err.message);
        }
    }

    async function markNotificationAsRead(id) {
        try {
            await fetch(`/api/notifications/${id}/read`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const n = notifications.find(notif => notif.id === id);
            if (n) n.isRead = true;
            
            const unreadCount = notifications.filter(notif => !notif.isRead).length;
            if (notificationBadge && unreadCount === 0) {
                notificationBadge.style.display = 'none';
            }
        } catch (err) {
            console.error("Erro ao marcar como lida:", err);
        }
    }

    // --- Helper Functions ---
    function getLocalTodayDate() {
        const localDate = new Date();
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, '0');
        const day = String(localDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    }

    function formatDateBR(dateStr) {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    }

    // --- Theme Management ---
    function initTheme() {
        const savedTheme = localStorage.getItem('financadia_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeToggleIcons(savedTheme);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('financadia_theme', newTheme);
        updateThemeToggleIcons(newTheme);
        
        // Re-render chart since chart colors adapt to themes
        renderChart();
    }

    function updateThemeToggleIcons(theme) {
        // Toggles elements are handled nicely in CSS, but let's ensure compliance
        // If we want to dynamically refresh Lucide icon states
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // --- Core Calculations ---
    function calculateMetrics() {
        let filtered = transactions;
        
        if (!showAll) {
            filtered = transactions.filter(t => t.date === selectedDate);
        }

        const totalSales = filtered.reduce((sum, t) => sum + (t.sale || 0), 0);
        const totalExpenses = filtered.reduce((sum, t) => sum + (t.expense || 0), 0);
        const totalProfit = totalSales - totalExpenses;

        return { totalSales, totalExpenses, totalProfit };
    }

    // --- UI Update Coordinator ---
    function updateUI() {
        // 1. Update Metrics Cards
        const { totalSales, totalExpenses, totalProfit } = calculateMetrics();

        displaySales.textContent = formatCurrency(totalSales);
        displayExpenses.textContent = formatCurrency(totalExpenses);
        displayProfit.textContent = formatCurrency(totalProfit);

        // Manage Profit Styling
        profitContainer.classList.remove('positive', 'negative', 'neutral');
        if (totalProfit > 0) {
            profitContainer.classList.add('positive');
            profitStatusText.textContent = "Saldo positivo";
        } else if (totalProfit < 0) {
            profitContainer.classList.add('negative');
            profitStatusText.textContent = "Prejuízo no período";
        } else {
            profitContainer.classList.add('neutral');
            profitStatusText.textContent = "Sem saldo líquido";
        }

        // 2. Update filter header info
        if (showAll) {
            historyFilterInfo.textContent = "Exibindo todos os registros";
            globalDateFilter.value = '';
            btnShowAll.classList.remove('btn-secondary');
            btnShowAll.classList.add('btn-primary');
        } else {
            historyFilterInfo.textContent = `Exibindo registros de ${formatDateBR(selectedDate)}`;
            globalDateFilter.value = selectedDate;
            btnShowAll.classList.remove('btn-primary');
            btnShowAll.classList.add('btn-secondary');
        }

        // 3. Render List
        renderList();

        // 4. Render Chart
        renderChart();
    }

    // --- List Rendering ---
    function renderList() {
        historyList.innerHTML = '';
        const searchQuery = searchInput.value.toLowerCase().trim();

        // Filter and Sort
        let filtered = transactions;

        // Apply Date Filter if not in showAll mode
        if (!showAll) {
            filtered = filtered.filter(t => t.date === selectedDate);
        }

        // Apply Search Filter
        if (searchQuery) {
            filtered = filtered.filter(t => 
                t.description && t.description.toLowerCase().includes(searchQuery)
            );
        }

        // Sort: Newest dates first. If same date, newest ID first.
        filtered.sort((a, b) => {
            if (a.date !== b.date) {
                return b.date.localeCompare(a.date);
            }
            return b.id - a.id;
        });

        // Toggle Empty State
        if (filtered.length === 0) {
            historyEmptyState.classList.remove('hidden');
            if (searchQuery) {
                emptyStateMsg.textContent = `Nenhum registro corresponde a "${searchQuery}".`;
            } else if (!showAll) {
                emptyStateMsg.textContent = `Não há registros cadastrados para a data ${formatDateBR(selectedDate)}.`;
            } else {
                emptyStateMsg.textContent = "Adicione vendas ou gastos no formulário para visualizar no histórico.";
            }
            return;
        } else {
            historyEmptyState.classList.add('hidden');
        }

        // Map items to DOM
        filtered.forEach(t => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.setAttribute('data-id', t.id);

            // Determine badge type
            let badgeHTML = '';
            let valHTML = '';

            if (t.sale > 0 && t.expense > 0) {
                badgeHTML = `<span class="item-badge badge-mixed">Misto</span>`;
                valHTML = `
                    <span class="item-val val-sale">+ ${formatCurrency(t.sale)}</span>
                    <span class="item-val val-expense val-small">- ${formatCurrency(t.expense)}</span>
                `;
            } else if (t.sale > 0) {
                badgeHTML = `<span class="item-badge badge-sale">Venda</span>`;
                valHTML = `<span class="item-val val-sale">+ ${formatCurrency(t.sale)}</span>`;
            } else {
                badgeHTML = `<span class="item-badge badge-expense">Gasto</span>`;
                valHTML = `<span class="item-val val-expense">- ${formatCurrency(t.expense)}</span>`;
            }

            const desc = t.description || (t.sale > 0 && t.expense > 0 ? 'Venda e Despesa' : t.sale > 0 ? 'Venda Registrada' : 'Gasto Registrado');

            li.innerHTML = `
                <div class="item-left">
                    <span class="item-desc" title="${desc}">${desc}</span>
                    <div class="item-meta">
                        ${badgeHTML}
                        <span class="item-date">
                            <i data-lucide="calendar" style="width: 0.75rem; height: 0.75rem;"></i>
                            ${formatDateBR(t.date)}
                        </span>
                    </div>
                </div>
                <div class="item-values">
                    ${valHTML}
                </div>
                <div class="item-actions">
                    <button class="btn-action btn-action-edit" title="Editar registro">
                        <i data-lucide="edit-3"></i>
                    </button>
                    <button class="btn-action btn-action-delete" title="Excluir registro">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;

            // Add Event Listeners for actions inside list
            const btnEdit = li.querySelector('.btn-action-edit');
            const btnDelete = li.querySelector('.btn-action-delete');
            const actionsContainer = li.querySelector('.item-actions');

            btnEdit.addEventListener('click', () => startEditing(t));
            
            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Create confirmation elements
                const confirmContainer = document.createElement('div');
                confirmContainer.className = 'confirm-actions-wrapper';
                confirmContainer.innerHTML = `
                    <span class="confirm-label">Excluir?</span>
                    <button type="button" class="btn-action btn-action-confirm-yes" title="Confirmar exclusão">
                        <i data-lucide="check"></i>
                    </button>
                    <button type="button" class="btn-action btn-action-confirm-no" title="Cancelar">
                        <i data-lucide="x"></i>
                    </button>
                `;
                
                // Hide standard buttons
                btnEdit.classList.add('hidden');
                btnDelete.classList.add('hidden');
                
                // Append confirmation buttons
                actionsContainer.appendChild(confirmContainer);
                
                // Initialize Lucide icons for the new confirmation buttons
                if (window.lucide) {
                    lucide.createIcons();
                }
                
                // Setup listeners
                confirmContainer.querySelector('.btn-action-confirm-yes').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    executeDelete(t.id);
                });
                
                confirmContainer.querySelector('.btn-action-confirm-no').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    // Restore original buttons
                    confirmContainer.remove();
                    btnEdit.classList.remove('hidden');
                    btnDelete.classList.remove('hidden');
                });
            });

            historyList.appendChild(li);
        });

        // Initialize icons inside the new list items
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // --- Form Handlers (Create & Update) ---
    function handleFormSubmit(e) {
        e.preventDefault();

        const saleVal = parseFloat(inputSale.value) || 0;
        const expenseVal = parseFloat(inputExpense.value) || 0;
        const descVal = inputDesc.value.trim();
        const dateVal = inputDate.value;
        const idVal = inputId.value;

        // Validation
        if (saleVal <= 0 && expenseVal <= 0) {
            alert('Por favor, informe um valor de venda ou de gasto maior que R$ 0,00.');
            if (saleVal <= 0) inputSale.focus();
            else inputExpense.focus();
            return;
        }

        if (!dateVal) {
            alert('Por favor, selecione uma data válida para o registro.');
            inputDate.focus();
            return;
        }

        if (idVal) {
            // EDIT/UPDATE MODE
            const index = transactions.findIndex(t => t.id === parseInt(idVal));
            if (index !== -1) {
                transactions[index] = {
                    ...transactions[index],
                    sale: saleVal,
                    expense: expenseVal,
                    description: descVal,
                    date: dateVal
                };
            }
            // Reset to Add Mode
            cancelEditing();
        } else {
            // CREATE MODE
            const newTransaction = {
                id: Date.now(),
                sale: saleVal,
                expense: expenseVal,
                description: descVal,
                date: dateVal
            };
            transactions.push(newTransaction);
        }

        // Save State & Update
        saveTransactions();
        
        // If we added a transaction, adjust filters so they can see it
        if (!idVal) {
            // Go to the date of the added transaction
            selectedDate = dateVal;
            showAll = false;
        }

        updateUI();

        // Reset fields
        inputSale.value = '';
        inputExpense.value = '';
        inputDesc.value = '';
        inputDate.value = getLocalTodayDate(); // reset form date to today
    }

    function startEditing(transaction) {
        inputId.value = transaction.id;
        inputSale.value = transaction.sale > 0 ? transaction.sale : '';
        inputExpense.value = transaction.expense > 0 ? transaction.expense : '';
        inputDesc.value = transaction.description || '';
        inputDate.value = transaction.date;

        btnSubmit.innerHTML = `<i data-lucide="save" class="btn-icon"></i> Salvar Registro`;
        btnCancelEdit.classList.remove('hidden');
        
        // Scroll Form into view (important on mobile)
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    function cancelEditing() {
        inputId.value = '';
        inputSale.value = '';
        inputExpense.value = '';
        inputDesc.value = '';
        inputDate.value = getLocalTodayDate();

        btnSubmit.innerHTML = `<i data-lucide="check" class="btn-icon"></i> Adicionar Registro`;
        btnCancelEdit.classList.add('hidden');

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // --- Deletion Handler ---
    function executeDelete(id) {
        // Cancel editing if deleting the item currently in the form
        if (inputId.value === String(id)) {
            cancelEditing();
        }
        transactions = transactions.filter(t => t.id !== id);
        saveTransactions();
        updateUI();
    }

    function handleClearHistory() {
        if (transactions.length === 0) {
            alert('O histórico já está vazio!');
            return;
        }
        
        if (confirm('ATENÇÃO: Isso apagará TODOS os seus registros permanentemente de forma irreversível. Deseja continuar?')) {
            cancelEditing();
            transactions = [];
            saveTransactions();
            updateUI();
        }
    }

    // --- Search & Filtering ---
    function handleDateFilterChange(e) {
        if (e.target.value) {
            selectedDate = e.target.value;
            showAll = false;
            updateUI();
        }
    }

    function handleShowAllClick() {
        showAll = true;
        updateUI();
    }

    function handleSearch() {
        renderList();
    }

    async function saveTransactions() {
        localStorage.setItem('financadia_transactions', JSON.stringify(transactions));
        try {
            const response = await fetch('/api/finance/transactions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(transactions)
            });
            if (response.status === 401) {
                handleLogout();
            }
        } catch (e) {
            console.warn("Could not write to local server database:", e);
        }
    }

    async function loadTransactions() {
        try {
            const response = await fetch('/api/finance/transactions', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const dbTransactions = await response.json();
                const localData = JSON.parse(localStorage.getItem('financadia_transactions')) || [];
                // Auto-migrate if local server is empty but client has local data
                if (dbTransactions.length === 0 && localData.length > 0) {
                    console.log("Migrating transactions from localStorage to local server...");
                    transactions = localData;
                    await saveTransactions();
                } else {
                    transactions = dbTransactions;
                }
            } else if (response.status === 401) {
                handleLogout();
                return;
            } else {
                throw new Error("HTTP response was not OK");
            }
        } catch (e) {
            console.warn("Server offline or error. Falling back to localStorage:", e);
            transactions = JSON.parse(localStorage.getItem('financadia_transactions')) || [];
        }
        updateUI();
    }

    // --- Chart Renderer ---
    function renderChart() {
        // Clear canvas if destroyed
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        // Group data by date
        const grouped = {};
        transactions.forEach(t => {
            if (!grouped[t.date]) {
                grouped[t.date] = { sales: 0, expenses: 0 };
            }
            grouped[t.date].sales += t.sale || 0;
            grouped[t.date].expenses += t.expense || 0;
        });

        // Sort dates chronologically
        const sortedDates = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

        // Take last 7 days of entries
        const last7Dates = sortedDates.slice(-7);

        if (last7Dates.length === 0) {
            chartCanvas.classList.add('hidden');
            chartEmptyState.classList.remove('hidden');
            return;
        } else {
            chartCanvas.classList.remove('hidden');
            chartEmptyState.classList.add('hidden');
        }

        // Get Theme color styles
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)';
        const textPrimary = isDark ? '#94a3b8' : '#64748b';
        
        // Hex values matching HSL accents
        const saleColor = isDark ? '#34d399' : '#10b981'; // green
        const expenseColor = isDark ? '#fb7185' : '#f43f5e'; // red

        const labels = last7Dates.map(date => formatDateBR(date));
        const salesData = last7Dates.map(date => grouped[date].sales);
        const expensesData = last7Dates.map(date => grouped[date].expenses);

        const ctx = chartCanvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Vendas (💰)',
                        data: salesData,
                        backgroundColor: saleColor,
                        borderRadius: 6,
                        borderSkipped: false,
                        barPercentage: 0.8,
                        categoryPercentage: 0.7
                    },
                    {
                        label: 'Gastos (💸)',
                        data: expensesData,
                        backgroundColor: expenseColor,
                        borderRadius: 6,
                        borderSkipped: false,
                        barPercentage: 0.8,
                        categoryPercentage: 0.7
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: textPrimary,
                            font: {
                                family: 'Inter',
                                size: 11,
                                weight: '500'
                            },
                            boxWidth: 12,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        titleColor: isDark ? '#f8fafc' : '#0f172a',
                        bodyColor: isDark ? '#f8fafc' : '#0f172a',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.06)',
                        borderWidth: 1,
                        padding: 10,
                        bodyFont: {
                            family: 'Inter'
                        },
                        titleFont: {
                            family: 'Outfit',
                            weight: 'bold'
                        },
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label.split(' ')[0] || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += formatCurrency(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: textPrimary,
                            font: {
                                family: 'Inter',
                                size: 10
                            }
                        }
                    },
                    y: {
                        grid: {
                            color: gridColor
                        },
                        ticks: {
                            color: textPrimary,
                            font: {
                                family: 'Inter',
                                size: 10
                            },
                            callback: function(value) {
                                if (value >= 1000) {
                                    return 'R$ ' + (value / 1000).toFixed(1) + 'k';
                                }
                                return 'R$ ' + value;
                            }
                        }
                    }
                }
            }
        });
    }
});
