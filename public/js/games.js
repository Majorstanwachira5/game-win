/**
 * games.js — All Mini-Game UI Logic
 * Mystery Box | Dice Roll | Pick a Card | Prize Ladder | Lucky 7
 */

/* ════════════════════════════════════════════════
   MYSTERY BOX
════════════════════════════════════════════════ */
function initMysteryBox() {
    document.querySelectorAll('.tier-open-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const tier = btn.dataset.tier;
            const betAmount = 0; // Price is enforced server-side per tier
            await openMysteryBox(tier);
        });
    });
}

async function openMysteryBox(tier) {
    const btn = document.querySelector(`.tier-open-btn[data-tier="${tier}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Opening...'; }

    try {
        const res = await apiPost('/api/mystery-box/open', {
            userId: APP_STATE.userId,
            tier,
            betAmount: 0
        });

        if (!res.success) throw new Error(res.error || 'Failed to open box');

        // Animate box opening
        const animArea = document.getElementById('mysteryBoxAnimArea');
        const boxLid   = document.getElementById('boxLid');
        const boxResult = document.getElementById('boxResult');

        const tierEmojis = { bronze: '📦', silver: '🥈', gold: '🥇', platinum: '💎' };
        boxLid.textContent = tierEmojis[tier] || '🎁';
        boxResult.textContent = '';
        animArea.style.display = 'block';
        animArea.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Trigger lid animation
        setTimeout(() => {
            boxLid.classList.add('opening');
            setTimeout(() => {
                boxLid.classList.remove('opening');
                boxResult.textContent = res.reward.label;
                if (res.winAmount > 0) {
                    boxResult.style.color = '#ffd700';
                    showWinModal(`KSh ${res.winAmount.toLocaleString()}`, res.reward.label, res.xpGained);
                    triggerConfetti();
                } else if (res.reward.type === 'free_spin') {
                    showToast('🎁 Free Spin added to your account!', 'success');
                } else if (res.reward.type === 'double_next') {
                    showToast('🔥 Double Next Win activated!', 'warning');
                } else if (res.reward.type === 'jackpot_entry') {
                    showToast('⭐ Exclusive Jackpot Entry earned!', 'info');
                } else {
                    showToast('😔 Better luck next time!', 'info');
                }

                updateUserState(res.user, res.coinsGained);
                handleChallengesCompleted(res.completedChallenges);
                handleTierUp(res);

                setTimeout(() => { animArea.style.display = 'none'; }, 3000);
            }, 1000);
        }, 100);

    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'OPEN BOX';
        }
    }
}

/* ════════════════════════════════════════════════
   DICE ROLL
════════════════════════════════════════════════ */
let diceMode = 'single';
let diceBet   = 100;

const DICE_FACES = {
    1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅'
};

function initDiceRoll() {
    // Mode selector
    document.querySelectorAll('#modal-dice .mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#modal-dice .mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            diceMode = btn.dataset.mode;
            updateDiceUI();
        });
    });

    // Bet chips
    document.querySelectorAll('#modal-dice .bet-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#modal-dice .bet-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            diceBet = Number(chip.dataset.amount);
        });
    });

    const rollBtn = document.getElementById('rollDiceBtn');
    if (rollBtn) rollBtn.addEventListener('click', rollDice);
    updateDiceUI();
}

function updateDiceUI() {
    const die2 = document.getElementById('die2');
    const combosInfo = document.getElementById('diceCombosInfo');

    if (diceMode === 'single') {
        if (die2) die2.classList.add('hidden');
        if (combosInfo) {
            combosInfo.innerHTML = `
                <div class="combo-info">
                    <div class="combo-row"><span>⚀ 1</span><span>No Win</span></div>
                    <div class="combo-row"><span>⚁ 2</span><span>×0.2</span></div>
                    <div class="combo-row"><span>⚂ 3</span><span>×0.5</span></div>
                    <div class="combo-row"><span>⚃ 4</span><span>×1</span></div>
                    <div class="combo-row"><span>⚄ 5</span><span>×2</span></div>
                    <div class="combo-row"><span>⚅ 6</span><span>×5</span></div>
                </div>`;
        }
    } else {
        if (die2) die2.classList.remove('hidden');
        if (combosInfo) {
            combosInfo.innerHTML = `
                <div class="combo-info" style="columns:2;gap:20px">
                    <div class="combo-row"><span>⚀+⚀</span><span>🍀 Free Spin</span></div>
                    <div class="combo-row"><span>⚁+⚁</span><span>×2</span></div>
                    <div class="combo-row"><span>⚂+⚂</span><span>×5</span></div>
                    <div class="combo-row"><span>⚃+⚃</span><span>×10</span></div>
                    <div class="combo-row"><span>⚄+⚄</span><span>×20</span></div>
                    <div class="combo-row"><span>⚅+⚅</span><span>×50 🏆</span></div>
                    <div class="combo-row"><span>Total 7</span><span>×1.5 Bonus</span></div>
                    <div class="combo-row"><span>Total 11</span><span>📦 Mystery Key</span></div>
                </div>`;
        }
    }
}

async function rollDice() {
    const btn = document.getElementById('rollDiceBtn');
    const die1El = document.getElementById('die1');
    const die2El = document.getElementById('die2');
    const resultEl = document.getElementById('diceResult');

    btn.disabled = true;
    btn.textContent = 'Rolling...';
    resultEl.textContent = '';

    // Animate dice rolling
    die1El.classList.add('rolling');
    if (diceMode === 'double') die2El.classList.add('rolling');

    try {
        const res = await apiPost('/api/dice/roll', {
            userId: APP_STATE.userId,
            diceMode,
            betAmount: diceBet
        });

        if (!res.success) throw new Error(res.error || 'Roll failed');

        // Show dice faces after animation
        setTimeout(() => {
            die1El.classList.remove('rolling');
            die2El.classList.remove('rolling');
            die1El.textContent = DICE_FACES[res.dice[0]] || '🎲';
            if (diceMode === 'double') {
                die2El.textContent = DICE_FACES[res.dice[1]] || '🎲';
            }

            resultEl.textContent = res.outcome.label;

            if (res.winAmount > 0) {
                resultEl.style.color = '#ffd700';
                showWinModal(`KSh ${res.winAmount.toLocaleString()}`, res.outcome.label, res.xpGained);
                triggerConfetti();
            } else if (res.outcome.type === 'free_spin') {
                showToast('🍀 Free Spin added!', 'success');
                resultEl.style.color = '#00f0ff';
            } else if (res.outcome.type === 'mystery_key') {
                showToast('📦 Mystery Box Key earned!', 'info');
                resultEl.style.color = '#00f0ff';
            } else if (res.outcome.type === 'retry') {
                showToast('🍀 Snake Eyes! Lucky Retry granted!', 'warning');
            } else {
                resultEl.style.color = '#ff4444';
                showToast('🎲 No win this time. Try again!', 'info');
            }

            updateUserState(res.user, res.coinsGained);
            handleChallengesCompleted(res.completedChallenges);
            handleTierUp(res);
        }, 700);

    } catch (err) {
        die1El.classList.remove('rolling');
        die2El.classList.remove('rolling');
        showToast(err.message, 'error');
    } finally {
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = '🎲 ROLL DICE';
        }, 1000);
    }
}

/* ════════════════════════════════════════════════
   PICK A CARD
════════════════════════════════════════════════ */
let cardBet = 100;
let cardsActive = true;

function initPickCard() {
    document.querySelectorAll('#modal-card .bet-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#modal-card .bet-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            cardBet = Number(chip.dataset.amount);
        });
    });

    document.querySelectorAll('.play-card').forEach(card => {
        card.addEventListener('click', () => {
            if (!cardsActive) return;
            const idx = Number(card.dataset.index);
            pickCard(idx);
        });
    });

    const resetBtn = document.getElementById('resetCardsBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetCards);
}

async function pickCard(cardIndex) {
    cardsActive = false;
    const resultEl = document.getElementById('cardResult');
    const hintEl = document.getElementById('cardHint');
    const resetBtn = document.getElementById('resetCardsBtn');
    resultEl.textContent = '';
    hintEl.textContent = '⏳ Revealing cards...';

    try {
        const res = await apiPost('/api/cards/deal', {
            userId: APP_STATE.userId,
            cardIndex,
            betAmount: cardBet
        });

        if (!res.success) throw new Error(res.error || 'Card deal failed');

        // Reveal chosen card first
        setTimeout(() => {
            const chosenEl = document.querySelector(`.play-card[data-index="${cardIndex}"]`);
            if (chosenEl) {
                chosenEl.classList.add('flipped', 'chosen-box');
                const back = chosenEl.querySelector('.card-back');
                if (back) back.innerHTML = `<span style="font-size:20px">${getRewardEmoji(res.chosen)}</span><span>${res.chosen.label}</span>`;
                if (res.winAmount > 0) chosenEl.classList.add('win-card');
            }

            // Then reveal all other cards with staggered delay
            res.cards.forEach((card, i) => {
                if (i === cardIndex) return;
                setTimeout(() => {
                    const cardEl = document.querySelector(`.play-card[data-index="${i}"]`);
                    if (cardEl) {
                        cardEl.classList.add('flipped');
                        const back = cardEl.querySelector('.card-back');
                        if (back) back.innerHTML = `<span style="font-size:18px">${getRewardEmoji(card)}</span><span style="font-size:11px">${card.label}</span>`;
                    }
                }, 200 * (i + 1));
            });

            // Show result
            setTimeout(() => {
                if (res.winAmount > 0) {
                    resultEl.textContent = `🏆 You won KSh ${res.winAmount.toLocaleString()}!`;
                    resultEl.style.color = '#ffd700';
                    showWinModal(`KSh ${res.winAmount.toLocaleString()}`, res.chosen.label, res.xpGained);
                    triggerConfetti();
                } else if (res.chosen.type === 'free_spin') {
                    resultEl.textContent = '🎁 Free Spin added!';
                    resultEl.style.color = '#00f0ff';
                } else if (res.chosen.type === 'double_next') {
                    resultEl.textContent = '🔥 Double Next Win!';
                    resultEl.style.color = '#ff6400';
                } else if (res.chosen.type === 'mystery_key') {
                    resultEl.textContent = '📦 Mystery Box Key!';
                    resultEl.style.color = '#00f0ff';
                } else {
                    resultEl.textContent = '😔 No win this time!';
                    resultEl.style.color = '#ff4444';
                }

                hintEl.style.display = 'none';
                resetBtn.style.display = 'inline-block';
                updateUserState(res.user, res.coinsGained);
                handleChallengesCompleted(res.completedChallenges);
                handleTierUp(res);
            }, 1200);
        }, 200);

    } catch (err) {
        showToast(err.message, 'error');
        cardsActive = true;
        hintEl.textContent = '👆 Click a card to reveal your prize!';
    }
}

function getRewardEmoji(reward) {
    const emap = { win: '💰', jackpot: '🏆', free_spin: '🎁', double_next: '🔥', mystery_key: '📦', loss: '❌' };
    return emap[reward.type] || '🃏';
}

function resetCards() {
    document.querySelectorAll('.play-card').forEach(card => {
        card.classList.remove('flipped', 'chosen-box', 'win-card');
        const front = card.querySelector('.card-front');
        const back = card.querySelector('.card-back');
        if (front) front.textContent = '?';
        if (back) back.innerHTML = '';
    });
    document.getElementById('cardResult').textContent = '';
    document.getElementById('cardHint').textContent = '👆 Click a card to reveal your prize!';
    document.getElementById('cardHint').style.display = 'block';
    document.getElementById('resetCardsBtn').style.display = 'none';
    cardsActive = true;
}

/* ════════════════════════════════════════════════
   PRIZE LADDER
════════════════════════════════════════════════ */
let ladderSessionId = null;
let ladderBet = 500;
let ladderCurrentLevel = 0;
const LADDER_LEVELS = [
    { level: 1, label: 'Level 1',  multiplier: 0.2,  riskPercent: 10 },
    { level: 2, label: 'Level 2',  multiplier: 0.5,  riskPercent: 15 },
    { level: 3, label: 'Level 3',  multiplier: 1.0,  riskPercent: 20 },
    { level: 4, label: 'Level 4',  multiplier: 2.0,  riskPercent: 25 },
    { level: 5, label: 'Level 5',  multiplier: 5.0,  riskPercent: 30 },
    { level: 6, label: 'Level 6',  multiplier: 10.0, riskPercent: 35 },
    { level: 7, label: 'Level 7',  multiplier: 20.0, riskPercent: 40 },
    { level: 8, label: '🏆 JACKPOT!', multiplier: 50.0, riskPercent: 0 },
];

function initPrizeLadder() {
    renderLadderLevels();

    document.querySelectorAll('#tab-ladder .bet-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#tab-ladder .bet-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            ladderBet = Number(chip.dataset.amount);
        });
    });

    document.getElementById('startLadderBtn').addEventListener('click', startLadder);
    document.getElementById('cashoutLadderBtn').addEventListener('click', () => doLadderAction('cashout'));
    document.getElementById('continueLadderBtn').addEventListener('click', () => doLadderAction('continue'));
}

function renderLadderLevels(currentLevel = 0) {
    const container = document.getElementById('ladderLevels');
    // Render reversed (top = highest)
    container.innerHTML = [...LADDER_LEVELS].reverse().map(l => `
        <div class="ladder-level ${l.level === currentLevel ? 'current' : ''} ${l.level < currentLevel ? 'passed' : ''} ${l.level === 8 ? 'jackpot-level' : ''}" id="ladder-level-${l.level}">
            <span class="level-num">L${l.level}</span>
            <span class="level-label">${l.label}</span>
            <span class="level-mult">×${l.multiplier}</span>
            ${l.riskPercent > 0 ? `<span class="level-risk">⚠ ${l.riskPercent}% loss risk</span>` : '<span class="level-risk">🏆 JACKPOT</span>'}
        </div>
    `).join('');
}

async function startLadder() {
    const btn = document.getElementById('startLadderBtn');
    btn.disabled = true;
    btn.textContent = 'Starting...';

    try {
        const res = await apiPost('/api/ladder/start', { userId: APP_STATE.userId, betAmount: ladderBet });
        if (!res.success) throw new Error(res.error || 'Failed to start ladder');

        ladderSessionId = res.sessionId;
        ladderCurrentLevel = 1;

        renderLadderLevels(1);
        document.getElementById('startLadderBtn').style.display = 'none';
        document.getElementById('ladderActionButtons').style.display = 'flex';
        document.getElementById('ladderStatus').innerHTML = `
            <div>
                <div style="color:var(--gold);font-weight:700;font-size:16px">Level 1 — ×0.2</div>
                <div style="color:var(--text-muted);font-size:13px;margin-top:4px">
                    Current value: KSh ${(ladderBet * 0.2).toLocaleString()}<br>
                    Cash out or risk it for ×0.5!
                </div>
            </div>`;
        updateUserState(res.user, res.coinsGained);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🪜 START LADDER';
    }
}

async function doLadderAction(action) {
    if (!ladderSessionId) return;

    const cashoutBtn = document.getElementById('cashoutLadderBtn');
    const continueBtn = document.getElementById('continueLadderBtn');
    cashoutBtn.disabled = true;
    continueBtn.disabled = true;

    try {
        const res = await apiPost('/api/ladder/action', {
            userId: APP_STATE.userId,
            sessionId: ladderSessionId,
            action
        });

        if (!res.success) throw new Error(res.error || 'Action failed');

        if (res.result === 'win' || res.result === 'cashout') {
            showToast(`💰 Cashed out KSh ${res.winAmount.toLocaleString()}!`, 'success');
            showWinModal(`KSh ${res.winAmount.toLocaleString()}`, `Level ${res.level} Cash Out`, 0);
            triggerConfetti();
            endLadderGame();
        } else if (res.result === 'jackpot') {
            showToast('🏆 JACKPOT! You reached the top!', 'success');
            showWinModal(`KSh ${res.winAmount.toLocaleString()}`, '×50 JACKPOT — TOP OF THE LADDER!', 0);
            triggerConfetti();
            triggerConfetti();
            endLadderGame();
        } else if (res.result === 'loss') {
            document.getElementById('ladderStatus').innerHTML = `
                <div style="color:var(--red);font-size:16px;font-weight:700">
                    💥 YOU FELL! Game over at Level ${res.level}
                </div>`;
            showToast('💥 You lost everything! Better luck next time.', 'error');
            endLadderGame(true);
        } else if (res.result === 'advance') {
            ladderCurrentLevel = res.level;
            renderLadderLevels(res.level);
            const levelDef = LADDER_LEVELS[res.level - 1];
            document.getElementById('ladderStatus').innerHTML = `
                <div>
                    <div style="color:var(--gold);font-weight:700;font-size:16px">Level ${res.level} — ×${levelDef.multiplier}</div>
                    <div style="color:var(--text-muted);font-size:13px;margin-top:4px">
                        Current value: KSh ${(ladderBet * levelDef.multiplier).toLocaleString()}<br>
                        ${res.level < 8 ? `Cash out or risk ${levelDef.riskPercent}% to climb higher!` : 'You are one step from the jackpot!'}
                    </div>
                </div>`;
            showToast(`🎉 Advanced to Level ${res.level}!`, 'success');
        }

        updateUserState(res.user, res.coinsGained);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (cashoutBtn.isConnected) { cashoutBtn.disabled = false; continueBtn.disabled = false; }
    }
}

function endLadderGame(showRestart = false) {
    ladderSessionId = null;
    document.getElementById('ladderActionButtons').style.display = 'none';
    const startBtn = document.getElementById('startLadderBtn');
    startBtn.style.display = 'block';
    startBtn.textContent = '🪜 PLAY AGAIN';
    setTimeout(() => { renderLadderLevels(0); }, 2000);
}

/* ════════════════════════════════════════════════
   LUCKY 7
════════════════════════════════════════════════ */
let lucky7Bet = 100;
let lucky7Active = true;

function initLucky7() {
    document.querySelectorAll('#modal-lucky7 .bet-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#modal-lucky7 .bet-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            lucky7Bet = Number(chip.dataset.amount);
        });
    });

    document.querySelectorAll('.lucky-box').forEach(box => {
        box.addEventListener('click', () => {
            if (!lucky7Active) return;
            playLucky7(Number(box.dataset.index));
        });
    });

    const resetBtn = document.getElementById('resetLucky7Btn');
    if (resetBtn) resetBtn.addEventListener('click', resetLucky7);
}

async function playLucky7(boxIndex) {
    lucky7Active = false;
    const resultEl = document.getElementById('lucky7Result');
    const hintEl   = document.getElementById('lucky7Hint');
    const resetBtn  = document.getElementById('resetLucky7Btn');
    resultEl.textContent = '';
    hintEl.textContent = '⏳ Revealing boxes...';

    // Highlight chosen box
    const chosenBox = document.querySelector(`.lucky-box[data-index="${boxIndex}"]`);
    if (chosenBox) chosenBox.classList.add('chosen-box');

    try {
        const res = await apiPost('/api/lucky7/play', {
            userId: APP_STATE.userId,
            boxIndex,
            betAmount: lucky7Bet
        });

        if (!res.success) throw new Error(res.error || 'Lucky 7 failed');

        // Reveal all boxes with stagger
        res.boxes.forEach((reward, i) => {
            setTimeout(() => {
                const boxEl = document.querySelector(`.lucky-box[data-index="${i}"]`);
                if (!boxEl) return;
                boxEl.classList.add('opened');
                const emoji = boxEl.querySelector('.box-emoji');
                if (emoji) emoji.textContent = getRewardEmoji(reward);

                // Add reward label
                let rewardLabel = boxEl.querySelector('.box-reward-label');
                if (!rewardLabel) {
                    rewardLabel = document.createElement('div');
                    rewardLabel.className = 'box-reward-label';
                    boxEl.appendChild(rewardLabel);
                }
                rewardLabel.textContent = reward.label;

                if (reward.type === 'jackpot') boxEl.classList.add('jackpot-box');
                else if (reward.type === 'win') boxEl.classList.add('win-box');
                else if (reward.type === 'loss') boxEl.classList.add('loss-box');
            }, i === boxIndex ? 0 : 300 + (i * 200));
        });

        // Show result after all reveals
        setTimeout(() => {
            if (res.winAmount > 0) {
                resultEl.textContent = `🏆 Box ${boxIndex + 1} wins KSh ${res.winAmount.toLocaleString()}!`;
                resultEl.style.color = '#ffd700';
                showWinModal(`KSh ${res.winAmount.toLocaleString()}`, res.chosen.label, res.xpGained);
                triggerConfetti();
            } else if (res.chosen.type === 'free_spin') {
                resultEl.textContent = '🎁 Box ' + (boxIndex+1) + ' gives a Free Spin!';
                resultEl.style.color = '#00f0ff';
            } else if (res.chosen.type === 'mystery_key') {
                resultEl.textContent = '📦 Mystery Box Key found!';
                resultEl.style.color = '#00f0ff';
            } else {
                resultEl.textContent = '😔 Box ' + (boxIndex+1) + ' is empty. Try again!';
                resultEl.style.color = '#ff4444';
            }

            hintEl.style.display = 'none';
            resetBtn.style.display = 'inline-block';
            updateUserState(res.user, res.coinsGained);
            handleChallengesCompleted(res.completedChallenges);
            handleTierUp(res);
        }, 300 + (7 * 200) + 200);

    } catch (err) {
        showToast(err.message, 'error');
        lucky7Active = true;
        hintEl.textContent = '👆 Pick a box to reveal your prize!';
        if (chosenBox) chosenBox.classList.remove('chosen-box');
    }
}

function resetLucky7() {
    document.querySelectorAll('.lucky-box').forEach(box => {
        box.className = 'lucky-box';
        box.dataset.index = box.dataset.index;
        const emoji = box.querySelector('.box-emoji');
        if (emoji) emoji.textContent = '🎁';
        const rewardLabel = box.querySelector('.box-reward-label');
        if (rewardLabel) rewardLabel.remove();
    });
    document.getElementById('lucky7Result').textContent = '';
    document.getElementById('lucky7Hint').textContent = '👆 Pick a box to reveal your prize!';
    document.getElementById('lucky7Hint').style.display = 'block';
    document.getElementById('resetLucky7Btn').style.display = 'none';
    lucky7Active = true;
}

// Initialize all games and expose globally
window.openMysteryBox = openMysteryBox;
window.rollDice = rollDice;
window.pickCard = pickCard;
window.playLucky7 = playLucky7;

window.initAllGames = function() {
    initMysteryBox();
    initDiceRoll();
    initPickCard();
    initPrizeLadder();
    initLucky7();
};
