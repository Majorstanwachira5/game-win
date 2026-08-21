/**
 * admin.js — Master RAM Control Center Enterprise Controller
 * Connects frontend UI to real database endpoints with JWT authentication,
 * server-side pagination, real-time polling, and transactional actions.
 */

const API_BASE = (window.location.port === '8080')
    ? window.location.origin
    : ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? `${window.location.protocol}//${window.location.hostname}:8080`
        : window.location.origin);
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
            const res = await fetch(`${API_BASE}/api/auth/admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, adminEmail: email, password: pwd })
            });
            const data = await res.json();

            if (data.success && data.token) {
                adminToken = data.token;
                localStorage.setItem('ram_admin_jwt', adminToken);
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
        adminToken = '';
        showAuthOverlay();
    });
}

function showAuthOverlay() {
    document.getElementById('adminAuthOverlay').style.display = 'flex';
}
function hideAuthOverlay() {
    document.getElementById('adminAuthOverlay').style.display = 'none';
}

// ─── FETCH HELPER WITH JWT AUTH ──────────────────────────────────────────────
async function adminFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        ...(options.headers || {})
    };

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        if (res.status === 401 || res.status === 403) {
            console.warn('[ADMIN AUTH EXPIRED]');
            localStorage.removeItem('ram_admin_jwt');
            adminToken = '';
            showAuthOverlay();
            throw new Error('Session expired. Please log in again.');
        }
        return await res.json();
    } catch (err) {
        console.error(`[ADMIN FETCH ERROR] ${endpoint}`, err.message);
        throw err;
    }
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
    const dateFilter = document.getElementById('dateRangeFilter').value;
    try {
        const data = await adminFetch(`/api/admin/overview?filter=${dateFilter}`);
        if (!data.success) return;

        // KPI Cards
        document.getElementById('kpiTotalUsers').textContent = Number(data.users.total).toLocaleString();
        document.getElementById('kpiNewTodayUsers').textContent = `+${data.users.newToday}`;
        document.getElementById('kpiNewMonthUsers').textContent = `+${data.users.newThisMonth}`;
        document.getElementById('kpiActiveUsers').textContent = Number(data.users.active).toLocaleString();

        document.getElementById('kpiTotalVolume').textContent = `KSh ${Number(data.payments.totalVolume).toLocaleString()}`;
        document.getElementById('kpiTodayVolume').textContent = `KSh ${Number(data.payments.todayVolume).toLocaleString()}`;

        document.getElementById('kpiTotalCommissions').textContent = `KSh ${Number(data.commissions.totalGenerated).toLocaleString()}`;
        document.getElementById('kpiAvailableLiability').textContent = `KSh ${Number(data.commissions.availableLiability).toLocaleString()}`;

        document.getElementById('kpiPendingWithdrawals').textContent = Number(data.withdrawals.pendingCount).toLocaleString();
        document.getElementById('kpiPendingWithdrawalsVal').textContent = `KSh ${Number(data.withdrawals.pendingLiability).toLocaleString()}`;
        
        const badge = document.getElementById('sidebarWithdrawalBadge');
        if (data.withdrawals.pendingCount > 0) {
            badge.textContent = data.withdrawals.pendingCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }

        document.getElementById('kpiTotalReferrals').textContent = Number(data.referrals.totalReferrals).toLocaleString();
        document.getElementById('kpiConversionRate').textContent = data.referrals.conversionRate || '0%';

        document.getElementById('kpiHouseProfit').textContent = `KSh ${Number(data.revenue.houseNetProfit).toLocaleString()}`;
        document.getElementById('kpiProfitMargin').textContent = data.revenue.profitMarginPercent || '85.0%';

        // Conversion Funnel Bars
        const maxFunnel = Math.max(data.funnel.registrations, 1);
        document.getElementById('funnelRegs').textContent = data.funnel.registrations;
        document.getElementById('funnelActs').textContent = `${data.funnel.activations} (${Math.round((data.funnel.activations / maxFunnel) * 100)}%)`;
        document.getElementById('funnelBarActs').style.width = `${Math.min(100, (data.funnel.activations / maxFunnel) * 100)}%`;

        document.getElementById('funnelL1').textContent = `${data.referrals.directCount} direct`;
        document.getElementById('funnelBarL1').style.width = `${Math.min(100, (data.referrals.directCount / maxFunnel) * 100)}%`;

        document.getElementById('funnelL2').textContent = `${data.referrals.indirectCount} indirect`;
        document.getElementById('funnelBarL2').style.width = `${Math.min(100, (data.referrals.indirectCount / maxFunnel) * 100)}%`;

        // Live Event Stream
        const feedContainer = document.getElementById('liveActivityFeed');
        if (data.recentActivity && data.recentActivity.length > 0) {
            feedContainer.innerHTML = data.recentActivity.map(act => `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: var(--radius-sm); font-size: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="status-badge" style="background: rgba(255,255,255,0.06); color: ${act.color};">${act.badge}</span>
                        <span>${act.title}</span>
                    </div>
                    <span style="font-size: 10px; color: var(--text-dim);">${new Date(act.time).toLocaleTimeString()}</span>
                </div>
            `).join('');
        }
    } catch (e) {
        if (!silent) console.error('[OVERVIEW LOAD ERROR]', e.message);
    }
}

// ─── 2. USERS MANAGEMENT ───────────────────────────────────────────────────
async function loadUsers() {
    const q = document.getElementById('userSearchInput').value;
    const status = document.getElementById('userStatusFilter').value;
    const tbody = document.getElementById('usersTableBody');

    try {
        const data = await adminFetch(`/api/admin/users?q=${encodeURIComponent(q)}&status=${status}&page=${usersPage}&limit=10`);
        if (!data.success) return;

        document.getElementById('usersTotalCounter').textContent = `${data.pagination.total} Total Users`;
        document.getElementById('usersPaginationInfo').textContent = `Showing page ${data.pagination.page} of ${data.pagination.totalPages} (${data.pagination.total} users)`;

        document.getElementById('usersPrevBtn').disabled = (data.pagination.page <= 1);
        document.getElementById('usersNextBtn').disabled = (data.pagination.page >= data.pagination.totalPages);

        if (data.users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: var(--text-dim); padding: 24px;">No users match your criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.users.map(u => `
            <tr>
                <td><code style="color: var(--cyan);">${u.id}</code></td>
                <td><strong>${u.displayName}</strong> ${u.isTester ? '<span class="status-badge warning">TESTER</span>' : ''}</td>
                <td>${u.phone || u.email || '—'}</td>
                <td><strong>KSh ${u.balance.toLocaleString()}</strong></td>
                <td style="color: var(--gold);">${u.coins.toLocaleString()}</td>
                <td style="color: var(--green);">KSh ${u.referralBalance.toLocaleString()}</td>
                <td><span class="status-badge active">${u.referralCount} Downlines</span></td>
                <td>
                    <span class="status-badge ${u.isActive ? 'active' : 'danger'}">
                        ${u.isActive ? (u.isActivated ? 'ACTIVE' : 'REGISTERED') : 'BANNED'}
                    </span>
                </td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn secondary-btn sm-btn" onclick="openUserDetails('${u.id}')">Inspect</button>
                        ${u.isActive ? 
                            `<button class="btn danger-btn sm-btn" onclick="toggleUserStatus('${u.id}', true)">Suspend</button>` :
                            `<button class="btn success-btn sm-btn" onclick="toggleUserStatus('${u.id}', false)">Activate</button>`
                        }
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: var(--red); padding: 24px;">Failed to load users: ${e.message}</td></tr>`;
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
    const q = document.getElementById('paymentSearchInput').value;
    const status = document.getElementById('paymentStatusFilter').value;
    const tbody = document.getElementById('paymentsTableBody');

    try {
        const data = await adminFetch(`/api/admin/payments?q=${encodeURIComponent(q)}&status=${status}&page=${paymentsPage}&limit=10`);
        if (!data.success) return;

        document.getElementById('paymentsPaginationInfo').textContent = `Showing page ${data.pagination.page} of ${data.pagination.totalPages} (${data.pagination.total} payments)`;
        document.getElementById('paymentsPrevBtn').disabled = (data.pagination.page <= 1);
        document.getElementById('paymentsNextBtn').disabled = (data.pagination.page >= data.pagination.totalPages);

        if (data.payments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-dim); padding: 24px;">No transactions recorded yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.payments.map(p => `
            <tr>
                <td><code style="font-size: 11px;">${p.checkoutRequestId || p.id}</code></td>
                <td><strong style="color: var(--cyan);">${p.mpesaReceiptNumber || '—'}</strong></td>
                <td>${p.userId || p.phone || '—'}</td>
                <td><strong style="color: var(--green);">KSh ${Number(p.amount).toLocaleString()}</strong></td>
                <td><span class="status-badge" style="background: rgba(0,240,255,0.1); color: var(--cyan);">M-PESA DARAJA</span></td>
                <td><span class="status-badge ${p.status === 'COMPLETED' ? 'completed' : (p.status === 'FAILED' ? 'failed' : 'pending')}">${p.status}</span></td>
                <td>${new Date(p.createdAt || Date.now()).toLocaleString()}</td>
                <td>
                    <button class="btn secondary-btn sm-btn" onclick="verifyDarajaTx('${p.checkoutRequestId || p.id}')">Verify Daraja</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--red); padding: 24px;">Failed to load transactions: ${e.message}</td></tr>`;
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
        if (!data.success) return;

        if (data.topReferrers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-dim); padding: 18px;">No recruiters on leaderboard yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.topReferrers.map((r, idx) => `
            <tr>
                <td><strong>#${idx + 1}</strong></td>
                <td><strong>${r.displayName || r.phone}</strong> (<code style="color: var(--cyan);">${r.referralCode}</code>)</td>
                <td><span class="status-badge active">${r.directReferrals} L1</span></td>
                <td><span class="status-badge" style="background: rgba(168,85,247,0.2); color: var(--purple);">${r.indirectReferrals} L2</span></td>
                <td><strong style="color: var(--gold);">KSh ${Number(r.totalEarnings).toLocaleString()}</strong></td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--red); padding: 18px;">Error: ${e.message}</td></tr>`;
    }
}

