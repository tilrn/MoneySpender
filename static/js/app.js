// Default categories with colors for the chart
const DEFAULT_CATEGORIES = [
    { name: 'Food & Drinks', class: 'category-food', color: '#fb923c' },
    { name: 'Transport', class: 'category-transport', color: '#60a5fa' },
    { name: 'Entertainment', class: 'category-entertainment', color: '#c084fc' },
    { name: 'Shopping', class: 'category-shopping', color: '#f472b6' },
    { name: 'Bills', class: 'category-bills', color: '#facc15' },
    { name: 'Subscriptions', class: 'category-subscriptions', color: '#2dd4bf' },
    { name: 'Flik', class: 'category-flik', color: '#f87171' },
    { name: 'Transfer', class: 'category-transfer', color: '#d1d5db' },
    { name: 'Income', class: 'category-income', color: '#4ade80' },
    { name: 'Other', class: 'category-other', color: '#9ca3af' },
    { name: 'Spotify', class: 'category-spotify', color: '#0ed51c' },
    { name: 'Steam', class: 'category-steam', color: '#66c0f4' },
    { name: 'Petrol', class: 'category-petrol', color: '#f59e0b' }
];

const EXTRA_COLORS = ['#f87171', '#a78bfa', '#34d399', '#fbbf24', '#38bdf8', '#fb7185', '#a3e635'];

// State
let transactions = [];
let monthlySummary = [];
let currentTransactionId = null;
let categoryChart = null;
let selectedMonth = 'all';

// LocalStorage key
const STORAGE_KEY = 'bankStatementCategories';

// DOM Elements
const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const statsSection = document.getElementById('statsSection');
const monthlySection = document.getElementById('monthlySection');
const chartSection = document.getElementById('chartSection');
const filterSection = document.getElementById('filterSection');
const transactionsSection = document.getElementById('transactionsSection');
const transactionsList = document.getElementById('transactionsList');
const categoryModal = document.getElementById('categoryModal');
const categoryGrid = document.getElementById('categoryGrid');
const customCategoryInput = document.getElementById('customCategoryInput');
const loadingOverlay = document.getElementById('loadingOverlay');

const totalIncome = document.getElementById('totalIncome');
const totalExpenses = document.getElementById('totalExpenses');
const netBalance = document.getElementById('netBalance');
const transactionCount = document.getElementById('transactionCount');

const searchInput = document.getElementById('searchInput');
const monthFilter = document.getElementById('monthFilter');
const typeFilter = document.getElementById('typeFilter');
const categoryFilter = document.getElementById('categoryFilter');
const newUploadBtn = document.getElementById('newUploadBtn');

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    setupUpload();
    setupModal();
    setupFilters();
    renderCategoryOptions();
    loadAllData(); // Auto-load on startup
}

// LocalStorage functions
function loadSavedCategories() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        return {};
    }
}

function saveCategoriesToStorage(categories) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
    } catch (e) {
        console.error('Failed to save to localStorage:', e);
    }
}

// Auto-load all data on startup
async function loadAllData() {
    showLoading(true);

    try {
        const response = await fetch('/api/all-transactions');
        const data = await response.json();

        if (data.success) {
            transactions = data.transactions;
            monthlySummary = data.monthly_summary;

            // Apply saved categories from localStorage
            const savedCategories = loadSavedCategories();
            transactions.forEach(trans => {
                if (savedCategories[trans.id]) {
                    trans.category = savedCategories[trans.id];
                }
            });

            if (transactions.length > 0) {
                updateStats(data.total_income, data.total_expenses);
                renderMonthlyCards();
                renderTransactions();
                renderChart();
                showDataView();
                updateFilterOptions();
            } else {
                showEmptyState();
            }
        }
    } catch (error) {
        console.error('Failed to load data:', error);
        showEmptyState();
    } finally {
        showLoading(false);
    }
}

function showEmptyState() {
    uploadSection.classList.remove('hidden');
    statsSection.classList.add('hidden');
    monthlySection.classList.add('hidden');
    chartSection.classList.add('hidden');
    filterSection.classList.add('hidden');
    transactionsSection.classList.add('hidden');
}

function showDataView() {
    uploadSection.classList.add('hidden');
    statsSection.classList.remove('hidden');
    monthlySection.classList.remove('hidden');
    chartSection.classList.remove('hidden');
    filterSection.classList.remove('hidden');
    transactionsSection.classList.remove('hidden');
}

function showLoading(show) {
    loadingOverlay.classList.toggle('hidden', !show);
}

// Upload functionality
function setupUpload() {
    uploadBox.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.classList.add('drag-over');
    });

    uploadBox.addEventListener('dragleave', () => {
        uploadBox.classList.remove('drag-over');
    });

    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            uploadFile(file);
        }
    });

    newUploadBtn.addEventListener('click', () => fileInput.click());
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        uploadFile(file);
    }
}

async function uploadFile(file) {
    showLoading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            // Reload all data to combine with existing
            await loadAllData();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (error) {
        alert('Failed to upload file: ' + error.message);
    } finally {
        showLoading(false);
        fileInput.value = ''; // Reset input
    }
}

