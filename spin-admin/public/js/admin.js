/**
 * admin.js — Admin Panel Control Center
 * Auth management, stats, probability tables, player management, rig tool, payment settings
 */

const API_BASE = 'http://localhost:8080';
let adminToken = localStorage.getItem('spinwin_admin_token') || null;
let currentSlices = [];

// ─── API HELPERS ───────────────────────────────────────────────────────────
async function adminFetch(endpoint) {
    const headers = { 'Content-Type': 'application/json' };
    if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
    const res = await fetch(API_BASE + endpoint, { headers });
    if (res.status === 401 || res.status === 403) {
        showAuthModal();
        throw new Error('Unauthorized');
    }
    return res.json();
}

async function adminPost(endpoint, body = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
    const res = await fetch(API_BASE + endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
    if (res.status === 401 || res.status === 403) {
        showAuthModal();
        throw new Error('Unauthorized');
    }
    return res.json();
}

// ─── INITIALIZATION ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    bindAuthForm();
    bindTabs();

    if (adminToken) {
        hideAuthModal();
        loadDashboardData();
    } else {
        showAuthModal();
    }
});

// ─── AUTHENTICATION ────────────────────────────────────────────────────────
function showAuthModal() {
    document.getElementById('adminAuthModal').style.display = 'flex';
    document.getElementById('adminLogoutBtn').style.display = 'none';
}

function hideAuthModal() {
    document.getElementById('adminAuthModal').style.display = 'none';
    document.getElementById('adminLogoutBtn').style.display = 'inline-block';
}

function bindAuthForm() {
    const form = document.getElementById('adminLoginForm');
    const errEl = document.getElementById('authErrorMsg');
    const logoutBtn = document.getElementById('adminLogoutBtn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('adminPasswordInput').value;
        errEl.style.display = 'none';

        try {
            const res = await fetch(API_BASE + '/api/auth/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();

            if (data.token) {
                adminToken = data.token;
                localStorage.setItem('spinwin_admin_token', adminToken);
                hideAuthModal();
                loadDashboardData();
            } else {
                throw new Error(data.error || 'Login failed');
            }
        } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            adminToken = null;
            localStorage.removeItem('spinwin_admin_token');
            showAuthModal();
        });
    }
}

// ─── TABS ──────────────────────────────────────────────────────────────────
function bindTabs() {
    document.querySelectorAll('.adm-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.adm-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            const panel = document.getElementById(`tab-adm-${target}`);
            if (panel) panel.classList.add('active');

            if (target === 'players') loadPlayersList();
        });
    });
}

// ─── DASHBOARD DATA LOAD ──────────────────────────────────────────────────
async function loadDashboardData() {
    try {
        const stats = await adminFetch('/api/admin/stats');
        updateKPICards(stats);
        updateProbabilityTable(stats.slices);
        updateRigSelect(stats.slices, stats.activeRigSlice);
        updateGameBreakdown(stats);
        bindControlButtons();
    } catch (err) {
        console.warn('Dashboard load error:', err.message);
    }
}