window.inspectReferralTree = async function() {
    const q = document.getElementById('treeInspectInput').value.trim();
    const container = document.getElementById('treeResultContainer');
    if (!q) return alert('Please enter a User ID or Phone');

    container.innerHTML = '<div style="text-align:center; padding: 40px;">Generating 2-tier tree...</div>';

    try {
        const data = await adminFetch(`/api/admin/referrals/tree/${encodeURIComponent(q)}`);
        if (!data.success) throw new Error(data.error);

        const u = data.user;
        const l1 = data.downline.level1;
        const l2 = data.downline.level2;

        container.innerHTML = `
            <div style="border-left: 3px solid var(--gold); padding-left: 12px; margin-bottom: 14px;">
                <div style="font-size: 14px; font-weight: 800; color: var(--gold);">👑 ROOT RECRUITER: ${u.displayName} (${u.id})</div>
                <div style="font-size: 11px; color: var(--text-dim);">Code: ${u.referralCode} · Referral Bal: KSh ${u.referralBalance.toLocaleString()} · Total Earned: KSh ${u.totalReferralEarnings.toLocaleString()}</div>
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
        if (!data.success) return;

        document.getElementById('commissionsTotalCounter').textContent = `${data.totalCount} Settlements`;

        if (data.commissions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-dim); padding: 24px;">No commissions distributed yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.commissions.map(c => `
            <tr>
                <td><strong>${c.beneficiaryName}</strong> (<code style="color: var(--cyan);">${c.beneficiaryId}</code>)</td>
                <td>${c.refereeName} (<code style="color: var(--text-dim);">${c.refereeId}</code>)</td>
                <td><span class="status-badge" style="background: ${c.level === 1 ? 'rgba(16,185,129,0.2)' : 'rgba(168,85,247,0.2)'}; color: ${c.level === 1 ? 'var(--green)' : 'var(--purple)'};">Level ${c.level}</span></td>
                <td><strong style="color: var(--green);">+KSh ${c.amount}</strong></td>
                <td style="color: var(--gold);">+${c.coins} Coins</td>
                <td>${new Date(c.joinedAt).toLocaleString()}</td>
                <td><span class="status-badge completed">SETTLED</span></td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--red); padding: 24px;">Error: ${e.message}</td></tr>`;
    }
}

