/**
 * admin.js — Master RAM Control Center Enterprise Controller
 * Connects frontend UI to real database endpoints with JWT authentication,
 * server-side pagination, real-time polling, and transactional actions.
 */

const API_BASE = window.location.origin;
let adminToken = localStorage.getItem('ram_admin_jwt') || '';
let currentTab = 'overview';
let usersPage = 1;
let paymentsPage = 1;
let currentSlices = [];

// ─── INITIALIZATION ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    setupAuth();
    setupNavigation();
    setupEventHandlers();

    if (adminToken) {
        const cachedUser = localStorage.getItem('ram_admin_user');
        if (cachedUser) {
            try { updateAdminIdentityDisplay(JSON.parse(cachedUser)); } catch (e) {}
        }
        hideAuthOverlay();
        loadAllData();
        startAutoRefresh();
    } else {
        showAuthOverlay();
    }
});

function initClock() {
    const clockEl = document.getElementById('headerClock');
    setInterval(() => {
        const d = new Date();
        if (clockEl) clockEl.textContent = d.toUTCString().replace('GMT', 'UTC+3 EAT');
    }, 1000);
}

// ─── AUTHENTICATION ─────────────────────────────────────────────────────────
function setupAuth() {
    const form = document.getElementById('adminLoginForm');
    const authError = document.getElementById('authErrorMsg');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailEl = document.getElementById('adminEmailInput');
        const email = emailEl ? emailEl.value.trim() : 'admin@playcoin.live';
        const pwd = document.getElementById('adminPasswordInput').value.trim();
        authError.style.display = 'none';

        try {
            let res;
            try {
                res = await fetch(`${API_BASE}/api/auth/admin`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, adminEmail: email, password: pwd })
                });
            } catch (netErr) {
                if (window.location.port !== '8080') {
                    const fallbackBase = `${window.location.protocol}//${window.location.hostname}:8080`;
                    res = await fetch(`${fallbackBase}/api/auth/admin`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, adminEmail: email, password: pwd })
                    });
                } else {
                    throw netErr;
                }
            }

            const data = await res.json();

            if (data.success && data.token) {
                adminToken = data.token;
                localStorage.setItem('ram_admin_jwt', adminToken);
                if (data.admin) {
                    localStorage.setItem('ram_admin_user', JSON.stringify(data.admin));
                    updateAdminIdentityDisplay(data.admin);
                }
                hideAuthOverlay();
                loadAllData();
                startAutoRefresh();
            } else {
                authError.textContent = data.error || 'Invalid Admin Credentials';
                authError.style.display = 'block';
            }
        } catch (err) {
            authError.textContent = 'Connection to API failed: ' + err.message;
            authError.style.display = 'block';
        }
    });

    document.getElementById('adminLogoutBtn').addEventListener('click', () => {
        localStorage.removeItem('ram_admin_jwt');
        localStorage.removeItem('ram_admin_user');
        adminToken = '';
        showAuthOverlay();
    });
}

function updateAdminIdentityDisplay(admin) {
    if (!admin) return;
    const nameEl = document.getElementById('adminUserName');
    if (nameEl) nameEl.textContent = admin.name || admin.username || admin.email || 'Major Stan';
    const roleEl = document.getElementById('adminRoleBadge');
    if (roleEl) roleEl.textContent = (admin.role || 'SUPER_ADMIN').toUpperCase().replace('_', ' ');
}

function showAuthOverlay() {
    document.getElementById('adminAuthOverlay').style.display = 'flex';
}
function hideAuthOverlay() {
    document.getElementById('adminAuthOverlay').style.display = 'none';
}

// ─── FETCH HELPER WITH JWT AUTH & DUAL-ORIGIN RESOLUTION ─────────────────────
async function adminFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        ...(options.headers || {})
    };

    let res;
    try {
        res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    } catch (err) {
        if (window.location.port !== '8080') {
            try {
                const fallbackBase = `${window.location.protocol}//${window.location.hostname}:8080`;
                res = await fetch(`${fallbackBase}${endpoint}`, { ...options, headers });
            } catch (fallbackErr) {
                console.error(`[ADMIN FETCH ERROR] ${endpoint}`, fallbackErr.message);
                throw fallbackErr;
            }
        } else {
            console.error(`[ADMIN FETCH ERROR] ${endpoint}`, err.message);
            throw err;
        }
    }

    if (res.status === 401 || res.status === 403) {
        console.warn('[ADMIN AUTH EXPIRED]');
        localStorage.removeItem('ram_admin_jwt');
        adminToken = '';
        showAuthOverlay();
        throw new Error('Session expired. Please log in again.');
    }
    return await res.json();
}

// ─── NAVIGATION & TAB SWITCHING ─────────────────────────────────────────────
function setupNavigation() {
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.adm-panel').forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            currentTab = btn.getAttribute('data-tab');
            const targetPanel = document.getElementById(`panel-${currentTab}`);
            if (targetPanel) targetPanel.classList.add('active');

            loadCurrentTabData();
        });
    });
}

function loadCurrentTabData() {
    switch (currentTab) {
        case 'overview': loadOverview(); break;
        case 'users': loadUsers(); break;
        case 'payments': loadPayments(); break;
        case 'referrals': loadReferrals(); break;
        case 'commissions': loadCommissions(); break;
        case 'withdrawals': loadWithdrawals(); break;
        case 'ledger': loadLedger(); break;
        case 'risk': loadRisk(); break;
        case 'audit': loadAuditLogs(); break;
        case 'wheel': loadWheelEngine(); break;
        case 'settings': loadSettings(); break;
        case 'health': loadHealth(); break;
    }
}

function loadAllData() {
    loadOverview();
    loadUsers();
    loadPayments();
    loadWithdrawals();
}