function updateKPICards(stats) {
    document.getElementById('totalRevenueText').textContent = `KSh ${stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('totalPayoutText').textContent  = `KSh ${stats.totalPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('houseProfitText').textContent  = `KSh ${stats.houseNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById('rtpText').textContent          = `Realized RTP: ${stats.rtpPercent}%`;
    document.getElementById('profitMarginText').textContent  = `House Margin: ${stats.profitMarginPercent}% (Target: 85%)`;
    document.getElementById('totalSpinsText').textContent   = stats.totalSpins.toLocaleString();
}

function updateGameBreakdown(stats) {
    document.getElementById('statWheelCount').textContent  = `${(stats.totalSpins || 0).toLocaleString()} plays`;
    document.getElementById('statBoxCount').textContent    = `${(stats.totalBoxes || 0).toLocaleString()} plays`;
    document.getElementById('statDiceCount').textContent   = `${(stats.totalDice || 0).toLocaleString()} plays`;
    document.getElementById('statCardCount').textContent   = `${(stats.totalCards || 0).toLocaleString()} plays`;
    document.getElementById('statLadderCount').textContent = `${(stats.totalLadder || 0).toLocaleString()} plays`;
    document.getElementById('statLucky7Count').textContent = `${(stats.totalLucky7 || 0).toLocaleString()} plays`;
}

function updateProbabilityTable(slices) {
    if (!slices) return;
    currentSlices = slices;
    const tbody = document.getElementById('probabilityTableBody');
    const totalWeight = slices.reduce((s, x) => s + Number(x.weight), 0);

    tbody.innerHTML = slices.map((slice, i) => {
        const pct = totalWeight > 0 ? ((slice.weight / totalWeight) * 100).toFixed(2) : '0';
        return `
        <tr>
            <td><strong>${slice.id}</strong></td>
            <td>${slice.label}</td>
            <td><span class="status-badge active">${slice.type}</span></td>
            <td>${slice.multiplier || 0}x</td>
            <td>
                <input type="number" class="weight-input" data-index="${i}" value="${slice.weight}" min="0">
            </td>
            <td><strong>${pct}%</strong></td>
        </tr>`;
    }).join('');
}

function updateRigSelect(slices, activeRig) {
    const select = document.getElementById('rigSliceSelect');
    if (!select || !slices) return;
    select.innerHTML = `<option value="">-- DISABLED (Random Crypto RNG) --</option>` +
        slices.map(s => `<option value="${s.id}" ${activeRig === s.id ? 'selected' : ''}>[${s.id}] ${s.label}</option>`).join('');

    const statusEl = document.getElementById('rigStatusMessage');
    if (statusEl) {
        statusEl.textContent = activeRig ? `Status: DEMO RIG ACTIVE on [${activeRig}]` : 'Status: Normal Random Mode (Crypto RNG)';
    }
}

// ─── CONTROL BINDINGS ──────────────────────────────────────────────────────
function bindControlButtons() {
    // Save probabilities
    const saveProbBtn = document.getElementById('saveProbabilitiesBtn');
    if (saveProbBtn) {
        saveProbBtn.onclick = async () => {
            const inputs = document.querySelectorAll('.weight-input');
            inputs.forEach(input => {
                const idx = Number(input.dataset.index);
                if (currentSlices[idx]) currentSlices[idx].weight = Number(input.value);
            });
            saveProbBtn.disabled = true;
            try {
                const res = await adminPost('/api/admin/probabilities', { slices: currentSlices });
                alert(res.message || 'Probabilities updated!');
                loadDashboardData();
            } catch (err) {
                alert(err.message);
            } finally {
                saveProbBtn.disabled = false;
            }
        };
    }

    // Apply rig override
    const setRigBtn = document.getElementById('setRigBtn');
    if (setRigBtn) {
        setRigBtn.onclick = async () => {
            const sliceId = document.getElementById('rigSliceSelect').value;
            setRigBtn.disabled = true;
            try {
                const res = await adminPost('/api/admin/rig', { sliceId });
                alert(res.message);
                loadDashboardData();
            } catch (err) {
                alert(err.message);
            } finally {
                setRigBtn.disabled = false;
            }
        };
    }

    // Save payment keys & limits
    const savePayBtn = document.getElementById('savePaymentKeysBtn');
    if (savePayBtn) {
        savePayBtn.onclick = async () => {
            const paybill = document.getElementById('mpesaPaybillInput').value;
            const minDeposit = Number(document.getElementById('minDepositInput').value);
            const maxDeposit = Number(document.getElementById('maxDepositInput').value);
            savePayBtn.disabled = true;
            try {
                const res = await adminPost('/api/admin/settings', { mpesaPaybill: paybill, minDeposit, maxDeposit });
                alert(res.message || 'Settings saved!');
            } catch (err) {
                alert(err.message);
            } finally {
                savePayBtn.disabled = false;
            }
        };
    }

    // Refresh players
    const refreshPlayersBtn = document.getElementById('refreshPlayersBtn');
    if (refreshPlayersBtn) refreshPlayersBtn.onclick = loadPlayersList;
}

// ─── PLAYER MANAGEMENT ────────────────────────────────────────────────────
async function loadPlayersList() {
    const tbody = document.getElementById('playersTableBody');
    if (!tbody) return;

    try {
        const players = await adminFetch('/api/admin/players');
        tbody.innerHTML = players.map(p => `
            <tr>
                <td><strong>${p.phone || p.id}</strong></td>
                <td>KSh ${(p.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td><span class="status-badge active">${(p.vipTier || 'bronze').toUpperCase()}</span></td>
                <td>${(p.xp || 0).toLocaleString()} XP</td>
                <td>${p.freeSpins || 0}</td>
                <td>KSh ${(p.totalWon || 0).toLocaleString()}</td>
                <td>
                    <button class="btn primary-btn sm-btn" onclick="adjustPlayer('${p.id}')">EDIT</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.warn('Could not load players:', err.message);
    }
}

async function adjustPlayer(userId) {
    const balanceAdjust = prompt('Enter balance adjustment (e.g. +1000 or -500):', '0');
    if (balanceAdjust === null) return;
    const freeSpins = prompt('Set free spins count:', '5');
    if (freeSpins === null) return;

    try {
        const res = await adminPost('/api/admin/player/adjust', {
            userId,
            balanceAdjust: Number(balanceAdjust),
            freeSpins: Number(freeSpins)
        });
        if (res.success) {
            alert('Player updated successfully!');
            loadPlayersList();
        }
    } catch (err) {
        alert(err.message);
    }
}
