/**
 * vip.js — VIP Panel UI
 */

const VIP_TIERS_CLIENT = [
    { id: 'bronze',   name: 'Bronze',   icon: '🥉', minXP: 0,      maxXP: 999,    color: '#cd7f32' },
    { id: 'silver',   name: 'Silver',   icon: '🥈', minXP: 1000,   maxXP: 4999,   color: '#c0c0c0' },
    { id: 'gold',     name: 'Gold',     icon: '🥇', minXP: 5000,   maxXP: 19999,  color: '#ffd700' },
    { id: 'platinum', name: 'Platinum', icon: '💎', minXP: 20000,  maxXP: 99999,  color: '#e5e4e2' },
    { id: 'diamond',  name: 'Diamond',  icon: '👑', minXP: 100000, maxXP: Infinity, color: '#00d2ff' },
];

function initVIPPanel() {
    renderVIPTiersLadder();
}

async function loadVIPData() {
    try {
        const res = await apiFetch(`/api/vip/${APP_STATE.userId}`);
        updateVIPDisplay(res.xp, res.tier, res.nextTier, res.dailyFreeSpins);
    } catch (err) {
        console.warn('Could not load VIP data:', err.message);
    }
}

function updateVIPDisplay(xp, tier, nextTier, dailySpins) {
    const xpCurrent   = document.getElementById('xpCurrent');
    const xpNextEl    = document.getElementById('xpNext');
    const xpBarFill   = document.getElementById('xpBarFill');
    const vipBadge    = document.getElementById('vipBadge');
    const vipTierName = document.getElementById('vipTierName');
    const perksEl     = document.getElementById('vipPerksList');

    if (!tier) return;

    if (xpCurrent) xpCurrent.textContent = (xp || 0).toLocaleString();
    if (vipBadge)  vipBadge.textContent  = tier.icon || '🥉';
    if (vipTierName) vipTierName.textContent = tier.name || 'Bronze';

    // XP bar
    if (xpBarFill) {
        if (nextTier) {
            if (xpNextEl) xpNextEl.textContent = nextTier.minXP.toLocaleString();
            const pct = Math.min(100, ((xp - tier.minXP) / (nextTier.minXP - tier.minXP)) * 100);
            xpBarFill.style.width = pct + '%';
        } else {
            if (xpNextEl) xpNextEl.parentElement.textContent = 'Max Tier Reached!';
            xpBarFill.style.width = '100%';
        }
    }

    // Perks
    const perksData = {
        bronze:   ['Access to all games', '1 daily free spin', 'Standard jackpot'],
        silver:   ['All Bronze perks', '2 daily free spins', 'Priority support', '+5% win bonus'],
        gold:     ['All Silver perks', '3 daily free spins', '1 Silver Box/week', '+10% win bonus', 'Gold jackpot draws'],
        platinum: ['All Gold perks', '5 daily free spins', '1 Gold Box/week', '+15% win bonus', 'Exclusive events'],
        diamond:  ['All Platinum perks', '10 daily free spins', '1 Platinum Box/week', '+25% win bonus', 'VIP-only games', 'Account manager'],
    };
    const perks = perksData[tier.id] || perksData.bronze;
    if (perksEl) {
        perksEl.innerHTML = perks.map(p => `<div class="vip-perk-item">${p}</div>`).join('');
    }

    // Highlight current tier in ladder
    document.querySelectorAll('.vip-tier-row').forEach(row => {
        row.classList.toggle('current-tier', row.dataset.tier === tier.id);
    });
}

function renderVIPTiersLadder() {
    const container = document.getElementById('vipTiersLadder');
    if (!container) return;

    container.innerHTML = VIP_TIERS_CLIENT.map(t => `
        <div class="vip-tier-row" data-tier="${t.id}">
            <div class="vip-tier-icon">${t.icon}</div>
            <div class="vip-tier-info">
                <div class="vip-tier-label" style="color:${t.color}">${t.name}</div>
                <div class="vip-tier-xp">${t.maxXP === Infinity ? `${t.minXP.toLocaleString()}+ XP` : `${t.minXP.toLocaleString()} – ${t.maxXP.toLocaleString()} XP`}</div>
            </div>
        </div>
    `).join('');
}

function handleTierUp(res) {
    if (!res.tierUp) return;
    const tier = res.newTier;
    if (!tier) return;
    const modal  = document.getElementById('tierUpModal');
    const icon   = document.getElementById('tierUpIcon');
    const name   = document.getElementById('tierUpName');
    if (icon) icon.textContent = tier.icon || '⬆️';
    if (name) name.textContent = tier.name || 'Silver';
    if (modal) modal.style.display = 'flex';
    triggerConfetti();
}