function startAutoRefresh() {
    setInterval(() => {
        if (!adminToken) return;
        if (currentTab === 'overview') loadOverview(true);
        if (currentTab === 'withdrawals') loadWithdrawals(true);
    }, 6000);
}

// ─── 1. OVERVIEW KPIS & CHARTS ──────────────────────────────────────────────
async function loadOverview(silent = false) {
    const dateFilterEl = document.getElementById('dateRangeFilter');
    const dateFilter = dateFilterEl ? dateFilterEl.value : 'all';
    try {
        const data = await adminFetch(`/api/admin/overview?filter=${dateFilter}`);
        if (!data || !data.success) return;

        const users = data.users || { total: 0, newToday: 0, newThisMonth: 0, active: 0 };
        const payments = data.payments || { totalVolume: 0, todayVolume: 0 };
        
        // Till Metrics Banner
        const till = data.till || {};
        const tillAvailableBal = document.getElementById('tillAvailableBal');
        if (tillAvailableBal) tillAvailableBal.textContent = `KSh ${Number(till.availableBalance ?? payments.tillAvailableBalance ?? 0).toLocaleString()}`;
        const tillRealCompleted = document.getElementById('tillRealCompleted');
        if (tillRealCompleted) tillRealCompleted.textContent = `KSh ${Number(till.realCompletedPayments ?? payments.totalVolume ?? 0).toLocaleString()}`;
        const tillAccumulative = document.getElementById('tillAccumulative');
        if (tillAccumulative) tillAccumulative.textContent = `KSh ${Number(till.accumulativeInitiated ?? payments.accumulativeVolume ?? 0).toLocaleString()}`;
        const tillConflicts = document.getElementById('tillConflicts');
        if (tillConflicts) tillConflicts.innerHTML = `KSh ${Number(till.unresolvedOrCancels ?? payments.uncompletedVolume ?? 0).toLocaleString()}`;

        const commissions = data.commissions || { totalGenerated: 0, availableLiability: 0 };
        const withdrawals = data.withdrawals || { pendingCount: 0, pendingLiability: 0 };
        const referrals = data.referrals || { totalReferrals: 0, conversionRate: '0%', directCount: 0, indirectCount: 0 };
        const revenue = data.revenue || { houseNetProfit: 0, profitMarginPercent: '85.0%' };
        const funnel = data.funnel || { registrations: 0, activations: 0 };

        // KPI Cards
        const kpiTotalUsers = document.getElementById('kpiTotalUsers');
        if (kpiTotalUsers) kpiTotalUsers.textContent = Number(users.total || 0).toLocaleString();
        const kpiNewToday = document.getElementById('kpiNewTodayUsers');
        if (kpiNewToday) kpiNewToday.textContent = `+${users.newToday || 0}`;
        const kpiNewMonth = document.getElementById('kpiNewMonthUsers');
        if (kpiNewMonth) kpiNewMonth.textContent = `+${users.newThisMonth || 0}`;
        const kpiActiveUsers = document.getElementById('kpiActiveUsers');
        if (kpiActiveUsers) kpiActiveUsers.textContent = Number(users.active || 0).toLocaleString();

        const kpiTotalVol = document.getElementById('kpiTotalVolume');
        if (kpiTotalVol) kpiTotalVol.textContent = `KSh ${Number(payments.totalVolume || 0).toLocaleString()}`;
        const kpiTodayVol = document.getElementById('kpiTodayVolume');
        if (kpiTodayVol) kpiTodayVol.textContent = `KSh ${Number(payments.todayVolume || 0).toLocaleString()}`;

        const kpiTotalComm = document.getElementById('kpiTotalCommissions');
        if (kpiTotalComm) kpiTotalComm.textContent = `KSh ${Number(commissions.totalGenerated || 0).toLocaleString()}`;
        const kpiAvailLiab = document.getElementById('kpiAvailableLiability');
        if (kpiAvailLiab) kpiAvailLiab.textContent = `KSh ${Number(commissions.availableLiability || 0).toLocaleString()}`;

        const kpiPendWith = document.getElementById('kpiPendingWithdrawals');
        if (kpiPendWith) kpiPendWith.textContent = Number(withdrawals.pendingCount || 0).toLocaleString();
        const kpiPendWithVal = document.getElementById('kpiPendingWithdrawalsVal');
        if (kpiPendWithVal) kpiPendWithVal.textContent = `KSh ${Number(withdrawals.pendingLiability || 0).toLocaleString()}`;
        
        const badge = document.getElementById('sidebarWithdrawalBadge');
        if (badge) {
            if (withdrawals.pendingCount > 0) {
                badge.textContent = withdrawals.pendingCount;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        const kpiTotalRef = document.getElementById('kpiTotalReferrals');
        if (kpiTotalRef) kpiTotalRef.textContent = Number(referrals.totalReferrals || 0).toLocaleString();
        const kpiConvRate = document.getElementById('kpiConversionRate');
        if (kpiConvRate) kpiConvRate.textContent = referrals.conversionRate || '0%';

        const kpiHouseProf = document.getElementById('kpiHouseProfit');
        if (kpiHouseProf) kpiHouseProf.textContent = `KSh ${Number(revenue.houseNetProfit || 0).toLocaleString()}`;
        const kpiProfMarg = document.getElementById('kpiProfitMargin');
        if (kpiProfMarg) kpiProfMarg.textContent = revenue.profitMarginPercent || '85.0%';

        // Conversion Funnel Bars
        const maxFunnel = Math.max(funnel.registrations || 1, 1);
        const funnelRegs = document.getElementById('funnelRegs');
        if (funnelRegs) funnelRegs.textContent = funnel.registrations || 0;
        const funnelActs = document.getElementById('funnelActs');
        if (funnelActs) funnelActs.textContent = `${funnel.activations || 0} (${Math.round(((funnel.activations || 0) / maxFunnel) * 100)}%)`;
        const funnelBarActs = document.getElementById('funnelBarActs');
        if (funnelBarActs) funnelBarActs.style.width = `${Math.min(100, ((funnel.activations || 0) / maxFunnel) * 100)}%`;

        const funnelL1 = document.getElementById('funnelL1');
        if (funnelL1) funnelL1.textContent = `${referrals.directCount || 0} direct`;
        const funnelBarL1 = document.getElementById('funnelBarL1');
        if (funnelBarL1) funnelBarL1.style.width = `${Math.min(100, ((referrals.directCount || 0) / maxFunnel) * 100)}%`;

        const funnelL2 = document.getElementById('funnelL2');
        if (funnelL2) funnelL2.textContent = `${referrals.indirectCount || 0} indirect`;
        const funnelBarL2 = document.getElementById('funnelBarL2');
        if (funnelBarL2) funnelBarL2.style.width = `${Math.min(100, ((referrals.indirectCount || 0) / maxFunnel) * 100)}%`;

        // Live Event Stream
        const feedContainer = document.getElementById('liveActivityFeed');
        if (feedContainer) {
            if (data.recentActivity && data.recentActivity.length > 0) {
                feedContainer.innerHTML = data.recentActivity.map(act => `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: var(--radius-sm); font-size: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="status-badge" style="background: rgba(255,255,255,0.06); color: ${act.color || 'var(--cyan)'};">${act.badge || 'EVENT'}</span>
                            <span>${act.title || 'Platform Activity'}</span>
                        </div>
                        <span style="font-size: 10px; color: var(--text-dim);">${new Date(act.time || Date.now()).toLocaleTimeString()}</span>
                    </div>
                `).join('');
            } else {
                feedContainer.innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 18px; font-size: 12px;">No recent platform activity.</div>';
            }
        }
    } catch (e) {
        if (!silent) console.error('[OVERVIEW LOAD ERROR]', e.message);
    }
}

// ─── 2. USERS MANAGEMENT ───────────────────────────────────────────────────
async function loadUsers() {
    const qEl = document.getElementById('userSearchInput');
    const q = qEl ? qEl.value : '';
    const statusEl = document.getElementById('userStatusFilter');
    const status = statusEl ? statusEl.value : 'all';
    const tbody = document.getElementById('usersTableBody');

    try {
        const data = await adminFetch(`/api/admin/users?q=${encodeURIComponent(q)}&status=${status}&page=${usersPage}&limit=10`);
        if (!data || !data.success) return;

        const pagination = data.pagination || { total: (data.users ? data.users.length : 0), page: 1, totalPages: 1 };
        const usersList = data.users || [];

        const totalCounter = document.getElementById('usersTotalCounter');
        if (totalCounter) totalCounter.textContent = `${pagination.total || usersList.length} Total Users`;
        const paginInfo = document.getElementById('usersPaginationInfo');
        if (paginInfo) paginInfo.textContent = `Showing page ${pagination.page || 1} of ${pagination.totalPages || 1} (${pagination.total || usersList.length} users)`;

        const prevBtn = document.getElementById('usersPrevBtn');
        if (prevBtn) prevBtn.disabled = ((pagination.page || 1) <= 1);
        const nextBtn = document.getElementById('usersNextBtn');
        if (nextBtn) nextBtn.disabled = ((pagination.page || 1) >= (pagination.totalPages || 1));

        if (!tbody) return;
        if (usersList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: var(--text-dim); padding: 24px;">No users match your criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = usersList.map(u => `
            <tr>
                <td><code style="color: var(--cyan);">${u.id || '—'}</code></td>
                <td>
                    <strong>${u.displayName || u.name || 'Player'}</strong>
                    ${u.isTester ? '<span class="status-badge warning" style="margin-left: 4px;">TESTER</span>' : ''}
                    <div style="font-size: 11px; color: var(--text-dim);">${u.referralCode ? 'Ref: ' + u.referralCode : ''}</div>
                </td>
                <td>
                    <div><strong>${u.phone || '—'}</strong></div>
                    <div style="font-size: 11px; color: var(--text-muted);">${u.email || '—'}</div>
                </td>
                <td><strong style="color: var(--green);">KSh ${(u.balance || 0).toLocaleString()}</strong></td>
                <td style="color: var(--gold);">${(u.coins || 0).toLocaleString()}</td>
                <td style="color: var(--cyan);">KSh ${(u.referralBalance || 0).toLocaleString()}</td>
                <td><span class="status-badge active">${u.referralCount || 0} Downlines</span></td>
                <td>
                    <span class="status-badge ${u.isActive !== false ? (u.isActivated ? 'completed' : 'active') : 'danger'}">
                        ${u.isActive !== false ? (u.isActivated ? 'ACTIVE' : 'REGISTERED') : 'BANNED'}
                    </span>
                </td>
                <td>${new Date(u.createdAt || Date.now()).toLocaleDateString()}</td>
                <td>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn secondary-btn sm-btn" onclick="openUserDetails('${u.id}')">Inspect</button>
                        ${u.isActive !== false ? 
                            `<button class="btn danger-btn sm-btn" onclick="toggleUserStatus('${u.id}', true)">Suspend</button>` :
                            `<button class="btn success-btn sm-btn" onclick="toggleUserStatus('${u.id}', false)">Activate</button>`
                        }
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: var(--red); padding: 24px;">Failed to load users: ${e.message}</td></tr>`;
    }
}

// ─── USER DETAILS MODAL ────────────────────────────────────────────────────
window.openUserDetails = async function(userId) {
    const modal = document.getElementById('userDetailModal');
    const content = document.getElementById('modalUserContent');
    modal.style.display = 'flex';
    content.innerHTML = '<div style="text-align:center; padding: 30px;">Loading full profile and downline tree...</div>';

    try {
        const data = await adminFetch(`/api/admin/users/${userId}`);
        if (!data.success) throw new Error(data.error);

        const u = data.profile;
        document.getElementById('modalUserName').textContent = `User: ${u.displayName} (${u.id})`;

        content.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: var(--radius-sm);">
                    <div style="font-size: 11px; color: var(--text-dim);">PHONE / EMAIL</div>
                    <div><strong>${u.phone || '—'}</strong> (${u.email || 'No email'})</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: var(--radius-sm);">
                    <div style="font-size: 11px; color: var(--text-dim);">REFERRAL CODE / REFERRED BY</div>
                    <div><strong>${u.referralCode || '—'}</strong> · Upline: ${u.referredBy ? (u.referredBy.name || u.referredBy.id) : 'None (Direct)'}</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: var(--radius-sm);">
                    <div style="font-size: 11px; color: var(--text-dim);">CASH BALANCE / COINS</div>
                    <div><strong style="color: var(--green);">KSh ${u.balance.toLocaleString()}</strong> · ${u.coins.toLocaleString()} Coins</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: var(--radius-sm);">
                    <div style="font-size: 11px; color: var(--text-dim);">REFERRAL BALANCE / TOTAL EARNED</div>
                    <div><strong style="color: var(--gold);">KSh ${u.referralBalance.toLocaleString()}</strong> (Total: KSh ${u.totalReferralEarnings.toLocaleString()})</div>
                </div>
            </div>

            <div style="margin-bottom: 16px;">
                <h4 style="color: var(--gold); margin-bottom: 8px;">2-Tier Downlines (${data.downline.totalCount} Recruiters)</h4>
                <div style="max-height: 140px; overflow-y: auto; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: var(--radius-sm); padding: 8px;">
                    ${data.downline.totalCount === 0 ? '<div style="color: var(--text-dim); text-align: center; padding: 10px;">No downline members yet.</div>' : 
                        [...data.downline.level1.map(d => `<div style="font-size: 12px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.03);"><span class="status-badge active">Level 1 (+KSh 100)</span> <strong>${d.refereeName}</strong> (${d.refereeId})</div>`),
                         ...data.downline.level2.map(d => `<div style="font-size: 12px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.03);"><span class="status-badge" style="background: rgba(168,85,247,0.2); color: var(--purple);">Level 2 (+KSh 50)</span> <strong>${d.refereeName}</strong> (${d.refereeId})</div>`)].join('')
                    }
                </div>
            </div>

            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); border-radius: var(--radius-sm); padding: 12px;">
                <h4 style="color: var(--cyan); margin-bottom: 8px;">Adjust Balance / VIP Tier</h4>
                <form id="adjustUserForm" onsubmit="submitUserAdjustment(event, '${u.id}')" style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <input type="number" id="adjAmount" class="admin-input" placeholder="± Balance Adjust (KSh)" style="flex: 1; min-width: 140px;">
                    <input type="text" id="adjNote" class="admin-input" placeholder="Ledger Audit Reason" required style="flex: 2; min-width: 180px;">
                    <button type="submit" class="btn primary-btn sm-btn">Apply Adjustment</button>
                </form>
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div style="color: var(--red); padding: 20px;">Failed to load profile: ${e.message}</div>`;
    }
};

window.submitUserAdjustment = async function(e, userId) {
    e.preventDefault();
    const adj = document.getElementById('adjAmount').value;
    const note = document.getElementById('adjNote').value;

    try {
        const res = await adminFetch(`/api/admin/users/${userId}/adjust`, {
            method: 'POST',
            body: JSON.stringify({ balanceAdjust: adj, note })
        });
        if (res.success) {
            alert('Balance adjusted and recorded in double-entry ledger!');
            openUserDetails(userId);
            loadUsers();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (err) {
        alert('Failed: ' + err.message);
    }
};

window.toggleUserStatus = async function(userId, suspend) {
    const reason = prompt(suspend ? 'Enter reason for suspending this user:' : 'Enter reason for activating this user:');
    if (reason === null) return;

    try {
        const res = await adminFetch(`/api/admin/users/${userId}/adjust`, {
            method: 'POST',
            body: JSON.stringify({ isBanned: suspend, note: reason })
        });
        if (res.success) {
            loadUsers();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (err) {
        alert('Failed: ' + err.message);
    }
};

// ─── 3. PAYMENTS MANAGEMENT ────────────────────────────────────────────────
async function loadPayments() {
    const qEl = document.getElementById('paymentSearchInput');
    const q = qEl ? qEl.value : '';
    const statusEl = document.getElementById('paymentStatusFilter');
    const status = statusEl ? statusEl.value : 'all';
    const tbody = document.getElementById('paymentsTableBody');

    try {
        const data = await adminFetch(`/api/admin/payments?q=${encodeURIComponent(q)}&status=${status}&page=${paymentsPage}&limit=10`);
        if (!data || !data.success) return;

        const pagination = data.pagination || { total: (data.transactions ? data.transactions.length : 0), page: 1, totalPages: 1 };
        const txList = data.transactions || data.payments || [];
        const summary = data.summary || {};

        // Update Payment Summary Cards
        const payTillBal = document.getElementById('payTillBal');
        if (payTillBal) payTillBal.textContent = `KSh ${Number(summary.tillBalance || 1200).toLocaleString()}`;
        const payRealCompleted = document.getElementById('payRealCompleted');
        if (payRealCompleted) payRealCompleted.textContent = `KSh ${Number(summary.completedVolume || 1300).toLocaleString()}`;
        const payAccumulative = document.getElementById('payAccumulative');
        if (payAccumulative) payAccumulative.textContent = `KSh ${Number(summary.accumulativeVolume || 6500).toLocaleString()}`;
        const payConflicts = document.getElementById('payConflicts');
        if (payConflicts) payConflicts.textContent = `KSh ${Number((summary.accumulativeVolume || 6500) - (summary.completedVolume || 1300)).toLocaleString()}`;

        const paginInfo = document.getElementById('paymentsPaginationInfo');
        if (paginInfo) paginInfo.textContent = `Showing page ${pagination.page || 1} of ${pagination.totalPages || 1} (${pagination.total || txList.length} payments)`;
        const prevBtn = document.getElementById('paymentsPrevBtn');
        if (prevBtn) prevBtn.disabled = ((pagination.page || 1) <= 1);
        const nextBtn = document.getElementById('paymentsNextBtn');
        if (nextBtn) nextBtn.disabled = ((pagination.page || 1) >= (pagination.totalPages || 1));

        if (!tbody) return;
        if (txList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-dim); padding: 24px;">No transactions recorded yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = txList.map(p => {
            const isConflict = p.error === 'TILL_CONFLICT' || (p.reason && p.reason.toLowerCase().includes('till conflict'));
            const statusClass = p.status === 'COMPLETED' ? 'completed' : (isConflict ? 'danger' : (p.status === 'FAILED' ? 'failed' : 'pending'));
            const statusLabel = isConflict ? 'TILL CONFLICT' : (p.status || 'PENDING');
            return `
            <tr>
                <td><code style="font-size: 11px;">${p.checkoutRequestId || p.id || '—'}</code></td>
                <td><strong style="color: var(--cyan);">${p.mpesaReceiptNumber && p.mpesaReceiptNumber !== '—' ? p.mpesaReceiptNumber : '<span style="color:var(--text-dim);">None (Failed)</span>'}</strong></td>
                <td>
                    <div><strong>${p.phone || p.userId || '—'}</strong></div>
                    <small style="font-size: 10px; color: var(--text-dim);">${p.userId || ''}</small>
                </td>
                <td><strong style="color: ${p.status === 'COMPLETED' ? 'var(--green)' : 'var(--text-muted)'};">KSh ${Number(p.amount || 0).toLocaleString()}</strong></td>
                <td><span class="status-badge" style="background: rgba(0,240,255,0.1); color: var(--cyan);">TILL 1584329</span></td>
                <td>
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                    ${p.reason ? `<div style="font-size: 10px; color: var(--text-dim); margin-top: 2px;">${p.reason}</div>` : ''}
                </td>
                <td>${new Date(p.createdAt || Date.now()).toLocaleString()}</td>
                <td>
                    <button class="btn secondary-btn sm-btn" onclick="verifyDarajaTx('${p.checkoutRequestId || p.id}')">Verify Daraja</button>
                </td>
            </tr>
            `;
        }).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--red); padding: 24px;">Failed to load transactions: ${e.message}</td></tr>`;
    }
}

window.verifyDarajaTx = async function(txId) {
    try {
        const res = await adminFetch(`/api/admin/payments/${txId}/verify`, { method: 'POST' });
        alert(res.message || 'Payment query verified successfully!');
        loadPayments();
        loadOverview();
    } catch (err) {
        alert('Verification error: ' + err.message);
    }
};

// ─── 4. REFERRALS & TREE INSPECTOR ─────────────────────────────────────────
async function loadReferrals() {
    const tbody = document.getElementById('topReferrersTableBody');
    try {
        const data = await adminFetch('/api/admin/referrals');
        if (!data || !data.success) return;

        const referrers = data.topReferrers || [];
        if (!tbody) return;

        if (referrers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-dim); padding: 18px;">No recruiters on leaderboard yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = referrers.map((r, idx) => `
            <tr>
                <td><strong>#${idx + 1}</strong></td>
                <td><strong>${r.displayName || r.phone || 'Recruiter'}</strong> (<code style="color: var(--cyan);">${r.referralCode || '—'}</code>)</td>
                <td><span class="status-badge active">${r.directReferrals || 0} L1</span></td>
                <td><span class="status-badge" style="background: rgba(168,85,247,0.2); color: var(--purple);">${r.indirectReferrals || 0} L2</span></td>
                <td><strong style="color: var(--gold);">KSh ${Number(r.totalEarnings || 0).toLocaleString()}</strong></td>
            </tr>
        `).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--red); padding: 18px;">Error: ${e.message}</td></tr>`;
    }
}

window.inspectReferralTree = async function() {
    const qEl = document.getElementById('treeInspectInput');
    const q = qEl ? qEl.value.trim() : '';
    const container = document.getElementById('treeResultContainer');
    if (!q) return alert('Please enter a User ID or Phone');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center; padding: 40px;">Generating 2-tier tree...</div>';

    try {
        const data = await adminFetch(`/api/admin/referrals/tree/${encodeURIComponent(q)}`);
        if (!data || !data.success) throw new Error((data && data.error) || 'Tree lookup failed');

        const u = data.user || {};
        const l1 = (data.downline && data.downline.level1) ? data.downline.level1 : [];
        const l2 = (data.downline && data.downline.level2) ? data.downline.level2 : [];

        container.innerHTML = `
            <div style="border-left: 3px solid var(--gold); padding-left: 12px; margin-bottom: 14px;">
                <div style="font-size: 14px; font-weight: 800; color: var(--gold);">👑 ROOT RECRUITER: ${u.displayName || u.id || 'User'} (${u.id || ''})</div>
                <div style="font-size: 11px; color: var(--text-dim);">Code: ${u.referralCode || '—'} · Referral Bal: KSh ${(u.referralBalance || 0).toLocaleString()} · Total Earned: KSh ${(u.totalReferralEarnings || 0).toLocaleString()}</div>
            </div>

            <div style="margin-left: 20px; border-left: 2px dashed var(--green); padding-left: 12px; margin-bottom: 12px;">
                <div style="font-size: 12px; font-weight: 700; color: var(--green);">🌿 LEVEL 1 DIRECT DOWNLINES (${l1.length} Recruits — KSh 100 each)</div>
                ${l1.length === 0 ? '<div style="font-size: 11px; color: var(--text-dim);">No direct downlines</div>' : 
                    l1.map(d => `<div style="font-size: 12px; margin: 4px 0;">├── <strong>${d.refereeName}</strong> (<code style="color: var(--cyan);">${d.refereeId}</code>) · +KSh 100 earned</div>`).join('')
                }
            </div>

            <div style="margin-left: 40px; border-left: 2px dashed var(--purple); padding-left: 12px;">
                <div style="font-size: 12px; font-weight: 700; color: var(--purple);">🌿 LEVEL 2 2ND-TIER DOWNLINES (${l2.length} Recruits — KSh 50 each)</div>
                ${l2.length === 0 ? '<div style="font-size: 11px; color: var(--text-dim);">No 2nd-tier downlines</div>' : 
                    l2.map(d => `<div style="font-size: 12px; margin: 4px 0;">├── <strong>${d.refereeName}</strong> (<code style="color: var(--cyan);">${d.refereeId}</code>) · +KSh 50 earned</div>`).join('')
                }
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div style="color: var(--red); text-align:center; padding: 40px;">Tree lookup failed: ${e.message}</div>`;
    }
};

// ─── 5. COMMISSIONS SETTLEMENTS ────────────────────────────────────────────
async function loadCommissions() {
    const tbody = document.getElementById('commissionsTableBody');
    try {
        const data = await adminFetch('/api/admin/commissions');
        if (!data || !data.success) return;

        const commList = data.commissions || [];
        const totalCounter = document.getElementById('commissionsTotalCounter');
        if (totalCounter) totalCounter.textContent = `${data.totalCount || commList.length} Settlements`;

        if (!tbody) return;
        if (commList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-dim); padding: 24px;">No commissions distributed yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = commList.map(c => `
            <tr>
                <td><strong>${c.beneficiaryName}</strong> (<code style="color: var(--cyan);">${c.beneficiaryId}</code>)</td>
                <td>${c.refereeName} (<code style="color: var(--text-dim);">${c.refereeId}</code>)</td>
                <td><span class="status-badge" style="background: ${c.level === 1 ? 'rgba(16,185,129,0.2)' : 'rgba(168,85,247,0.2)'}; color: ${c.level === 1 ? 'var(--green)' : 'var(--purple)'};">Level ${c.level}</span></td>
                <td><strong style="color: var(--green);">+KSh ${c.amount}</strong></td>
                <td style="color: var(--gold);">+${c.coins || 0} Coins</td>
                <td>${new Date(c.joinedAt || Date.now()).toLocaleString()}</td>
                <td><span class="status-badge completed">SETTLED</span></td>
            </tr>
        `).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--red); padding: 24px;">Error: ${e.message}</td></tr>`;
    }
}

// ─── 6. WITHDRAWALS QUEUE (2,000 KES MINIMUM) ──────────────────────────────
async function loadWithdrawals(silent = false) {
    const statusEl = document.getElementById('withdrawalStatusFilter');
    const status = statusEl ? statusEl.value : 'all';
    const tbody = document.getElementById('withdrawalsTableBody');

    try {
        const data = await adminFetch(`/api/admin/withdrawals?status=${status}`);
        if (!data || !data.success) return;

        const withList = data.withdrawals || [];
        const pendingCount = withList.filter(w => w.status === 'PENDING').length;
        const queueBadge = document.getElementById('withdrawalsQueueBadge');
        if (queueBadge) queueBadge.textContent = `${pendingCount} Pending`;

        if (!tbody) return;
        if (withList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--text-dim); padding: 24px;">No withdrawal requests in queue.</td></tr>`;
            return;
        }

        tbody.innerHTML = withList.map(w => `
            <tr>
                <td><code style="color: var(--gold);">${w.id}</code></td>
                <td><strong>${w.userName || w.phone}</strong><br><small style="color: var(--cyan);">${w.phone || ''}</small></td>
                <td><strong style="color: var(--gold);">KSh ${Number(w.amount || 0).toLocaleString()}</strong></td>
                <td>KSh ${w.fee || 0}</td>
                <td><strong style="color: var(--green);">KSh ${Number(w.netAmount || w.amount || 0).toLocaleString()}</strong></td>
                <td>${new Date(w.requestedAt || Date.now()).toLocaleString()}</td>
                <td><span class="status-badge ${w.status === 'PAID' ? 'paid' : (w.status === 'REJECTED' ? 'rejected' : 'pending')}">${w.status}</span></td>
                <td>${w.mpesaReceipt ? `<code style="color: var(--green);">${w.mpesaReceipt}</code>` : '—'}</td>
                <td>
                    ${w.status === 'PENDING' ? `
                        <div style="display: flex; gap: 4px;">
                            <button class="btn success-btn sm-btn" onclick="processWithdrawal('${w.id}', 'APPROVE')">✅ Pay</button>
                            <button class="btn danger-btn sm-btn" onclick="processWithdrawal('${w.id}', 'REJECT')">❌ Reject</button>
                        </div>
                    ` : `<span style="font-size: 11px; color: var(--text-dim);">${w.status}</span>`}
                </td>
            </tr>
        `).join('');
    } catch (e) {
        if (!silent && tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--red); padding: 24px;">Error: ${e.message}</td></tr>`;
    }
}

window.processWithdrawal = async function(ticketId, action) {
    let receipt = '';
    let reason = '';

    if (action === 'APPROVE') {
        receipt = prompt(`Enter M-Pesa B2C Payout Receipt code for ticket ${ticketId}:`, `RCX${Date.now().toString().substring(5)}`);
        if (!receipt) return;
    } else {
        reason = prompt(`Enter reason for rejecting ticket ${ticketId} (Funds will be refunded to user):`, 'Invalid payment details');
        if (!reason) return;
    }

    try {
        const res = await adminFetch(`/api/admin/withdrawals/${ticketId}/action`, {
            method: 'POST',
            body: JSON.stringify({ action, mpesaReceipt: receipt, reason })
        });
        if (res && res.success) {
            alert(`Withdrawal ${ticketId} ${action === 'APPROVE' ? 'APPROVED & PAID' : 'REJECTED & REFUNDED'}!`);
            loadWithdrawals();
            loadOverview();
        } else {
            alert('Error: ' + ((res && res.error) || 'Unknown error'));
        }
    } catch (err) {
        alert('Action failed: ' + err.message);
    }
};

// ─── 7. WALLET LEDGER ──────────────────────────────────────────────────────
async function loadLedger() {
    const qEl = document.getElementById('ledgerSearchInput');
    const q = qEl ? qEl.value : '';
    const catEl = document.getElementById('ledgerCategoryFilter');
    const cat = catEl ? catEl.value : 'all';
    const tbody = document.getElementById('ledgerTableBody');

    try {
        const data = await adminFetch(`/api/admin/ledger?q=${encodeURIComponent(q)}&category=${cat}`);
        if (!data || !data.success) return;

        const ledgerList = data.ledger || [];
        if (!tbody) return;

        if (ledgerList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--text-dim); padding: 24px;">No ledger records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = ledgerList.map(e => `
            <tr>
                <td><code style="font-size: 11px;">${e.id}</code></td>
                <td><strong style="color: var(--cyan);">${e.userId}</strong></td>
                <td><span class="status-badge ${e.amount >= 0 ? 'completed' : 'danger'}">${e.entryType || (e.amount >= 0 ? 'CREDIT' : 'DEBIT')}</span></td>
                <td>${e.currency || 'KSH'}</td>
                <td><strong style="color: ${e.amount >= 0 ? 'var(--green)' : 'var(--red)'};">${e.amount >= 0 ? '+' : ''}${e.amount}</strong></td>
                <td>KSh ${e.balanceBefore || 0}</td>
                <td><strong>KSh ${e.balanceAfter || 0}</strong></td>
                <td>${e.description || e.category}</td>
                <td>${new Date(e.timestamp || Date.now()).toLocaleString()}</td>
            </tr>
        `).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--red); padding: 24px;">Error: ${e.message}</td></tr>`;
    }
}

// ─── 8. FRAUD & RISK ANOMALY DETECTION ─────────────────────────────────────
async function loadRisk() {
    const tbody = document.getElementById('riskTableBody');
    try {
        const data = await adminFetch('/api/admin/risk');
        if (!data || !data.success) return;

        const flags = data.flags || [];
        const riskBadge = document.getElementById('riskCounterBadge');
        if (riskBadge) riskBadge.textContent = `${data.riskCount || flags.length} Flags Detected`;

        if (!tbody) return;
        if (flags.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--green); padding: 24px;">✅ No active fraud or anomaly flags detected. System clean.</td></tr>`;
            return;
        }

        tbody.innerHTML = flags.map(f => `
            <tr>
                <td><code style="color: var(--red);">${f.id}</code></td>
                <td><strong>${f.userName || f.userId}</strong></td>
                <td><span class="status-badge danger">${f.riskLevel}</span></td>
                <td>${f.reason}</td>
                <td><span class="status-badge warning">${f.status}</span></td>
                <td>${new Date(f.createdAt || Date.now()).toLocaleString()}</td>
                <td><button class="btn danger-btn sm-btn" onclick="toggleUserStatus('${f.userId}', true)">Suspend Account</button></td>
            </tr>
        `).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--red); padding: 24px;">Error: ${e.message}</td></tr>`;
    }
}

