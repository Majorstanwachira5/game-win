/**
 * challenges.js — Persistent Dashboard Daily Streak & Challenges Widget Logic
 */

let challengeDefs = {
    daily: [
        { id: 'play_5', label: 'Play 5 Games', description: 'Play any 5 games today', target: 5, icon: '🎮', reward: { label: '50 XP + 25 $SPIN Coins' } },
        { id: 'spin_once', label: 'Spin Wheel Once', description: 'Perform 1 wheel spin', target: 1, icon: '🎡', reward: { label: '1 Free Mystery Key' } },
        { id: 'win_500', label: 'Win KSh 500', description: 'Accumulate KSh 500 in total wins', target: 500, icon: '💰', reward: { label: '100 $SPIN Coins' } }
    ],
    weekly: [
        { id: 'win_10k', label: 'Win KSh 10,000', description: 'Reach KSh 10,000 total weekly wins', target: 10000, icon: '🏆', reward: { label: '500 $SPIN Coins + Silver Chest' } }
    ],
    monthly: [
        { id: 'spin_50', label: 'Spin 50 Times', description: 'Complete 50 spins this month', target: 50, icon: '👑', reward: { label: '1,000 XP + Gold Chest' } }
    ]
};
let challengeProgress = { daily: { play_5: { count: 3, completed: false }, spin_once: { count: 1, completed: true }, win_500: { count: 250, completed: false } } };
let currentPeriod = 'daily';
let countdownInterval = null;

function initChallenges() {
    window.switchChallengeTab('daily');
    startResetCountdown();
    loadChallenges();
}

window.toggleChallengesExpand = function() {
    const panel = document.getElementById('widgetExpandPanel');
    const arrow = document.getElementById('widgetExpandArrow');
    if (!panel) return;
    const isHidden = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = isHidden ? 'block' : 'none';
    if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
};

window.switchChallengeTab = function(period) {
    currentPeriod = period || 'daily';
    document.querySelectorAll('.panel-header-tabs .ch-tab, .challenges-tabs .ch-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.period === currentPeriod);
    });
    renderChallenges();
};

window.claimDailyStreak = window.claimStreakReward = function() {
    if (!window.APP_STATE || !window.APP_STATE.isAuthenticated) {
        if (window.showToast) window.showToast('Please Register or Log In first to claim your streak bonus!', 'warning');
        if (window.openAuthModal) window.openAuthModal('login');
        return;
    }

    const btn = document.getElementById('claimStreakBtn') || document.getElementById('widgetClaimBtn');
    if (btn) {
        btn.textContent = '✅ CLAIMED';
        btn.disabled = true;
        btn.classList.remove('gold-pulse-btn');
        btn.style.opacity = '0.6';
    }

    if (window.showToast) window.showToast('🎁 Daily Login Streak Bonus Claimed! +100 $SPIN Coins & 1 Free Spin!', 'success');
    if (window.showCoinsGainedBadge) window.showCoinsGainedBadge(100);

    if (window.APP_STATE) {
        window.APP_STATE.freeSpins = (window.APP_STATE.freeSpins || 0) + 1;
        window.APP_STATE.coins = (window.APP_STATE.coins || 0) + 100;
        if (window.APP_STATE.user) {
            window.APP_STATE.user.freeSpins = window.APP_STATE.freeSpins;
            window.APP_STATE.user.coins = window.APP_STATE.coins;
        }
        if (window.updateBalanceUI) window.updateBalanceUI(window.APP_STATE.balance, window.APP_STATE.coins);
        if (window.updateSpinButtonState) window.updateSpinButtonState();
        try { localStorage.setItem('spin_user_data', JSON.stringify(window.APP_STATE.user)); } catch(e) {}
    }
};

function startResetCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    const timerEl = document.getElementById('widgetResetTimer');
    if (!timerEl) return;

    function updateTimer() {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const diff = Math.max(0, Math.floor((tomorrow - now) / 1000));
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        const secs = diff % 60;
        timerEl.textContent = `⏳ Resets in ${hours}h ${mins}m ${secs}s`;
    }
    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
}

async function loadChallenges() {
    try {
        if (typeof apiFetch === 'function' && window.APP_STATE && window.APP_STATE.userId) {
            const res = await apiFetch(`/api/challenges/${APP_STATE.userId}`);
            if (res && res.challenges && res.definitions) {
                challengeProgress = res.challenges;
                challengeDefs = res.definitions;
            }
        }
        renderChallenges();
    } catch (err) {
        renderChallenges();
    }
}

function renderChallenges() {
    const dashContainer = document.getElementById('dashboardChallengesList');
    const modalContainer = document.getElementById('challengesList');
    const defs  = challengeDefs[currentPeriod] || challengeDefs.daily || [];
    const progs = (challengeProgress[currentPeriod] || {});

    const html = defs.map(ch => {
        const prog = progs[ch.id] || { count: 0, completed: false };
        const pct  = Math.min(100, Math.round((prog.count / ch.target) * 100));
        const done = prog.completed;
        return `
        <div class="challenge-item ${done ? 'completed' : ''}">
            <div class="ch-icon">${ch.icon || '🎯'}</div>
            <div class="ch-info">
                <div class="ch-label">${ch.label}</div>
                <div class="ch-desc">${ch.description}</div>
                <div class="ch-progress-bar">
                    <div class="ch-progress-fill" style="width:${pct}%"></div>
                </div>
                <div class="ch-progress-text">${prog.count} / ${ch.target}</div>
            </div>
            <div class="ch-reward">
                <div class="ch-reward-label">${ch.reward.label}</div>
                ${done ? '<div class="ch-badge-done">✅ CLAIMED</div>' : `<div class="ch-in-progress">${pct}% Complete</div>`}
            </div>
        </div>`;
    }).join('');

    if (dashContainer) dashContainer.innerHTML = html;
    if (modalContainer) modalContainer.innerHTML = html;
}

function handleChallengesCompleted(completedList) {
    if (!completedList || !completedList.length) return;
    for (const ch of completedList) {
        if (window.showToast) window.showToast(`🎯 Challenge Complete! ${ch.label} — Reward: ${ch.reward.label}`, 'success');
    }
    loadChallenges();
}

document.addEventListener('DOMContentLoaded', () => {
    initChallenges();
});