// Stats
function updateStats(income, expenses) {
    totalIncome.textContent = formatCurrency(income);
    totalExpenses.textContent = formatCurrency(expenses);
    const net = income - expenses;
    netBalance.textContent = formatCurrency(Math.abs(net));
    netBalance.parentElement.parentElement.classList.toggle('income', net >= 0);
    netBalance.parentElement.parentElement.classList.toggle('expense', net < 0);
}

// Monthly cards
function renderMonthlyCards() {
    const monthlyCards = document.getElementById('monthlyCards');

    monthlyCards.innerHTML = monthlySummary.map(month => {
        const net = month.income - month.expenses;
        return `
            <div class="monthly-card ${selectedMonth === month.month_key ? 'active' : ''}"
                 onclick="filterByMonth('${month.month_key}')">
                <div class="monthly-card-header">${month.month}</div>
                <div class="monthly-card-stats">
                    <div class="monthly-stat">
                        <span class="monthly-stat-label">Income</span>
                        <span class="monthly-stat-value income">+${formatCurrency(month.income)}</span>
                    </div>
                    <div class="monthly-stat">
                        <span class="monthly-stat-label">Expenses</span>
                        <span class="monthly-stat-value expense">-${formatCurrency(month.expenses)}</span>
                    </div>
                    <div class="monthly-stat">
                        <span class="monthly-stat-label">Net</span>
                        <span class="monthly-stat-value net ${net >= 0 ? 'positive' : 'negative'}">
                            ${net >= 0 ? '+' : ''}${formatCurrency(net)}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterByMonth(monthKey) {
    selectedMonth = selectedMonth === monthKey ? 'all' : monthKey;
    monthFilter.value = selectedMonth;
    renderMonthlyCards();
    renderTransactions();
    renderChart();
    updateStatsForFilter();
}

function updateStatsForFilter() {
    const filtered = getFilteredTransactions();
    const income = filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    updateStats(income, expenses);
}

// Chart
function renderChart() {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    const legendContainer = document.getElementById('chartLegend');

    const filtered = getFilteredTransactions();
    const categoryTotals = {};
    let uncategorizedTotal = 0;

    filtered.forEach(trans => {
        if (trans.type === 'expense') {
            if (trans.category) {
                categoryTotals[trans.category] = (categoryTotals[trans.category] || 0) + trans.amount;
            } else {
                uncategorizedTotal += trans.amount;
            }
        }
    });

    if (uncategorizedTotal > 0) {
        categoryTotals['Uncategorized'] = uncategorizedTotal;
    }

    const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    const labels = sortedCategories.map(([cat]) => cat);
    const data = sortedCategories.map(([, amount]) => amount);
    const colors = sortedCategories.map(([cat], i) => getCategoryColor(cat, i));

    if (categoryChart) {
        categoryChart.destroy();
    }

    if (data.length === 0) {
        legendContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No expense data</p>';
        return;
    }

    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#1a1a1a',
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '60%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#252525',
                    titleColor: '#fff',
                    bodyColor: '#a0a0a0',
                    borderColor: '#3a3a3a',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / total) * 100).toFixed(1);
                            return `${formatCurrency(context.raw)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    const total = data.reduce((a, b) => a + b, 0);
    legendContainer.innerHTML = sortedCategories.map(([cat, amount], i) => {
        const percentage = ((amount / total) * 100).toFixed(1);
        return `
            <div class="legend-item">
                <span class="legend-color" style="background: ${colors[i]}"></span>
                <span>${cat}</span>
                <span class="legend-amount">${formatCurrency(amount)} (${percentage}%)</span>
            </div>
        `;
    }).join('');
}

function getCategoryColor(category, index) {
    const defaultCat = DEFAULT_CATEGORIES.find(c => c.name === category);
    if (defaultCat) return defaultCat.color;
    if (category === 'Uncategorized') return '#4b5563';
    return EXTRA_COLORS[index % EXTRA_COLORS.length];
}

// Transactions
function renderTransactions() {
    const filtered = getFilteredTransactions();
    transactionCount.textContent = `${filtered.length} transaction${filtered.length !== 1 ? 's' : ''}`;

    transactionsList.innerHTML = filtered.map(trans => `
        <div class="transaction-item" data-id="${trans.id}">
            <div class="transaction-date">${trans.date}</div>
            <div class="transaction-info">
                <div class="transaction-description">${escapeHtml(trans.description || trans.payer_payee || 'Unknown')}</div>
                <div class="transaction-payer">${escapeHtml(trans.payer_payee)}</div>
            </div>
            <div class="transaction-category">
                <span class="category-badge ${trans.category ? 'set ' + getCategoryClass(trans.category) : 'uncategorized'}"
                      onclick="openCategoryModal('${trans.id}')">
                    ${trans.category || '+ Add category'}
                </span>
            </div>
            <div class="transaction-amount ${trans.type}">
                ${trans.type === 'expense' ? '-' : '+'}${formatCurrency(trans.amount)}
            </div>
        </div>
    `).join('');
}

function getFilteredTransactions() {
    let filtered = [...transactions];

    // Month filter
    if (selectedMonth !== 'all') {
        filtered = filtered.filter(t => {
            const date = new Date(t.date.split('.').reverse().join('-'));
            return date.toISOString().slice(0, 7) === selectedMonth;
        });
    }

    // Search filter
    const search = searchInput.value.toLowerCase();
    if (search) {
        filtered = filtered.filter(t =>
            (t.description && t.description.toLowerCase().includes(search)) ||
            (t.payer_payee && t.payer_payee.toLowerCase().includes(search)) ||
            (t.category && t.category.toLowerCase().includes(search))
        );
    }

    // Type filter
    const type = typeFilter.value;
    if (type !== 'all') {
        filtered = filtered.filter(t => t.type === type);
    }

    // Category filter
    const category = categoryFilter.value;
    if (category === 'uncategorized') {
        filtered = filtered.filter(t => !t.category);
    } else if (category !== 'all') {
        filtered = filtered.filter(t => t.category === category);
    }

    return filtered;
}

function setupFilters() {
    searchInput.addEventListener('input', () => {
        renderTransactions();
        renderChart();
        updateStatsForFilter();
    });
    monthFilter.addEventListener('change', (e) => {
        selectedMonth = e.target.value;
        renderMonthlyCards();
        renderTransactions();
        renderChart();
        updateStatsForFilter();
    });
    typeFilter.addEventListener('change', () => {
        renderTransactions();
        renderChart();
        updateStatsForFilter();
    });
    categoryFilter.addEventListener('change', () => {
        renderTransactions();
        renderChart();
        updateStatsForFilter();
    });
}

function updateFilterOptions() {
    // Update month filter
    monthFilter.innerHTML = `<option value="all">All Months</option>` +
        monthlySummary.map(m => `<option value="${m.month_key}">${m.month}</option>`).join('');

    // Update category filter
    const categories = [...new Set(transactions.filter(t => t.category).map(t => t.category))];
    categoryFilter.innerHTML = `
        <option value="all">All Categories</option>
        <option value="uncategorized">Uncategorized</option>
        ${categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
    `;
}

// Category Modal
function setupModal() {
    document.getElementById('modalClose').addEventListener('click', closeCategoryModal);
    document.querySelector('.modal-backdrop').addEventListener('click', closeCategoryModal);
    document.getElementById('saveCustomCategory').addEventListener('click', saveCustomCategory);

    customCategoryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveCustomCategory();
    });
}

function renderCategoryOptions() {
    categoryGrid.innerHTML = DEFAULT_CATEGORIES.map(cat => `
        <div class="category-option ${cat.class}" onclick="selectCategory('${cat.name}')">${cat.name}</div>
    `).join('');
}

function openCategoryModal(transactionId) {
    currentTransactionId = transactionId;
    const trans = transactions.find(t => t.id === transactionId);

    document.querySelectorAll('.category-option').forEach(opt => {
        opt.classList.toggle('selected', trans && trans.category === opt.textContent);
    });

    customCategoryInput.value = '';
    categoryModal.classList.remove('hidden');
}

function closeCategoryModal() {
    categoryModal.classList.add('hidden');
    currentTransactionId = null;
}

async function selectCategory(category) {
    if (!currentTransactionId) return;
    await saveCategory(currentTransactionId, category);
    closeCategoryModal();
}

async function saveCustomCategory() {
    const category = customCategoryInput.value.trim();
    if (!category || !currentTransactionId) return;
    await saveCategory(currentTransactionId, category);
    closeCategoryModal();
}

async function saveCategory(transactionId, category) {
    try {
        const trans = transactions.find(t => t.id === transactionId);
        const description = trans ? trans.description : '';

        const response = await fetch('/api/category', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: transactionId, category, description })
        });

        if (response.ok) {
            // Apply category to this transaction
            if (trans) trans.category = category;

            // Auto-apply to all matching transactions
            const merchantKey = getMerchantKey(description);
            if (merchantKey) {
                transactions.forEach(t => {
                    if (!t.category && getMerchantKey(t.description) === merchantKey) {
                        t.category = category;
                    }
                });
            }

            const savedCategories = loadSavedCategories();
            savedCategories[transactionId] = category;
            saveCategoriesToStorage(savedCategories);

            renderTransactions();
            renderChart();
            updateFilterOptions();
        }
    } catch (error) {
        console.error('Failed to save category:', error);
    }
}

function getMerchantKey(description) {
    if (!description) return null;
    let key = description.trim().toUpperCase();
    key = key.replace(/\d+/g, '');  // Remove numbers
    key = key.replace(/\s+/g, ' ').trim();  // Normalize spaces
    return key || null;
}

// Utilities
function formatCurrency(amount) {
    return new Intl.NumberFormat('sl-SI', {
        style: 'currency',
        currency: 'EUR'
    }).format(amount);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getCategoryClass(category) {
    const cat = DEFAULT_CATEGORIES.find(c => c.name === category);
    return cat ? cat.class : 'category-other';
}

// Global functions
window.openCategoryModal = openCategoryModal;
window.selectCategory = selectCategory;
window.filterByMonth = filterByMonth;