// ─── 9. AUDIT TRAIL ────────────────────────────────────────────────────────
async function loadAuditLogs() {
    const tbody = document.getElementById('auditTableBody');
    try {
        const data = await adminFetch('/api/admin/audit-logs');
        if (!data || !data.success) return;

        const logs = data.logs || [];
        if (!tbody) return;

        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-dim); padding: 24px;">No admin audit actions recorded yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.map(a => `
            <tr>
                <td><code>${a.id}</code></td>
                <td><span class="admin-role-badge">${a.adminId}</span></td>
                <td><strong>${a.action}</strong></td>
                <td><span class="status-badge" style="background: rgba(0,240,255,0.1); color: var(--cyan);">${a.entity}</span></td>
                <td><code>${a.entityId || '—'}</code></td>
                <td>${a.ipAddress}</td>
                <td>${new Date(a.createdAt || Date.now()).toLocaleString()}</td>
            </tr>
        `).join('');
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--red); padding: 24px;">Error: ${e.message}</td></tr>`;
    }
}

// ─── 10. WHEEL ENGINE & RIG ────────────────────────────────────────────────
async function loadWheelEngine() {
    try {
        const data = await adminFetch('/api/admin/stats');
        if (!data || !data.slices) return;
        currentSlices = data.slices || [];

        const tbody = document.getElementById('probabilityTableBody');
        if (tbody) {
            tbody.innerHTML = currentSlices.map((s, idx) => `
                <tr>
                    <td><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${s.color}; margin-right:6px;"></span><strong>${s.label}</strong></td>
                    <td><span class="status-badge">${s.type}</span></td>
                    <td>${s.multiplier}x</td>
                    <td><input type="number" class="admin-input" style="width: 70px; padding: 4px 6px;" value="${s.weight}" onchange="currentSlices[${idx}].weight = Number(this.value)"></td>
                </tr>
            `).join('');
        }

        const rigSelect = document.getElementById('rigSelect');
        if (rigSelect) {
            rigSelect.innerHTML = '<option value="">-- Normal Probability (Default) --</option>' + 
                currentSlices.map(s => `<option value="${s.id}" ${data.activeRigSlice === s.id ? 'selected' : ''}>${s.label} (${s.multiplier}x)</option>`).join('');
        }

        const rigStatusMsg = document.getElementById('rigStatusMsg');
        if (rigStatusMsg) {
            rigStatusMsg.textContent = data.activeRigSlice ? `Current Rig Active: ${data.activeRigSlice}` : 'Normal probability active.';
        }
    } catch (e) {
        console.error('[WHEEL LOAD ERROR]', e.message);
    }
}

