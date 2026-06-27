(() => {
  'use strict';

  const STORAGE_KEY = 'moneydock:v1';
  const VIEWS = ['home', 'add', 'transactions', 'categories', 'settings'];
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  let state = normalizeState(loadState());
  let editingId = null;
  let toastTimer = null;

  const defaultExpenseCategories = [
    ['Dinner', '🍽️', 0],
    ['Groceries', '🛒', 0],
    ['Coffee', '☕', 0],
    ['Transport', '🚕', 0],
    ['Bills', '💡', 0],
    ['Rent', '🏠', 0],
    ['Shopping', '🛍️', 0],
    ['Health', '🩺', 0],
    ['Entertainment', '🎬', 0],
    ['Travel', '✈️', 0],
    ['Education', '📚', 0],
    ['Other expense', '📌', 0],
  ];

  const defaultIncomeCategories = [
    ['Salary', '💼', 0],
    ['Freelance', '🧑‍💻', 0],
    ['Gift', '🎁', 0],
    ['Refund', '↩️', 0],
    ['Investment', '📈', 0],
    ['Other income', '💰', 0],
  ];

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    registerServiceWorker();
    applyRecurringTickets();
    wireEvents();
    setDefaultDates();
    render();
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
  }

  function wireEvents() {
    document.addEventListener('click', (event) => {
      const navButton = event.target.closest('[data-nav]');
      if (navButton) {
        go(navButton.dataset.nav);
        return;
      }

      const actionButton = event.target.closest('[data-action]');
      if (!actionButton) return;
      const id = actionButton.dataset.id;
      const action = actionButton.dataset.action;
      if (action === 'edit-ticket') editTicket(id);
      if (action === 'delete-ticket') deleteTicket(id);
      if (action === 'duplicate-ticket') duplicateTicket(id);
      if (action === 'edit-category') editCategory(id);
      if (action === 'delete-category') deleteCategory(id);
      if (action === 'edit-account') editAccount(id);
      if (action === 'delete-account') deleteAccount(id);
      if (action === 'disable-recurring') disableRecurring(id);
    });

    $('#setupForm').addEventListener('submit', handleSetup);
    $('#ticketForm').addEventListener('submit', handleTicketSubmit);
    $('#ticketType').addEventListener('change', () => {
      updateTicketFormVisibility();
      populateTicketCategories();
    });
    $('#cancelEditBtn').addEventListener('click', cancelTicketEdit);

    $('#categoryForm').addEventListener('submit', handleCategorySubmit);
    $('#accountForm').addEventListener('submit', handleAccountSubmit);
    $('#settingsForm').addEventListener('submit', handleSettingsSubmit);

    ['#filterMonth', '#filterType', '#filterCategory', '#filterSearch'].forEach((selector) => {
      $(selector).addEventListener('input', renderTransactions);
      $(selector).addEventListener('change', renderTransactions);
    });

    $('#quickBackupBtn').addEventListener('click', exportJson);
    $('#exportJsonBtn').addEventListener('click', exportJson);
    $('#exportCsvBtn').addEventListener('click', exportCsv);
    $('#importJsonInput').addEventListener('change', importJson);
    $('#resetBtn').addEventListener('click', resetAllData);
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return createDefaultState();
      return JSON.parse(stored);
    } catch (error) {
      console.error(error);
      return createDefaultState();
    }
  }

  function createDefaultState() {
    return {
      version: 1,
      settings: {
        setupComplete: false,
        currency: 'USD',
        savingGoal: 0,
        createdAt: new Date().toISOString(),
      },
      accounts: [],
      categories: [
        ...defaultExpenseCategories.map(([name, emoji, budget]) => ({
          id: uid(),
          name,
          emoji,
          type: 'expense',
          budget,
        })),
        ...defaultIncomeCategories.map(([name, emoji, budget]) => ({
          id: uid(),
          name,
          emoji,
          type: 'income',
          budget,
        })),
      ],
      transactions: [],
      recurring: [],
    };
  }

  function normalizeState(raw) {
    const defaults = createDefaultState();
    const next = {
      version: raw?.version || 1,
      settings: { ...defaults.settings, ...(raw?.settings || {}) },
      accounts: Array.isArray(raw?.accounts) ? raw.accounts : [],
      categories: Array.isArray(raw?.categories) && raw.categories.length ? raw.categories : defaults.categories,
      transactions: Array.isArray(raw?.transactions) ? raw.transactions : [],
      recurring: Array.isArray(raw?.recurring) ? raw.recurring : [],
    };

    next.accounts = next.accounts.map((account) => ({
      id: account.id || uid(),
      name: String(account.name || 'Account'),
      startingBalance: toNumber(account.startingBalance),
      createdAt: account.createdAt || new Date().toISOString(),
    }));

    next.categories = next.categories.map((category) => ({
      id: category.id || uid(),
      name: String(category.name || 'Category'),
      emoji: String(category.emoji || (category.type === 'income' ? '💰' : '📌')),
      type: category.type === 'income' ? 'income' : 'expense',
      budget: Math.max(0, toNumber(category.budget)),
    }));

    next.transactions = next.transactions.map((tx) => ({
      id: tx.id || uid(),
      type: ['expense', 'income', 'transfer'].includes(tx.type) ? tx.type : 'expense',
      amount: Math.max(0, toNumber(tx.amount)),
      date: validDateOrToday(tx.date),
      note: String(tx.note || ''),
      accountId: tx.accountId || null,
      fromAccountId: tx.fromAccountId || null,
      toAccountId: tx.toAccountId || null,
      categoryId: tx.categoryId || null,
      sourceRecurringId: tx.sourceRecurringId || null,
      createdAt: tx.createdAt || new Date().toISOString(),
      updatedAt: tx.updatedAt || null,
    }));

    next.recurring = next.recurring.map((rec) => ({
      id: rec.id || uid(),
      active: rec.active !== false,
      type: ['expense', 'income', 'transfer'].includes(rec.type) ? rec.type : 'expense',
      amount: Math.max(0, toNumber(rec.amount)),
      note: String(rec.note || ''),
      frequency: rec.frequency === 'weekly' ? 'weekly' : 'monthly',
      nextDate: validDateOrToday(rec.nextDate),
      accountId: rec.accountId || null,
      fromAccountId: rec.fromAccountId || null,
      toAccountId: rec.toAccountId || null,
      categoryId: rec.categoryId || null,
      createdAt: rec.createdAt || new Date().toISOString(),
    }));

    if (next.settings.setupComplete && next.accounts.length === 0) {
      next.accounts.push({ id: uid(), name: 'Main', startingBalance: 0, createdAt: new Date().toISOString() });
    }

    return next;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setDefaultDates() {
    $('#ticketDate').value = todayISO();
    $('#filterMonth').value = monthKey(todayISO());
  }

  function handleSetup(event) {
    event.preventDefault();
    const currency = $('#setupCurrency').value || 'USD';
    const name = $('#setupAccountName').value.trim() || 'Main';
    const balance = toNumber($('#setupBalance').value);

    state.settings.currency = currency;
    state.settings.setupComplete = true;
    state.accounts = [{ id: uid(), name, startingBalance: balance, createdAt: new Date().toISOString() }];
    saveState();
    render();
    go('home');
    showToast('MoneyDock is ready. Add your first ticket whenever you spend or receive money.');
  }

  function handleTicketSubmit(event) {
    event.preventDefault();

    if (!state.accounts.length) {
      showToast('Add an account first.');
      go('settings');
      return;
    }

    const type = $('#ticketType').value;
    const amount = toNumber($('#ticketAmount').value);
    const date = validDateOrToday($('#ticketDate').value);
    const note = $('#ticketNote').value.trim();
    const repeat = $('#ticketRepeat').value;

    if (amount <= 0) {
      showToast('Amount must be greater than zero.');
      return;
    }

    const tx = {
      id: editingId || uid(),
      type,
      amount,
      date,
      note,
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: null,
      sourceRecurringId: null,
      createdAt: new Date().toISOString(),
      updatedAt: editingId ? new Date().toISOString() : null,
    };

    if (type === 'transfer') {
      tx.fromAccountId = $('#transferFrom').value;
      tx.toAccountId = $('#transferTo').value;
      if (!tx.fromAccountId || !tx.toAccountId || tx.fromAccountId === tx.toAccountId) {
        showToast('Choose two different accounts for a transfer.');
        return;
      }
    } else {
      tx.accountId = $('#ticketAccount').value;
      tx.categoryId = $('#ticketCategory').value;
      if (!tx.accountId) {
        showToast('Choose an account.');
        return;
      }
      if (!tx.categoryId) {
        showToast('Choose a category.');
        return;
      }
    }

    if (editingId) {
      const existing = state.transactions.find((item) => item.id === editingId);
      tx.createdAt = existing?.createdAt || tx.createdAt;
      tx.sourceRecurringId = existing?.sourceRecurringId || null;
      state.transactions = state.transactions.map((item) => (item.id === editingId ? tx : item));
      showToast('Ticket updated.');
    } else {
      state.transactions.push(tx);
      if (repeat !== 'none') createRecurringFromTicket(tx, repeat);
      showToast(repeat === 'none' ? 'Ticket saved.' : 'Ticket saved and recurring rule created.');
    }

    saveState();
    cancelTicketEdit({ silent: true });
    resetTicketForm();
    render();
    go('home');
  }

  function createRecurringFromTicket(tx, frequency) {
    state.recurring.push({
      id: uid(),
      active: true,
      type: tx.type,
      amount: tx.amount,
      note: tx.note,
      frequency,
      nextDate: addPeriod(tx.date, frequency),
      accountId: tx.accountId,
      fromAccountId: tx.fromAccountId,
      toAccountId: tx.toAccountId,
      categoryId: tx.categoryId,
      createdAt: new Date().toISOString(),
    });
  }

  function resetTicketForm() {
    $('#ticketForm').reset();
    $('#ticketType').value = 'expense';
    $('#ticketDate').value = todayISO();
    $('#ticketRepeat').value = 'none';
    updateTicketFormVisibility();
    populateAccountSelects();
    populateTicketCategories();
  }

  function editTicket(id) {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx) return;
    editingId = id;
    $('#ticketFormTitle').textContent = 'Edit ticket';
    $('#cancelEditBtn').classList.remove('hidden');
    $('#saveTicketBtn').textContent = 'Update ticket';
    $('#ticketRepeat').value = 'none';
    $('#ticketType').value = tx.type;
    $('#ticketAmount').value = tx.amount;
    $('#ticketDate').value = tx.date;
    $('#ticketNote').value = tx.note || '';
    updateTicketFormVisibility();
    populateAccountSelects();
    populateTicketCategories();

    if (tx.type === 'transfer') {
      $('#transferFrom').value = tx.fromAccountId || '';
      $('#transferTo').value = tx.toAccountId || '';
    } else {
      $('#ticketAccount').value = tx.accountId || '';
      $('#ticketCategory').value = tx.categoryId || '';
    }

    go('add');
  }

  function cancelTicketEdit(options = {}) {
    editingId = null;
    $('#ticketFormTitle').textContent = 'Add money movement';
    $('#cancelEditBtn').classList.add('hidden');
    $('#saveTicketBtn').textContent = 'Save ticket';
    if (!options.silent) {
      resetTicketForm();
      showToast('Edit cancelled.');
    }
  }

  function deleteTicket(id) {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx) return;
    if (!confirm(`Delete this ticket: ${ticketPlainTitle(tx)}?`)) return;
    state.transactions = state.transactions.filter((item) => item.id !== id);
    saveState();
    render();
    showToast('Ticket deleted.');
  }

  function duplicateTicket(id) {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx) return;
    const copy = {
      ...tx,
      id: uid(),
      date: todayISO(),
      sourceRecurringId: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
    state.transactions.push(copy);
    saveState();
    render();
    showToast('Ticket duplicated for today.');
  }

  function handleCategorySubmit(event) {
    event.preventDefault();
    const name = $('#categoryName').value.trim();
    const emoji = $('#categoryEmoji').value.trim() || ($('#categoryType').value === 'income' ? '💰' : '📌');
    const type = $('#categoryType').value;
    const budget = type === 'expense' ? Math.max(0, toNumber($('#categoryBudget').value)) : 0;

    if (!name) return;
    const duplicate = state.categories.some((category) => category.type === type && category.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      showToast('A category with that name already exists.');
      return;
    }

    state.categories.push({ id: uid(), name, emoji, type, budget });
    saveState();
    $('#categoryForm').reset();
    render();
    showToast('Category added.');
  }

  function editCategory(id) {
    const category = categoryById(id);
    if (!category) return;
    const name = prompt('Category name', category.name);
    if (name === null) return;
    const emoji = prompt('Emoji', category.emoji) ?? category.emoji;
    let budget = category.budget;
    if (category.type === 'expense') {
      const budgetInput = prompt('Monthly budget. Use 0 for no budget.', String(category.budget || 0));
      if (budgetInput === null) return;
      budget = Math.max(0, toNumber(budgetInput));
    }
    category.name = name.trim() || category.name;
    category.emoji = emoji.trim() || category.emoji;
    category.budget = budget;
    saveState();
    render();
    showToast('Category updated.');
  }

  function deleteCategory(id) {
    const category = categoryById(id);
    if (!category) return;
    const used = state.transactions.some((tx) => tx.categoryId === id) || state.recurring.some((rec) => rec.categoryId === id && rec.active);
    if (used) {
      showToast('This category is used by tickets or recurring rules. Edit it instead of deleting.');
      return;
    }
    if (!confirm(`Delete category ${category.name}?`)) return;
    state.categories = state.categories.filter((item) => item.id !== id);
    saveState();
    render();
    showToast('Category deleted.');
  }

  function handleAccountSubmit(event) {
    event.preventDefault();
    const name = $('#accountName').value.trim();
    const startingBalance = toNumber($('#accountBalance').value);
    if (!name) return;
    state.accounts.push({ id: uid(), name, startingBalance, createdAt: new Date().toISOString() });
    if (!state.settings.setupComplete) state.settings.setupComplete = true;
    saveState();
    $('#accountForm').reset();
    render();
    showToast('Account added.');
  }

  function editAccount(id) {
    const account = accountById(id);
    if (!account) return;
    const name = prompt('Account name', account.name);
    if (name === null) return;
    const startingBalanceInput = prompt('Starting balance for this account', String(account.startingBalance || 0));
    if (startingBalanceInput === null) return;
    account.name = name.trim() || account.name;
    account.startingBalance = toNumber(startingBalanceInput);
    saveState();
    render();
    showToast('Account updated.');
  }

  function deleteAccount(id) {
    if (state.accounts.length <= 1) {
      showToast('Keep at least one account.');
      return;
    }
    const account = accountById(id);
    const used = state.transactions.some((tx) => tx.accountId === id || tx.fromAccountId === id || tx.toAccountId === id)
      || state.recurring.some((rec) => rec.accountId === id || rec.fromAccountId === id || rec.toAccountId === id);
    if (used) {
      showToast('This account is used by tickets or recurring rules. Edit it instead of deleting.');
      return;
    }
    if (!confirm(`Delete account ${account?.name || ''}?`)) return;
    state.accounts = state.accounts.filter((item) => item.id !== id);
    saveState();
    render();
    showToast('Account deleted.');
  }

  function handleSettingsSubmit(event) {
    event.preventDefault();
    const previousCurrency = state.settings.currency;
    state.settings.currency = $('#settingsCurrency').value || 'USD';
    state.settings.savingGoal = Math.max(0, toNumber($('#savingGoal').value));
    saveState();
    render();
    const suffix = previousCurrency !== state.settings.currency ? ' Amounts are not converted.' : '';
    showToast(`Preferences saved.${suffix}`);
  }

  function applyRecurringTickets() {
    const today = todayISO();
    let added = 0;

    state.recurring.forEach((rec) => {
      if (!rec.active) return;
      let guard = 0;
      while (rec.nextDate && rec.nextDate <= today && guard < 120) {
        const exists = state.transactions.some((tx) => tx.sourceRecurringId === rec.id && tx.date === rec.nextDate);
        if (!exists) {
          state.transactions.push({
            id: uid(),
            type: rec.type,
            amount: rec.amount,
            date: rec.nextDate,
            note: rec.note,
            accountId: rec.accountId,
            fromAccountId: rec.fromAccountId,
            toAccountId: rec.toAccountId,
            categoryId: rec.categoryId,
            sourceRecurringId: rec.id,
            createdAt: new Date().toISOString(),
            updatedAt: null,
          });
          added += 1;
        }
        rec.nextDate = addPeriod(rec.nextDate, rec.frequency);
        guard += 1;
      }
    });

    if (added) {
      saveState();
      showToast(`${added} recurring ticket${added === 1 ? '' : 's'} added.`);
    }
  }

  function disableRecurring(id) {
    const rec = state.recurring.find((item) => item.id === id);
    if (!rec) return;
    rec.active = false;
    saveState();
    render();
    showToast('Recurring rule disabled.');
  }

  function render() {
    state = normalizeState(state);
    saveState();
    renderSetup();
    populateAccountSelects();
    populateTicketCategories();
    populateFilterCategories();
    updateTicketFormVisibility();
    renderHome();
    renderTransactions();
    renderCategories();
    renderSettings();
    renderRecurring();
  }

  function renderSetup() {
    $('#setupCard').classList.toggle('hidden', !!state.settings.setupComplete);
    $('#setupCurrency').value = state.settings.currency || 'USD';
  }

  function renderHome() {
    const currentMonth = monthKey(todayISO());
    const monthTx = state.transactions.filter((tx) => monthKey(tx.date) === currentMonth);
    const monthIncome = sumByType(monthTx, 'income');
    const monthExpense = sumByType(monthTx, 'expense');
    const monthNet = monthIncome - monthExpense;
    const elapsedDays = Math.max(1, getDayNumber(todayISO()));
    const daysInCurrentMonth = getDaysInMonth(todayISO());
    const avgDailySpend = monthExpense / elapsedDays;
    const projectedSpend = avgDailySpend * daysInCurrentMonth;
    const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpense) / monthIncome) * 100 : 0;

    $('#currentBalance').textContent = formatMoney(totalBalance());
    $('#balanceSubtext').textContent = `${state.accounts.length} account${state.accounts.length === 1 ? '' : 's'} · ${state.transactions.length} ticket${state.transactions.length === 1 ? '' : 's'}`;
    $('#monthIncome').textContent = formatMoney(monthIncome);
    $('#monthExpense').textContent = formatMoney(monthExpense);
    $('#monthNet').textContent = formatSignedMoney(monthNet);
    $('#dailySpend').textContent = formatMoney(avgDailySpend);
    $('#projectedSpend').textContent = formatMoney(projectedSpend);
    $('#savingsRate').textContent = `${Math.round(savingsRate)}%`;

    renderInsights({ monthIncome, monthExpense, monthNet, projectedSpend });
    renderCategoryChart();
    renderBalanceChart();
    renderCashflowChart();
    renderBudgetProgress();
    renderRecentTickets();
  }

  function renderInsights({ monthIncome, monthExpense, monthNet, projectedSpend }) {
    const insights = [];
    const last30 = transactionsInRange(daysAgo(29), todayISO()).filter((tx) => tx.type === 'expense');
    const categoryTotals = groupExpenseByCategory(last30);
    const top = categoryTotals[0];

    if (state.transactions.length === 0) {
      insights.push(['👋', 'Start with your next real ticket', 'Add every expense and income as it happens. Your graphs will become useful after a few days.']);
    }

    if (top && top.amount > 0) {
      insights.push(['🔎', 'Top spending category', `${top.name} is your biggest category in the last 30 days at ${formatMoney(top.amount)}.`]);
    }

    const overBudget = state.categories
      .filter((cat) => cat.type === 'expense' && cat.budget > 0)
      .map((cat) => {
        const spent = sumCategoryForMonth(cat.id, monthKey(todayISO()));
        return { cat, spent, ratio: cat.budget > 0 ? spent / cat.budget : 0 };
      })
      .filter((item) => item.ratio >= 0.9)
      .sort((a, b) => b.ratio - a.ratio)[0];

    if (overBudget) {
      const status = overBudget.ratio > 1 ? 'over' : 'near';
      insights.push(['⚠️', `Budget ${status} limit`, `${overBudget.cat.name} is at ${Math.round(overBudget.ratio * 100)}% of its monthly budget.`]);
    }

    if (state.settings.savingGoal > 0) {
      if (monthNet >= state.settings.savingGoal) {
        insights.push(['✅', 'Saving goal reached', `You are ${formatMoney(monthNet - state.settings.savingGoal)} above your monthly saving goal.`]);
      } else {
        insights.push(['🎯', 'Saving goal gap', `You need ${formatMoney(state.settings.savingGoal - monthNet)} more net savings this month.`]);
      }
    }

    if (monthIncome > 0 && projectedSpend > monthIncome) {
      insights.push(['📉', 'Spending pace is high', `At the current pace, spending may reach ${formatMoney(projectedSpend)}, above this month's income.`]);
    }

    if (monthExpense === 0 && state.transactions.length > 0) {
      insights.push(['🌱', 'Clean month so far', 'No expenses recorded this month yet.']);
    }

    $('#insightsList').innerHTML = insights.slice(0, 4).map(([icon, title, body]) => `
      <div class="insight-card">
        <div class="insight-icon">${escapeHtml(icon)}</div>
        <div><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(body)}</p></div>
      </div>
    `).join('') || emptyState('No insights yet. Add tickets to generate guidance.');
  }

  function renderCategoryChart() {
    const data = groupExpenseByCategory(transactionsInRange(daysAgo(29), todayISO()).filter((tx) => tx.type === 'expense')).slice(0, 8);
    if (!data.length) {
      $('#categoryChart').innerHTML = emptyState('No expenses in the last 30 days.');
      return;
    }
    const max = Math.max(...data.map((item) => item.amount));
    const width = 620;
    const rowHeight = 38;
    const height = 28 + data.length * rowHeight;
    const labelWidth = 175;
    const barWidth = width - labelWidth - 100;

    const rows = data.map((item, index) => {
      const y = 28 + index * rowHeight;
      const w = Math.max(4, (item.amount / max) * barWidth);
      return `
        <text class="chart-label" x="0" y="${y + 16}">${escapeSvg(item.emoji)} ${escapeSvg(shorten(item.name, 20))}</text>
        <rect x="${labelWidth}" y="${y}" width="${barWidth}" height="18" rx="9" fill="rgba(255,255,255,0.09)"></rect>
        <rect x="${labelWidth}" y="${y}" width="${w}" height="18" rx="9" fill="rgba(52,211,153,0.82)"></rect>
        <text class="chart-muted" x="${labelWidth + barWidth + 10}" y="${y + 14}">${escapeSvg(formatMoney(item.amount))}</text>
      `;
    }).join('');

    $('#categoryChart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Spending by category">${rows}</svg>`;
  }

  function renderBalanceChart() {
    const days = dateRange(daysAgo(44), todayISO());
    if (!state.accounts.length) {
      $('#balanceChart').innerHTML = emptyState('Add an account to see balance trend.');
      return;
    }
    const values = days.map((date) => ({ date, value: totalBalance(date) }));
    const width = 620;
    const height = 250;
    const pad = 32;
    let min = Math.min(...values.map((item) => item.value));
    let max = Math.max(...values.map((item) => item.value));
    if (min === max) {
      min -= Math.max(1, Math.abs(min) * 0.1);
      max += Math.max(1, Math.abs(max) * 0.1);
    }

    const xStep = (width - pad * 2) / Math.max(1, values.length - 1);
    const points = values.map((item, index) => {
      const x = pad + index * xStep;
      const y = height - pad - ((item.value - min) / (max - min)) * (height - pad * 2);
      return [x, y];
    });

    const linePath = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1][0].toFixed(1)} ${height - pad} L ${points[0][0].toFixed(1)} ${height - pad} Z`;

    $('#balanceChart').innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Balance trend">
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="rgba(255,255,255,0.12)" />
        <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="rgba(255,255,255,0.12)" />
        <text class="chart-muted" x="${pad}" y="18">${escapeSvg(formatMoney(max))}</text>
        <text class="chart-muted" x="${pad}" y="${height - 8}">${escapeSvg(formatMoney(min))}</text>
        <path class="chart-area" d="${areaPath}"></path>
        <path class="chart-line" d="${linePath}"></path>
        <text class="chart-muted" x="${pad}" y="${height - 8}">${escapeSvg(formatDateShort(values[0].date))}</text>
        <text class="chart-muted" x="${width - pad - 58}" y="${height - 8}">${escapeSvg(formatDateShort(values[values.length - 1].date))}</text>
      </svg>`;
  }

  function renderCashflowChart() {
    const months = lastNMonths(6);
    const data = months.map((month) => ({
      month,
      income: sumByType(state.transactions.filter((tx) => monthKey(tx.date) === month), 'income'),
      expense: sumByType(state.transactions.filter((tx) => monthKey(tx.date) === month), 'expense'),
    }));
    const max = Math.max(1, ...data.flatMap((item) => [item.income, item.expense]));
    const width = 620;
    const height = 255;
    const pad = 36;
    const groupWidth = (width - pad * 2) / data.length;
    const barWidth = Math.min(30, groupWidth * 0.28);
    const chartHeight = height - pad * 2;

    const bars = data.map((item, index) => {
      const baseX = pad + index * groupWidth + groupWidth / 2;
      const incH = (item.income / max) * chartHeight;
      const expH = (item.expense / max) * chartHeight;
      const incX = baseX - barWidth - 3;
      const expX = baseX + 3;
      const incY = height - pad - incH;
      const expY = height - pad - expH;
      return `
        <rect x="${incX}" y="${incY}" width="${barWidth}" height="${incH}" rx="6" fill="rgba(52,211,153,0.82)"></rect>
        <rect x="${expX}" y="${expY}" width="${barWidth}" height="${expH}" rx="6" fill="rgba(251,113,133,0.72)"></rect>
        <text class="chart-muted" x="${baseX - 22}" y="${height - 10}">${escapeSvg(formatMonthTiny(item.month))}</text>
      `;
    }).join('');

    $('#cashflowChart').innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Income versus spending">
        <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="rgba(255,255,255,0.12)" />
        <text class="chart-muted" x="${pad}" y="18">Max ${escapeSvg(formatMoney(max))}</text>
        ${bars}
        <circle cx="${width - 170}" cy="18" r="6" fill="rgba(52,211,153,0.82)"></circle>
        <text class="chart-muted" x="${width - 158}" y="22">Income</text>
        <circle cx="${width - 90}" cy="18" r="6" fill="rgba(251,113,133,0.72)"></circle>
        <text class="chart-muted" x="${width - 78}" y="22">Spent</text>
      </svg>`;
  }

  function renderBudgetProgress() {
    const currentMonth = monthKey(todayISO());
    const budgets = state.categories
      .filter((cat) => cat.type === 'expense' && cat.budget > 0)
      .map((cat) => {
        const spent = sumCategoryForMonth(cat.id, currentMonth);
        return { cat, spent, ratio: cat.budget > 0 ? spent / cat.budget : 0 };
      })
      .sort((a, b) => b.ratio - a.ratio);

    if (!budgets.length) {
      $('#budgetChart').innerHTML = emptyState('No budgets yet. Add monthly budgets inside Categories.');
      return;
    }

    $('#budgetChart').innerHTML = budgets.map(({ cat, spent, ratio }) => {
      const pct = Math.min(100, Math.round(ratio * 100));
      const over = ratio > 1;
      return `
        <div class="budget-item">
          <div class="budget-header">
            <strong>${escapeHtml(cat.emoji)} ${escapeHtml(cat.name)}</strong>
            <span>${escapeHtml(formatMoney(spent))} / ${escapeHtml(formatMoney(cat.budget))}</span>
          </div>
          <div class="progress ${over ? 'over' : ''}"><span style="width:${pct}%"></span></div>
          <p class="muted">${Math.round(ratio * 100)}% used${over ? ` · over by ${escapeHtml(formatMoney(spent - cat.budget))}` : ''}</p>
        </div>
      `;
    }).join('');
  }

  function renderRecentTickets() {
    const recent = sortedTransactions().slice(0, 5);
    $('#recentTickets').innerHTML = recent.length ? recent.map(renderTicketItem).join('') : emptyState('No tickets yet.');
  }

  function renderTransactions() {
    const tickets = filteredTransactions();
    const income = sumByType(tickets, 'income');
    const expense = sumByType(tickets, 'expense');
    const net = income - expense;

    $('#ticketsSummary').innerHTML = [
      `<span class="pill">${tickets.length} ticket${tickets.length === 1 ? '' : 's'}</span>`,
      `<span class="pill">Income ${escapeHtml(formatMoney(income))}</span>`,
      `<span class="pill">Spent ${escapeHtml(formatMoney(expense))}</span>`,
      `<span class="pill">Net ${escapeHtml(formatSignedMoney(net))}</span>`,
    ].join('');

    $('#ticketList').innerHTML = tickets.length ? tickets.map(renderTicketItem).join('') : emptyState('No tickets match your filters.');
  }

  function renderTicketItem(tx) {
    const title = ticketHtmlTitle(tx);
    const meta = ticketMeta(tx);
    const amount = tx.type === 'expense' ? `-${formatMoney(tx.amount)}` : tx.type === 'income' ? `+${formatMoney(tx.amount)}` : `⇄ ${formatMoney(tx.amount)}`;
    return `
      <article class="ticket-item">
        <div class="ticket-main">
          <div class="ticket-title">${title}</div>
          <div class="ticket-meta">${escapeHtml(meta)}</div>
          ${tx.sourceRecurringId ? '<div class="ticket-meta">Recurring</div>' : ''}
        </div>
        <div>
          <div class="ticket-amount ${escapeHtml(tx.type)}">${escapeHtml(amount)}</div>
          <div class="ticket-actions">
            <button class="icon-btn" type="button" data-action="duplicate-ticket" data-id="${escapeHtml(tx.id)}">Copy</button>
            <button class="icon-btn" type="button" data-action="edit-ticket" data-id="${escapeHtml(tx.id)}">Edit</button>
            <button class="icon-btn" type="button" data-action="delete-ticket" data-id="${escapeHtml(tx.id)}">Delete</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderCategories() {
    const expenses = state.categories.filter((cat) => cat.type === 'expense').sort(sortByName);
    const incomes = state.categories.filter((cat) => cat.type === 'income').sort(sortByName);
    $('#expenseCategories').innerHTML = expenses.map(renderCategoryItem).join('') || emptyState('No expense categories.');
    $('#incomeCategories').innerHTML = incomes.map(renderCategoryItem).join('') || emptyState('No income categories.');
  }

  function renderCategoryItem(category) {
    const usedCount = state.transactions.filter((tx) => tx.categoryId === category.id).length;
    const budget = category.type === 'expense' && category.budget > 0 ? ` · budget ${formatMoney(category.budget)}` : '';
    return `
      <article class="category-item">
        <div class="category-emoji">${escapeHtml(category.emoji)}</div>
        <div>
          <div class="category-name">${escapeHtml(category.name)}</div>
          <div class="category-meta">${escapeHtml(category.type)} · ${usedCount} ticket${usedCount === 1 ? '' : 's'}${escapeHtml(budget)}</div>
        </div>
        <div class="ticket-actions">
          <button class="icon-btn" type="button" data-action="edit-category" data-id="${escapeHtml(category.id)}">Edit</button>
          <button class="icon-btn" type="button" data-action="delete-category" data-id="${escapeHtml(category.id)}">Delete</button>
        </div>
      </article>
    `;
  }

  function renderSettings() {
    $('#settingsCurrency').value = state.settings.currency || 'USD';
    $('#savingGoal').value = state.settings.savingGoal || '';

    $('#accountList').innerHTML = state.accounts.map((account) => {
      const balance = accountBalance(account.id);
      const usedCount = state.transactions.filter((tx) => tx.accountId === account.id || tx.fromAccountId === account.id || tx.toAccountId === account.id).length;
      return `
        <article class="account-item">
          <div class="category-emoji">🏦</div>
          <div>
            <div class="account-name">${escapeHtml(account.name)}</div>
            <div class="account-meta">Current ${escapeHtml(formatMoney(balance))} · start ${escapeHtml(formatMoney(account.startingBalance))} · ${usedCount} ticket${usedCount === 1 ? '' : 's'}</div>
          </div>
          <div class="ticket-actions">
            <button class="icon-btn" type="button" data-action="edit-account" data-id="${escapeHtml(account.id)}">Edit</button>
            <button class="icon-btn" type="button" data-action="delete-account" data-id="${escapeHtml(account.id)}">Delete</button>
          </div>
        </article>
      `;
    }).join('') || emptyState('No accounts yet.');
  }

  function renderRecurring() {
    const active = state.recurring.filter((rec) => rec.active);
    $('#recurringList').innerHTML = active.length ? active.map((rec) => {
      const tempTx = {
        id: rec.id,
        type: rec.type,
        amount: rec.amount,
        date: rec.nextDate,
        note: rec.note,
        accountId: rec.accountId,
        fromAccountId: rec.fromAccountId,
        toAccountId: rec.toAccountId,
        categoryId: rec.categoryId,
      };
      return `
        <article class="ticket-item">
          <div class="ticket-main">
            <div class="ticket-title">${ticketHtmlTitle(tempTx)}</div>
            <div class="ticket-meta">${escapeHtml(rec.frequency)} · next ${escapeHtml(formatDate(rec.nextDate))} · ${escapeHtml(ticketMeta(tempTx, false))}</div>
          </div>
          <div>
            <div class="ticket-amount ${escapeHtml(rec.type)}">${rec.type === 'expense' ? '-' : rec.type === 'income' ? '+' : '⇄'}${escapeHtml(formatMoney(rec.amount))}</div>
            <div class="ticket-actions"><button class="icon-btn" type="button" data-action="disable-recurring" data-id="${escapeHtml(rec.id)}">Disable</button></div>
          </div>
        </article>
      `;
    }).join('') : emptyState('No recurring tickets.');
  }

  function populateAccountSelects() {
    const options = state.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${escapeHtml(formatMoney(accountBalance(account.id)))}</option>`).join('');
    ['#ticketAccount', '#transferFrom', '#transferTo'].forEach((selector) => {
      const select = $(selector);
      const previous = select.value;
      select.innerHTML = options;
      if (state.accounts.some((account) => account.id === previous)) select.value = previous;
    });
    if (state.accounts.length > 1 && $('#transferFrom').value === $('#transferTo').value) {
      $('#transferTo').value = state.accounts[1].id;
    }
  }

  function populateTicketCategories() {
    const type = $('#ticketType').value === 'income' ? 'income' : 'expense';
    const previous = $('#ticketCategory').value;
    const categories = state.categories.filter((cat) => cat.type === type).sort(sortByName);
    $('#ticketCategory').innerHTML = categories.map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.emoji)} ${escapeHtml(cat.name)}</option>`).join('');
    if (categories.some((cat) => cat.id === previous)) $('#ticketCategory').value = previous;
  }

  function populateFilterCategories() {
    const previous = $('#filterCategory').value || 'all';
    $('#filterCategory').innerHTML = `<option value="all">All</option>` + state.categories
      .sort(sortByName)
      .map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.emoji)} ${escapeHtml(cat.name)}</option>`).join('');
    $('#filterCategory').value = state.categories.some((cat) => cat.id === previous) ? previous : 'all';
  }

  function updateTicketFormVisibility() {
    const type = $('#ticketType').value;
    const isTransfer = type === 'transfer';
    $('#singleAccountField').classList.toggle('hidden', isTransfer);
    $('#transferAccountFields').classList.toggle('hidden', !isTransfer);
    $('#categoryField').classList.toggle('hidden', isTransfer);
  }

  function filteredTransactions() {
    const selectedMonth = $('#filterMonth').value;
    const type = $('#filterType').value;
    const category = $('#filterCategory').value;
    const query = $('#filterSearch').value.trim().toLowerCase();

    return sortedTransactions().filter((tx) => {
      if (selectedMonth && monthKey(tx.date) !== selectedMonth) return false;
      if (type !== 'all' && tx.type !== type) return false;
      if (category !== 'all' && tx.categoryId !== category) return false;
      if (query) {
        const haystack = [ticketPlainTitle(tx), ticketMeta(tx), tx.note || ''].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function sortedTransactions() {
    return [...state.transactions].sort((a, b) => (b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));
  }

  function groupExpenseByCategory(transactions) {
    const map = new Map();
    transactions.forEach((tx) => {
      if (tx.type !== 'expense') return;
      const category = categoryById(tx.categoryId) || { id: 'uncategorized', name: 'Uncategorized', emoji: '📌' };
      const current = map.get(category.id) || { id: category.id, name: category.name, emoji: category.emoji, amount: 0 };
      current.amount += tx.amount;
      map.set(category.id, current);
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }

  function sumByType(transactions, type) {
    return transactions.filter((tx) => tx.type === type).reduce((total, tx) => total + tx.amount, 0);
  }

  function sumCategoryForMonth(categoryId, month) {
    return state.transactions
      .filter((tx) => tx.type === 'expense' && tx.categoryId === categoryId && monthKey(tx.date) === month)
      .reduce((total, tx) => total + tx.amount, 0);
  }

  function transactionsInRange(startDate, endDate) {
    return state.transactions.filter((tx) => tx.date >= startDate && tx.date <= endDate);
  }

  function totalBalance(untilDate = null) {
    return state.accounts.reduce((total, account) => total + accountBalance(account.id, untilDate), 0);
  }

  function accountBalance(accountId, untilDate = null) {
    const account = accountById(accountId);
    if (!account) return 0;
    return state.transactions.reduce((balance, tx) => {
      if (untilDate && tx.date > untilDate) return balance;
      if (tx.type === 'income' && tx.accountId === accountId) return balance + tx.amount;
      if (tx.type === 'expense' && tx.accountId === accountId) return balance - tx.amount;
      if (tx.type === 'transfer' && tx.fromAccountId === accountId) return balance - tx.amount;
      if (tx.type === 'transfer' && tx.toAccountId === accountId) return balance + tx.amount;
      return balance;
    }, account.startingBalance || 0);
  }

  function ticketPlainTitle(tx) {
    if (tx.type === 'transfer') return 'Transfer';
    const category = categoryById(tx.categoryId);
    return `${category?.emoji || '📌'} ${category?.name || 'Uncategorized'}`;
  }

  function ticketHtmlTitle(tx) {
    if (tx.type === 'transfer') return `<span>↔️</span><span>Transfer</span>`;
    const category = categoryById(tx.categoryId);
    return `<span>${escapeHtml(category?.emoji || '📌')}</span><span>${escapeHtml(category?.name || 'Uncategorized')}</span>`;
  }

  function ticketMeta(tx, includeDate = true) {
    const parts = [];
    if (includeDate) parts.push(formatDate(tx.date));
    if (tx.type === 'transfer') {
      parts.push(`${accountById(tx.fromAccountId)?.name || 'Unknown'} → ${accountById(tx.toAccountId)?.name || 'Unknown'}`);
    } else {
      parts.push(accountById(tx.accountId)?.name || 'Unknown account');
    }
    if (tx.note) parts.push(tx.note);
    return parts.join(' · ');
  }

  function categoryById(id) {
    return state.categories.find((cat) => cat.id === id);
  }

  function accountById(id) {
    return state.accounts.find((account) => account.id === id);
  }

  function go(viewName) {
    if (!VIEWS.includes(viewName)) return;
    VIEWS.forEach((view) => {
      $(`#${view}View`).classList.toggle('active', view === viewName);
      $(`#${view}Tab`).classList.toggle('active', view === viewName);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function exportJson() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), app: 'MoneyDock', data: state }, null, 2);
    downloadFile(`moneydock-backup-${todayISO()}.json`, payload, 'application/json');
    showToast('JSON backup downloaded.');
  }

  function exportCsv() {
    const rows = [
      ['date', 'type', 'amount', 'category', 'account', 'from_account', 'to_account', 'note'],
      ...sortedTransactions().map((tx) => [
        tx.date,
        tx.type,
        String(tx.amount),
        tx.type === 'transfer' ? '' : (categoryById(tx.categoryId)?.name || 'Uncategorized'),
        tx.type === 'transfer' ? '' : (accountById(tx.accountId)?.name || ''),
        tx.type === 'transfer' ? (accountById(tx.fromAccountId)?.name || '') : '',
        tx.type === 'transfer' ? (accountById(tx.toAccountId)?.name || '') : '',
        tx.note || '',
      ]),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    downloadFile(`moneydock-tickets-${todayISO()}.csv`, csv, 'text/csv');
    showToast('CSV exported.');
  }

  function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const imported = parsed.data || parsed;
        const normalized = normalizeState(imported);
        if (!Array.isArray(normalized.categories) || !Array.isArray(normalized.transactions)) throw new Error('Invalid backup');
        if (!confirm('Importing will replace all current MoneyDock data on this device. Continue?')) return;
        state = normalized;
        saveState();
        applyRecurringTickets();
        render();
        go('home');
        showToast('Backup imported.');
      } catch (error) {
        console.error(error);
        showToast('Could not import this file.');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function resetAllData() {
    if (!confirm('Delete all MoneyDock data on this device? This cannot be undone unless you have a backup.')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = createDefaultState();
    editingId = null;
    setDefaultDates();
    render();
    go('home');
    showToast('All data deleted.');
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function formatMoney(amount) {
    const currency = state.settings.currency || 'USD';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: currency === 'LBP' ? 0 : 2,
      }).format(amount || 0);
    } catch (error) {
      return `${currency} ${(amount || 0).toFixed(2)}`;
    }
  }

  function formatSignedMoney(amount) {
    if (amount === 0) return formatMoney(0);
    return `${amount > 0 ? '+' : '-'}${formatMoney(Math.abs(amount))}`;
  }

  function formatDate(dateStr) {
    const date = localDate(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateShort(dateStr) {
    const date = localDate(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatMonthTiny(month) {
    const [year, m] = month.split('-').map(Number);
    return new Date(year, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function validDateOrToday(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : todayISO();
  }

  function toISODate(date) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const year = copy.getFullYear();
    const month = String(copy.getMonth() + 1).padStart(2, '0');
    const day = String(copy.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function localDate(iso) {
    const [year, month, day] = validDateOrToday(iso).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function addDays(iso, days) {
    const date = localDate(iso);
    date.setDate(date.getDate() + days);
    return toISODate(date);
  }

  function daysAgo(days) {
    return addDays(todayISO(), -days);
  }

  function addPeriod(iso, frequency) {
    const date = localDate(iso);
    if (frequency === 'weekly') {
      date.setDate(date.getDate() + 7);
    } else {
      const day = date.getDate();
      date.setMonth(date.getMonth() + 1);
      if (date.getDate() < day) date.setDate(0);
    }
    return toISODate(date);
  }

  function dateRange(startIso, endIso) {
    const days = [];
    let cursor = startIso;
    let guard = 0;
    while (cursor <= endIso && guard < 370) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return days;
  }

  function monthKey(iso) {
    return validDateOrToday(iso).slice(0, 7);
  }

  function lastNMonths(n) {
    const date = localDate(todayISO());
    const months = [];
    for (let i = n - 1; i >= 0; i -= 1) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  }

  function getDayNumber(iso) {
    return localDate(iso).getDate();
  }

  function getDaysInMonth(iso) {
    const date = localDate(iso);
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function toNumber(value) {
    const num = Number.parseFloat(String(value || '').replace(/,/g, ''));
    return Number.isFinite(num) ? num : 0;
  }

  function sortByName(a, b) {
    return a.name.localeCompare(b.name);
  }

  function uid() {
    return crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function shorten(text, max) {
    const value = String(text || '');
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeSvg(value) {
    return escapeHtml(value);
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  }

  function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }
})();