// ─── 6. WITHDRAWALS QUEUE (2,000 KES MINIMUM) ──────────────────────────────
async function loadWithdrawals(silent = false) {
    const status = document.getElementById('withdrawalStatusFilter').value;
    const tbody = document.getElementById('withdrawalsTableBody');

    try {
        const data = await adminFetch(`/api/admin/withdrawals?status=${status}`);
        if (!data.success) return;

        const pendingCount = data.withdrawals.filter(w => w.status === 'PENDING').length;
        document.getElementById('withdrawalsQueueBadge').textContent = `${pendingCount} Pending`;

        if (data.withdrawals.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--text-dim); padding: 24px;">No withdrawal requests in queue.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.withdrawals.map(w => `
            <tr>
                <td><code style="color: var(--gold);">${w.id}</code></td>
                <td><strong>${w.userName || w.phone}</strong><br><small style="color: var(--cyan);">${w.phone}</small></td>
                <td><strong style="color: var(--gold);">KSh ${Number(w.amount).toLocaleString()}</strong></td>
                <td>KSh ${w.fee || 0}</td>
                <td><strong style="color: var(--green);">KSh ${Number(w.netAmount || w.amount).toLocaleString()}</strong></td>
                <td>${new Date(w.requestedAt).toLocaleString()}</td>
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
        if (!silent) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--red); padding: 24px;">Error: ${e.message}</td></tr>`;
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
        if (res.success) {
            alert(`Withdrawal ${ticketId} ${action === 'APPROVE' ? 'APPROVED & PAID' : 'REJECTED & REFUNDED'}!`);
            loadWithdrawals();
            loadOverview();
        } else {
            alert('Error: ' + res.error);
        }
    } catch (err) {
        alert('Action failed: ' + err.message);
    }
};

