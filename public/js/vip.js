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

let vipTickerInterval = null;

function startVIPTicker() {
    const scrollEl = document.getElementById('vipTickerScroll');
    if (!scrollEl || vipTickerInterval) return;

    const mockBoosts = [
        "🔥 User 0712***940 unlocked SILVER VIP (+2 Free Spins/day)",
        "👑 User 0798***112 achieved DIAMOND VIP status!",
        "⭐ User 0701***554 unlocked GOLD VIP perks!",
        "💎 User 0725***881 unlocked PLATINUM VIP (+5 Free Spins/day)",
        "🎁 User 0743***002 received Daily VIP Bonus +500 Coins"
    ];
    let idx = 0;

    vipTickerInterval = setInterval(() => {
        idx = (idx + 1) % mockBoosts.length;
        if (scrollEl) {
            scrollEl.innerHTML = `<span>${mockBoosts[idx]}</span>`;
        }
    }, 3500);
}

function updateVIPDisplay(xp, tier, nextTier, dailySpins) {
    const xpCurrent        = document.getElementById('xpCurrent');
    const xpNextEl         = document.getElementById('xpNext');
    const xpBarFill        = document.getElementById('xpBarFill');
    const vipBadge         = document.getElementById('vipBadge');
    const vipTierName      = document.getElementById('vipTierName');
    const playerIdEl       = document.getElementById('vipPlayerId');
    const remainingBanner  = document.getElementById('xpRemainingBanner');
    const coinsNeededText  = document.getElementById('coinsNeededText');
    const nextTierTitle    = document.getElementById('nextTierTitle');

    if (!tier) return;

    if (playerIdEl) {
        const raw = (APP_STATE.user && (APP_STATE.user.phone || APP_STATE.user.username || APP_STATE.user.id)) || APP_STATE.userId || '0712***840';
        playerIdEl.textContent = String(raw).replace(/^demo-user-\d+$/i, '0712***840').toUpperCase();
    }

    if (xpCurrent) xpCurrent.textContent = (xp || 0).toLocaleString();
    if (vipBadge)  vipBadge.textContent  = tier.icon || '🥉';
    if (vipTierName) vipTierName.textContent = `${(tier.name || 'BRONZE').toUpperCase()} VIP`;

    if (nextTier) {
        if (xpNextEl) xpNextEl.textContent = nextTier.minXP.toLocaleString();
        const pct = Math.min(100, Math.max(5, (((xp || 0) - tier.minXP) / (nextTier.minXP - tier.minXP)) * 100));
        if (xpBarFill) xpBarFill.style.width = pct + '%';

        const xpNeeded = Math.max(0, nextTier.minXP - (xp || 0));
        const coinsNeeded = xpNeeded * 10;

        if (coinsNeededText) coinsNeededText.textContent = `KSh ${coinsNeeded.toLocaleString()}`;
        if (nextTierTitle) nextTierTitle.textContent = `${(nextTier.name || 'SILVER').toUpperCase()} VIP`;
        if (remainingBanner) remainingBanner.style.display = 'block';
    } else {
        if (xpNextEl) xpNextEl.textContent = 'MAX TIER';
        if (xpBarFill) xpBarFill.style.width = '100%';
        if (remainingBanner) remainingBanner.innerHTML = '👑 <strong>MAX DIAMOND VIP UNLOCKED!</strong> You are at peak rewards.';
    }

    renderVIPTiersLadder(tier.id);
    startVIPTicker();
}

function renderVIPTiersLadder(currentTierId) {
    const container = document.getElementById('vipTiersLadder');
    if (!container) return;

    container.innerHTML = VIP_TIERS_CLIENT.map(t => {
        const isCurrent = t.id === currentTierId;
        return `
            <div class="vip-tier-card ${isCurrent ? 'active-tier' : ''}" style="border-color:${t.color}">
                <div class="tier-card-header">
                    <span class="tier-card-icon">${t.icon}</span>
                    <span class="tier-card-name" style="color:${t.color}">${t.name}</span>
                </div>
                <div class="tier-card-xp">${t.maxXP === Infinity ? `${t.minXP.toLocaleString()}+ XP` : `${t.minXP.toLocaleString()} XP`}</div>
            </div>
        `;
    }).join('');
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

window.closeVIPModal = function() {
    const modal = document.getElementById('modal-vip');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('open', 'active');
        modal.setAttribute('style', 'display: none !important');
    }
};

window.openVIPModal = function() {
    const modal = document.getElementById('modal-vip');
    if (modal) {
        modal.classList.add('open');
        modal.setAttribute('style', 'display: flex !important');
    }
    if (typeof loadVIPData === 'function') loadVIPData();
};