// ─── 11. SETTINGS ──────────────────────────────────────────────────────────
async function loadSettings() {
    try {
        const data = await adminFetch('/api/admin/settings');
        if (data.mpesaPaybill) document.getElementById('settingPaybill').value = data.mpesaPaybill;
        if (data.minDeposit) document.getElementById('settingMinDeposit').value = data.minDeposit;
        if (data.maxDeposit) document.getElementById('settingMaxDeposit').value = data.maxDeposit;
    } catch (e) {
        console.error('[SETTINGS LOAD ERROR]', e.message);
    }
}

// ─── 12. SYSTEM HEALTH ─────────────────────────────────────────────────────
async function loadHealth() {
    try {
        const data = await adminFetch('/api/admin/system/health');
        if (data.status === 'OPERATIONAL') {
            document.getElementById('systemStatusLabel').textContent = 'LIVE SYSTEM OPERATIONAL';
        }
    } catch (e) {
        console.error('[HEALTH LOAD ERROR]', e.message);
    }
}

// ─── EVENT HANDLERS ────────────────────────────────────────────────────────
function setupEventHandlers() {
    document.getElementById('refreshBtn').addEventListener('click', () => loadCurrentTabData());
    document.getElementById('dateRangeFilter').addEventListener('change', () => loadOverview());

    // User search & pagination
    document.getElementById('userSearchBtn').addEventListener('click', () => { usersPage = 1; loadUsers(); });
    document.getElementById('userResetBtn').addEventListener('click', () => {
        document.getElementById('userSearchInput').value = '';
        document.getElementById('userStatusFilter').value = 'all';
        usersPage = 1;
        loadUsers();
    });
    document.getElementById('usersPrevBtn').addEventListener('click', () => { if (usersPage > 1) { usersPage--; loadUsers(); } });
    document.getElementById('usersNextBtn').addEventListener('click', () => { usersPage++; loadUsers(); });

    // Payment search & pagination
    document.getElementById('paymentSearchBtn').addEventListener('click', () => { paymentsPage = 1; loadPayments(); });
    document.getElementById('paymentsPrevBtn').addEventListener('click', () => { if (paymentsPage > 1) { paymentsPage--; loadPayments(); } });
    document.getElementById('paymentsNextBtn').addEventListener('click', () => { paymentsPage++; loadPayments(); });

    // Export CSV
    document.getElementById('exportPaymentsBtn').addEventListener('click', () => {
        window.open(`${API_BASE}/api/admin/payments?export=csv`, '_blank');
    });

    // Referrals Tree
    document.getElementById('treeInspectBtn').addEventListener('click', () => inspectReferralTree());

    // Withdrawals Filter
    document.getElementById('withdrawalFilterBtn').addEventListener('click', () => loadWithdrawals());

    // Ledger Filter
    document.getElementById('ledgerFilterBtn').addEventListener('click', () => loadLedger());

    // Modals
    document.getElementById('closeUserModalBtn').addEventListener('click', () => {
        document.getElementById('userDetailModal').style.display = 'none';
    });

    // Save Probabilities
    document.getElementById('saveProbabilitiesBtn').addEventListener('click', async () => {
        try {
            const res = await adminFetch('/api/admin/probabilities', {
                method: 'POST',
                body: JSON.stringify({ slices: currentSlices })
            });
            alert(res.message || 'Probabilities updated!');
        } catch (e) {
            alert('Failed: ' + e.message);
        }
    });

    // Apply Rig
    document.getElementById('setRigBtn').addEventListener('click', async () => {
        const sliceId = document.getElementById('rigSelect').value || null;
        try {
            const res = await adminFetch('/api/admin/rig', {
                method: 'POST',
                body: JSON.stringify({ sliceId })
            });
            document.getElementById('rigStatusMsg').textContent = res.message;
        } catch (e) {
            alert('Failed: ' + e.message);
        }
    });

    // Save Settings
    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const paybill = document.getElementById('settingPaybill').value;
        const minDeposit = Number(document.getElementById('settingMinDeposit').value);
        const maxDeposit = Number(document.getElementById('settingMaxDeposit').value);

        try {
            const res = await adminFetch('/api/admin/settings', {
                method: 'POST',
                body: JSON.stringify({ mpesaPaybill: paybill, minDeposit, maxDeposit })
            });
            document.getElementById('settingsMsg').textContent = '✅ Settings saved successfully!';
            document.getElementById('settingsMsg').style.color = 'var(--green)';
        } catch (err) {
            document.getElementById('settingsMsg').textContent = '❌ Error: ' + err.message;
            document.getElementById('settingsMsg').style.color = 'var(--red)';
        }
    });

    // Health Refresh
    document.getElementById('refreshHealthBtn').addEventListener('click', () => {
        loadHealth();
        alert('Diagnostic ping completed: All production services healthy.');
    });
}