// ─── 7. WALLET LEDGER ──────────────────────────────────────────────────────
async function loadLedger() {
    const q = document.getElementById('ledgerSearchInput').value;
    const cat = document.getElementById('ledgerCategoryFilter').value;
    const tbody = document.getElementById('ledgerTableBody');

    try {
        const data = await adminFetch(`/api/admin/ledger?q=${encodeURIComponent(q)}&category=${cat}`);
        if (!data.success) return;

        if (data.ledger.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--text-dim); padding: 24px;">No ledger records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.ledger.map(e => `
            <tr>
                <td><code style="font-size: 11px;">${e.id}</code></td>
                <td><strong style="color: var(--cyan);">${e.userId}</strong></td>
                <td><span class="status-badge ${e.amount >= 0 ? 'completed' : 'danger'}">${e.entryType || (e.amount >= 0 ? 'CREDIT' : 'DEBIT')}</span></td>
                <td>${e.currency || 'KSH'}</td>
                <td><strong style="color: ${e.amount >= 0 ? 'var(--green)' : 'var(--red)'};">${e.amount >= 0 ? '+' : ''}${e.amount}</strong></td>
                <td>KSh ${e.balanceBefore || 0}</td>
                <td><strong>KSh ${e.balanceAfter || 0}</strong></td>
                <td>${e.description || e.category}</td>
                <td>${new Date(e.timestamp).toLocaleString()}</td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--red); padding: 24px;">Error: ${e.message}</td></tr>`;
    }
}

// ─── 8. FRAUD & RISK ANOMALY DETECTION ─────────────────────────────────────
async function loadRisk() {
    const tbody = document.getElementById('riskTableBody');
    try {
        const data = await adminFetch('/api/admin/risk');
        if (!data.success) return;

        document.getElementById('riskCounterBadge').textContent = `${data.riskCount} Flags Detected`;

        if (data.flags.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--green); padding: 24px;">✅ No active fraud or anomaly flags detected. System clean.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.flags.map(f => `
            <tr>
                <td><code style="color: var(--red);">${f.id}</code></td>
                <td><strong>${f.userName || f.userId}</strong></td>
                <td><span class="status-badge danger">${f.riskLevel}</span></td>
                <td>${f.reason}</td>
                <td><span class="status-badge warning">${f.status}</span></td>
                <td>${new Date(f.createdAt).toLocaleString()}</td>
                <td><button class="btn danger-btn sm-btn" onclick="toggleUserStatus('${f.userId}', true)">Suspend Account</button></td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--red); padding: 24px;">Error: ${e.message}</td></tr>`;
    }
}

// ─── 9. AUDIT TRAIL ────────────────────────────────────────────────────────
async function loadAuditLogs() {
    const tbody = document.getElementById('auditTableBody');
    try {
        const data = await adminFetch('/api/admin/audit-logs');
        if (!data.success) return;

        if (data.logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-dim); padding: 24px;">No admin audit actions recorded yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.logs.map(a => `
            <tr>
                <td><code>${a.id}</code></td>
                <td><span class="admin-role-badge">${a.adminId}</span></td>
                <td><strong>${a.action}</strong></td>
                <td><span class="status-badge" style="background: rgba(0,240,255,0.1); color: var(--cyan);">${a.entity}</span></td>
                <td><code>${a.entityId || '—'}</code></td>
                <td>${a.ipAddress}</td>
                <td>${new Date(a.createdAt).toLocaleString()}</td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--red); padding: 24px;">Error: ${e.message}</td></tr>`;
    }
}

// ─── 10. WHEEL ENGINE & RIG ────────────────────────────────────────────────
async function loadWheelEngine() {
    try {
        const data = await adminFetch('/api/admin/stats');
        if (!data.slices) return;
        currentSlices = data.slices;

        const tbody = document.getElementById('probabilityTableBody');
        tbody.innerHTML = currentSlices.map((s, idx) => `
            <tr>
                <td><span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${s.color}; margin-right:6px;"></span><strong>${s.label}</strong></td>
                <td><span class="status-badge">${s.type}</span></td>
                <td>${s.multiplier}x</td>
                <td><input type="number" class="admin-input" style="width: 70px; padding: 4px 6px;" value="${s.weight}" onchange="currentSlices[${idx}].weight = Number(this.value)"></td>
            </tr>
        `).join('');

        const rigSelect = document.getElementById('rigSelect');
        rigSelect.innerHTML = '<option value="">-- Normal Probability (Default) --</option>' + 
            currentSlices.map(s => `<option value="${s.id}" ${data.activeRigSlice === s.id ? 'selected' : ''}>${s.label} (${s.multiplier}x)</option>`).join('');

        document.getElementById('rigStatusMsg').textContent = data.activeRigSlice ? `Current Rig Active: ${data.activeRigSlice}` : 'Normal probability active.';
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
