/**
 * challenges.js — Challenges Panel UI
 */

let challengeDefs = {};
let challengeProgress = {};
let currentPeriod = 'daily';

function initChallenges() {
    document.querySelectorAll('.ch-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.ch-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentPeriod = tab.dataset.period;
            renderChallenges();
        });
    });
}

async function loadChallenges() {
    try {
        const res = await apiFetch(`/api/challenges/${APP_STATE.userId}`);
        if (res.challenges && res.definitions) {
            challengeProgress = res.challenges;
            challengeDefs = res.definitions;
            renderChallenges();
        }
    } catch (err) {
        console.warn('Could not load challenges:', err.message);
    }
}

function renderChallenges() {
    const container = document.getElementById('challengesList');
    if (!container) return;

    const defs  = challengeDefs[currentPeriod] || [];
    const progs = (challengeProgress[currentPeriod] || {});

    if (!defs.length) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px">Loading challenges...</div>';
        return;
    }

    container.innerHTML = defs.map(ch => {
        const prog = progs[ch.id] || { count: 0, completed: false };
        const pct  = Math.min(100, Math.round((prog.count / ch.target) * 100));
        const done = prog.completed;
        return `
        <div class="challenge-item ${done ? 'completed' : ''}">
            <div class="ch-icon">${ch.icon}</div>
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
                ${done ? '<div class="ch-badge-done">✅</div>' : `<div style="font-size:11px;color:var(--text-muted)">In progress</div>`}
            </div>
        </div>`;
    }).join('');
}

function handleChallengesCompleted(completedList) {
    if (!completedList || !completedList.length) return;
    for (const ch of completedList) {
        showToast(`🎯 Challenge Complete! ${ch.label} — Reward: ${ch.reward.label}`, 'success');
    }
    // Refresh challenge display
    loadChallenges();
}
