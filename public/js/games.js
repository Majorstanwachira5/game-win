/**
 * games.js — All Mini-Game UI Logic
 * Mystery Box | Dice Roll | Pick a Card | Prize Ladder | Lucky 7
 */

/* ════════════════════════════════════════════════
   MYSTERY BOX
════════════════════════════════════════════════ */
function initMysteryBox() {
  document.querySelectorAll(".tier-open-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tier = btn.dataset.tier;
      await openMysteryBox(tier);
    });
  });
}

async function openMysteryBox(tier) {
  if (!APP_STATE || !APP_STATE.isAuthenticated) {
    showToast('Please Register or Log In first to Open Mystery Boxes!', 'warning');
    if (window.openAuthModal) window.openAuthModal('register');
    return;
  }

  const prices = { bronze: 50, silver: 150, gold: 300, platinum: 500, diamond: 1000 };
  const cost = prices[tier] || 50;

  if (APP_STATE.isTester || (APP_STATE.balance || 0) >= cost) {
    executeOpenMysteryBox(tier);
    return;
  }

  if (typeof window.promptDirectMpesaPayAndPlay === "function") {
    window.promptDirectMpesaPayAndPlay(cost, `mystery_box_${tier}`, () => {
      executeOpenMysteryBox(tier);
    });
  } else {
    executeOpenMysteryBox(tier);
  }
}

async function executeOpenMysteryBox(tier) {
  const btn = document.querySelector(`.tier-open-btn[data-tier="${tier}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Opening...";
  }

  const animArea = document.getElementById("mysteryBoxAnimArea");
  const boxLid = document.getElementById("boxLid");
  const boxResult = document.getElementById("boxResult");

  const tierEmojis = {
    bronze: "📦",
    silver: "🥈",
    gold: "🥇",
    platinum: "💎",
    diamond: "👑",
  };

  if (boxLid) boxLid.textContent = tierEmojis[tier] || "🎁";
  if (boxResult) boxResult.textContent = "Unlocking...";
  if (animArea) {
    animArea.style.display = "block";
    animArea.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  try {
    const res = await apiPost("/api/mystery-box/open", {
      userId: APP_STATE.userId,
      tier,
      betAmount: 0,
    });

    if (!res || !res.success) throw new Error(res?.error || "Failed to open box");

    // Trigger lid animation
    if (boxLid) boxLid.classList.add("opening");

    setTimeout(() => {
      if (boxLid) boxLid.classList.remove("opening");
      if (boxResult) boxResult.textContent = res.reward.label;

      if (res.isTester || (typeof APP_STATE !== 'undefined' && APP_STATE.isTester)) {
        if (window.showTesterWinAnimation) window.showTesterWinAnimation(res.winAmount.toLocaleString() + ' PLAY COINS', '🎁 MYSTERY BOX WIN');
      } else if (res.winAmount > 0) {
        if (boxResult) boxResult.style.color = "#ffd700";
        showWinModal(
          `KSh ${res.winAmount.toLocaleString()}`,
          res.reward.label,
          res.xpGained,
        );
        triggerConfetti();
      } else if (res.reward.type === "free_spin") {
        showToast("🎁 Free Spin added to your account!", "success");
      } else if (res.reward.type === "double_next") {
        showToast("🔥 Double Next Win activated!", "warning");
      } else if (res.reward.type === "jackpot_entry") {
        showToast("⭐ Exclusive Jackpot Entry earned!", "info");
      } else {
        showToast("TRY AGAIN! Good luck next box.", "info");
      }

      updateUserState(res.user, res.coinsGained);
      if (typeof handleChallengesCompleted === 'function') handleChallengesCompleted(res.completedChallenges);
      if (typeof handleTierUp === 'function') handleTierUp(res);

      if (btn) {
        btn.disabled = false;
        btn.textContent = `OPEN (KSh ${res.price || 50})`;
      }

      setTimeout(() => {
        if (animArea) animArea.style.display = "none";
      }, 3500);
    }, 1200);

  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "OPEN BOX";
    }
    if (animArea) animArea.style.display = "none";
    showToast(err.message || "Failed to open mystery box", "error");
  }
}

/* ════════════════════════════════════════════════
   3D DICE ROLL — REAL-MONEY CRAPS EXPERIENCE
════════════════════════════════════════════════ */
let diceMode = "single";
let diceBet = 100;

const DICE_CUBE_ROTATIONS = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 0, y: 180 },
};

function playDiceImpactSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
}

window.setDiceMode = function (mode) {
  diceMode = mode;
  document.querySelectorAll("#modal-dice .mode-btn").forEach((btn) => {
    if (btn.dataset.mode === mode) btn.classList.add("active");
    else btn.classList.remove("active");
  });
  const cubeWrap2 = document.getElementById("cubeWrap2");
  if (cubeWrap2) {
    if (mode === "single") {
      cubeWrap2.classList.add("hidden");
      cubeWrap2.style.display = "none";
    } else {
      cubeWrap2.classList.remove("hidden");
      cubeWrap2.style.display = "flex";
    }
  }
  updateDiceUI();
};

window.setDiceBet = function (amount) {
  diceBet = Number(amount);
  document.querySelectorAll("#modal-dice .casino-chip").forEach((chip) => {
    if (Number(chip.dataset.amount) === Number(amount))
      chip.classList.add("active");
    else chip.classList.remove("active");
  });
};

function initDiceRoll() {
  document.querySelectorAll("#modal-dice .mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      window.setDiceMode(mode);
    });
  });

  document.querySelectorAll("#modal-dice .casino-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const amount = chip.dataset.amount;
      window.setDiceBet(amount);
    });
  });

  const rollBtn = document.getElementById("rollDiceBtn");
  if (rollBtn) rollBtn.addEventListener("click", rollDice);
  window.rollDice = rollDice;
  updateDiceUI();
}

function updateDiceUI() {
  const cubeWrap2 = document.getElementById("cubeWrap2");
  if (diceMode === "single") {
    if (cubeWrap2) cubeWrap2.style.display = "none";
  } else {
    if (cubeWrap2) cubeWrap2.style.display = "flex";
  }
}

async function rollDice() {
  if (typeof APP_STATE !== "undefined" && !APP_STATE.isAuthenticated) {
    showToast("Please Register or Log In first to roll 3D dice!", "warning");
    if (window.openAuthModal) window.openAuthModal("register");
    return;
  }

  const wager = Number(diceBet) || 100;
  if (typeof APP_STATE !== "undefined" && APP_STATE.isTester) {
    executeRollDice();
    return;
  }

  if (typeof window.promptDirectMpesaPayAndPlay === "function") {
    window.promptDirectMpesaPayAndPlay(wager, "dice_roll", () => {
      executeRollDice();
    });
  } else {
    executeRollDice();
  }
}

async function executeRollDice() {
  const btn = document.getElementById("rollDiceBtn");
  const die1 = document.getElementById("die1");
  const die2 = document.getElementById("die2");
  const resultEl = document.getElementById("diceResult");

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-dice-icon">🎲</span> ROLLING CRAPS...';
  }
  if (resultEl) resultEl.textContent = "";

  // Launch 3D dice roll physics
  playDiceImpactSound();

  if (die1) {
    die1.style.transition =
      "transform 1.2s cubic-bezier(0.15, 0.85, 0.35, 1.2)";
    die1.style.transform = `rotateX(${720 + Math.random() * 360}deg) rotateY(${720 + Math.random() * 360}deg) rotateZ(360deg) translateZ(30px)`;
  }
  if (die2 && diceMode === "double") {
    die2.style.transition =
      "transform 1.2s cubic-bezier(0.15, 0.85, 0.35, 1.2)";
    die2.style.transform = `rotateX(${720 + Math.random() * 360}deg) rotateY(${720 + Math.random() * 360}deg) rotateZ(360deg) translateZ(30px)`;
  }
  try {
    const res = await apiPost("/api/dice/roll", {
      userId: APP_STATE.userId,
      diceMode,
      betAmount: diceBet,
    });

    if (!res.success) throw new Error(res.error || "Roll failed");

    const val1 = res.dice ? res.dice[0] : 1;
    const val2 = res.dice ? res.dice[1] : 1;

    const rot1 = DICE_CUBE_ROTATIONS[val1] || { x: 0, y: 0 };
    const rot2 = DICE_CUBE_ROTATIONS[val2] || { x: 0, y: 0 };

    setTimeout(() => {
      playDiceImpactSound();

      if (die1) {
        die1.style.transition = "transform 0.5s cubic-bezier(0.2, 1.2, 0.4, 1)";
        die1.style.transform = `rotateX(${1440 + rot1.x}deg) rotateY(${1440 + rot1.y}deg) rotateZ(0deg) translateZ(0px)`;
      }
      if (die2 && diceMode === "double") {
        die2.style.transition = "transform 0.5s cubic-bezier(0.2, 1.2, 0.4, 1)";
        die2.style.transform = `rotateX(${1440 + rot2.x}deg) rotateY(${1440 + rot2.y}deg) rotateZ(0deg) translateZ(0px)`;
      }

      setTimeout(() => {
        if (resultEl) {
          resultEl.textContent =
            res.outcome.label ||
            `ROLLED ${val1}${diceMode === "double" ? " + " + val2 : ""}`;
        }

        if (res.winAmount > 0) {
          if (resultEl) resultEl.style.color = "#ffd700";
          showWinModal(
            `KSh ${res.winAmount.toLocaleString()}`,
            res.outcome.label,
            res.xpGained,
          );
          if (window.triggerCoinDropAnimation)
            window.triggerCoinDropAnimation();
          triggerConfetti();
        } else if (res.outcome.type === "free_spin") {
          showToast("🍀 Free Spin added!", "success");
        } else if (res.outcome.type === "mystery_key") {
          showToast("📦 Mystery Box Key earned!", "info");
        } else {
          if (resultEl) resultEl.style.color = "#ff4444";
          showToast("🎲 Table cleared. Roll again!", "info");
        }

        updateUserState(res.user, res.coinsGained);
        handleChallengesCompleted(res.completedChallenges);
        handleTierUp(res);
      }, 600);
    }, 800);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML =
          '<span class="btn-dice-icon">🎲</span> ROLL 3D CASINO DICE';
      }
    }, 1600);
  }
}

/* ════════════════════════════════════════════════
   PICK A CARD — REAL-MONEY CASINO EXPERIENCE
════════════════════════════════════════════════ */
let cardBet = 100;
let cardsActive = true;

function playCardFlickSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(450, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {}
}

window.setCardBet = function (amount) {
  cardBet = Number(amount);
  document.querySelectorAll("#modal-cards .bet-chip").forEach((chip) => {
    if (Number(chip.dataset.amount) === Number(amount))
      chip.classList.add("active");
    else chip.classList.remove("active");
  });
};

function renderCasinoCardFace(cardEl, reward, isWin, isChosen) {
  if (!cardEl) return;
  const frontFace = cardEl.querySelector(".card-front-face");
  if (!frontFace) return;

  let rank = "10";
  let suit = "♠";
  let suitColor = "#ffffff";
  let badgeClass = "normal-card";
  let rewardText = reward.label || "WIN";

  if (reward.type === "jackpot") {
    rank = "A";
    suit = "♠";
    suitColor = "#ffd700";
    badgeClass = "gold-jackpot-card";
  } else if (reward.type === "win") {
    if (reward.multiplier >= 5) {
      rank = "A";
      suit = "♥";
      suitColor = "#ff4d4d";
      badgeClass = "crimson-ace-card";
    } else {
      rank = "K";
      suit = "♦";
      suitColor = "#ff4d4d";
      badgeClass = "king-card";
    }
  } else if (reward.type === "free_spin") {
    rank = "Q";
    suit = "♣";
    suitColor = "#00f0ff";
    badgeClass = "special-reward-card";
  } else if (reward.type === "double_next") {
    rank = "J";
    suit = "🔥";
    suitColor = "#ff6400";
    badgeClass = "special-reward-card";
  } else if (reward.type === "mystery_key") {
    rank = "K";
    suit = "🔑";
    suitColor = "#00f0ff";
    badgeClass = "special-reward-card";
  } else {
    rank = "7";
    suit = "♠";
    suitColor = "#8899ac";
    badgeClass = "loss-card";
  }

  frontFace.className = `card-front-face ${badgeClass}${isChosen ? " chosen-hero" : ""}${isWin ? " win-glow-hero" : ""}`;
  frontFace.innerHTML = `
        <div class="corner top-left"><span class="rank">${rank}</span><span class="suit" style="color:${suitColor}">${suit}</span></div>
        <div class="card-center-symbol" style="color:${suitColor}">${suit}</div>
        <div class="corner bottom-right"><span class="rank">${rank}</span><span class="suit" style="color:${suitColor}">${suit}</span></div>
        <div class="card-reward-label">${rewardText}</div>
    `;
}

function initPickCard() {
  document.querySelectorAll("#modal-cards .bet-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const amount = chip.dataset.amount;
      window.setCardBet(amount);
    });
  });

  document.querySelectorAll("#modal-cards .play-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (!cardsActive) return;
      const idx = Number(card.dataset.index);
      pickCard(idx);
    });
  });

  const resetBtn = document.getElementById("resetCardsBtn");
  if (resetBtn) resetBtn.addEventListener("click", resetCards);
  window.pickCard = pickCard;
  window.resetCards = resetCards;
}

async function pickCard(cardIndex) {
  if (typeof APP_STATE !== "undefined" && !APP_STATE.isAuthenticated) {
    showToast(
      "Please Register or Log In first to play Pick a Card!",
      "warning",
    );
    if (window.openAuthModal) window.openAuthModal("register");
    return;
  }

  if (!cardsActive) return;

  const wager = Number(cardBet) || 100;
  if (typeof APP_STATE !== "undefined" && APP_STATE.isTester) {
    executePickCard(cardIndex);
    return;
  }

  if (typeof window.promptDirectMpesaPayAndPlay === "function") {
    window.promptDirectMpesaPayAndPlay(wager, "pick_card", () => {
      executePickCard(cardIndex);
    });
  } else {
    executePickCard(cardIndex);
  }
}

async function executePickCard(cardIndex) {
  if (!cardsActive) return;
  cardsActive = false;

  const resultEl = document.getElementById("cardResult");
  const hintEl = document.getElementById("cardHint");
  const resetBtn = document.getElementById("resetCardsBtn");
  if (resultEl) resultEl.textContent = "";
  if (hintEl) hintEl.textContent = "🎲 Dealer is revealing cards...";

  const chosenCardEl = document.querySelector(
    `.play-card[data-index="${cardIndex}"]`,
  );
  if (chosenCardEl) {
    chosenCardEl.classList.add("anticipating");
    playCardFlickSound();
  }

  try {
    const res = await apiPost("/api/cards/deal", {
      userId: APP_STATE.userId,
      cardIndex,
      betAmount: cardBet,
    });

    if (!res.success) throw new Error(res.error || "Card deal failed");

    // Reveal chosen card first after anticipation pause
    setTimeout(() => {
      if (chosenCardEl) {
        chosenCardEl.classList.remove("anticipating");
        chosenCardEl.classList.add("flipped");
        renderCasinoCardFace(chosenCardEl, res.chosen, res.winAmount > 0, true);
        playCardFlickSound();
      }

      // Sequentially reveal all remaining unpicked cards
      res.cards.forEach((card, i) => {
        if (i === cardIndex) return;
        setTimeout(
          () => {
            const cardEl = document.querySelector(
              `.play-card[data-index="${i}"]`,
            );
            if (cardEl) {
              cardEl.classList.add("flipped");
              renderCasinoCardFace(
                cardEl,
                card,
                card.winAmount > 0 || card.multiplier > 0,
                false,
              );
              playCardFlickSound();
            }
          },
          180 * (i + 1),
        );
      });

      // Show final result
      setTimeout(() => {
        if (res.isTester || (typeof APP_STATE !== 'undefined' && APP_STATE.isTester)) {
          if (resultEl) {
            resultEl.textContent = `🏆 TESTER WIN! You won +${res.winAmount.toLocaleString()} Play Coins (${res.chosen.label || 'x175 WIN'})!`;
            resultEl.style.color = "#ffd700";
          }
          if (window.showTesterWinAnimation) window.showTesterWinAnimation(res.winAmount.toLocaleString() + ' PLAY COINS', res.chosen.label || '🃏 PICK A CARD WIN');
        } else if (res.winAmount > 0) {
          if (resultEl) {
            resultEl.textContent = `🏆 CASINO WIN! You won KSh ${res.winAmount.toLocaleString()}!`;
            resultEl.style.color = "#ffd700";
          }
          showWinModal(
            `KSh ${res.winAmount.toLocaleString()}`,
            res.chosen.label,
            res.xpGained,
          );
          if (window.triggerCoinDropAnimation)
            window.triggerCoinDropAnimation();
          triggerConfetti();
        } else if (res.chosen.type === "free_spin") {
          if (resultEl) {
            resultEl.textContent = "🎁 Free Spin Added!";
            resultEl.style.color = "#00f0ff";
          }
          showToast("🎁 Free Spin added to your account!", "success");
        } else if (res.chosen.type === "double_next") {
          if (resultEl) {
            resultEl.textContent = "🔥 Double Next Win Activated!";
            resultEl.style.color = "#ff6400";
          }
          showToast("🔥 Double Next Win activated!", "warning");
        } else if (res.chosen.type === "mystery_key") {
          if (resultEl) {
            resultEl.textContent = "📦 Mystery Box Key Earned!";
            resultEl.style.color = "#00f0ff";
          }
          showToast("📦 Mystery Key earned!", "info");
        } else {
          if (resultEl) {
            resultEl.textContent = "😔 Dealer took the hand. Try again!";
            resultEl.style.color = "#ff4444";
          }
        }

        if (hintEl) hintEl.style.display = "none";
        if (resetBtn) resetBtn.style.display = "inline-block";
        updateUserState(res.user, res.coinsGained);
        handleChallengesCompleted(res.completedChallenges);
        handleTierUp(res);
      }, 1200);
    }, 500);
  } catch (err) {
    if (chosenCardEl) chosenCardEl.classList.remove("anticipating");
    showToast(err.message, "error");
    cardsActive = true;
    if (hintEl)
      hintEl.textContent =
        "✨ Choose a card from the dealer's table to reveal your multiplier!";
  }
}

function resetCards() {
  cardsActive = true;
  const resultEl = document.getElementById("cardResult");
  const hintEl = document.getElementById("cardHint");
  const resetBtn = document.getElementById("resetCardsBtn");

  if (resultEl) resultEl.textContent = "";
  if (hintEl) {
    hintEl.style.display = "block";
    hintEl.textContent =
      "✨ Choose a card from the dealer's table to reveal your multiplier!";
  }
  if (resetBtn) resetBtn.style.display = "none";

  document.querySelectorAll("#modal-cards .play-card").forEach((card) => {
    card.className = "play-card";
    const frontFace = card.querySelector(".card-front-face");
    if (frontFace) frontFace.className = "card-front-face";
  });
  cardsActive = true;
}

/* ════════════════════════════════════════════════
   PRIZE LADDER
════════════════════════════════════════════════ */
let ladderSessionId = null;
let ladderBet = 500;
let ladderCurrentLevel = 0;
const LADDER_LEVELS = [
  { level: 1, label: "Level 1", multiplier: 0.2, riskPercent: 10 },
  { level: 2, label: "Level 2", multiplier: 0.5, riskPercent: 15 },
  { level: 3, label: "Level 3", multiplier: 1.0, riskPercent: 20 },
  { level: 4, label: "Level 4", multiplier: 2.0, riskPercent: 25 },
  { level: 5, label: "Level 5", multiplier: 5.0, riskPercent: 30 },
  { level: 6, label: "Level 6", multiplier: 10.0, riskPercent: 35 },
  { level: 7, label: "Level 7", multiplier: 20.0, riskPercent: 40 },
  { level: 8, label: "🏆 JACKPOT!", multiplier: 50.0, riskPercent: 0 },
];

function initPrizeLadder() {
  const container = document.getElementById("ladderLevels");
  if (!container) return;
  renderLadderLevels();

  document.querySelectorAll("#tab-ladder .bet-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document
        .querySelectorAll("#tab-ladder .bet-chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      ladderBet = Number(chip.dataset.amount);
    });
  });

  const startBtn = document.getElementById("startLadderBtn");
  const cashoutBtn = document.getElementById("cashoutLadderBtn");
  const continueBtn = document.getElementById("continueLadderBtn");

  if (startBtn) startBtn.addEventListener("click", startLadder);
  if (cashoutBtn) cashoutBtn.addEventListener("click", () => doLadderAction("cashout"));
  if (continueBtn) continueBtn.addEventListener("click", () => doLadderAction("continue"));
}

function renderLadderLevels(currentLevel = 0) {
  const container = document.getElementById("ladderLevels");
  if (!container) return;
  // Render reversed (top = highest)
  container.innerHTML = [...LADDER_LEVELS]
    .reverse()
    .map(
      (l) => `
        <div class="ladder-level ${l.level === currentLevel ? "current" : ""} ${l.level < currentLevel ? "passed" : ""} ${l.level === 8 ? "jackpot-level" : ""}" id="ladder-level-${l.level}">
            <span class="level-num">L${l.level}</span>
            <span class="level-label">${l.label}</span>
            <span class="level-mult">×${l.multiplier}</span>
            ${l.riskPercent > 0 ? `<span class="level-risk">⚠ ${l.riskPercent}% loss risk</span>` : '<span class="level-risk">🏆 JACKPOT</span>'}
        </div>
    `,
    )
    .join("");
}

async function startLadder() {
  const wager = Number(ladderBet) || 100;
  if (typeof APP_STATE !== "undefined" && APP_STATE.isTester) {
    executeStartLadder();
    return;
  }

  if (typeof window.promptDirectMpesaPayAndPlay === "function") {
    window.promptDirectMpesaPayAndPlay(wager, "prize_ladder", () => {
      executeStartLadder();
    });
  } else {
    executeStartLadder();
  }
}

async function executeStartLadder() {
  const btn = document.getElementById("startLadderBtn");
  btn.disabled = true;
  btn.textContent = "Starting...";

  try {
    const res = await apiPost("/api/ladder/start", {
      userId: APP_STATE.userId,
      betAmount: ladderBet,
    });
    if (!res.success) throw new Error(res.error || "Failed to start ladder");

    ladderSessionId = res.sessionId;
    ladderCurrentLevel = 1;

    renderLadderLevels(1);
    document.getElementById("startLadderBtn").style.display = "none";
    document.getElementById("ladderActionButtons").style.display = "flex";
    document.getElementById("ladderStatus").innerHTML = `
            <div>
                <div style="color:var(--gold);font-weight:700;font-size:16px">Level 1 — ×0.2</div>
                <div style="color:var(--text-muted);font-size:13px;margin-top:4px">
                    Current value: KSh ${(ladderBet * 0.2).toLocaleString()}<br>
                    Cash out or risk it for ×0.5!
                </div>
            </div>`;
    updateUserState(res.user, res.coinsGained);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "🪜 START LADDER";
  }
}

async function doLadderAction(action) {
  if (!ladderSessionId) return;

  const cashoutBtn = document.getElementById("cashoutLadderBtn");
  const continueBtn = document.getElementById("continueLadderBtn");
  cashoutBtn.disabled = true;
  continueBtn.disabled = true;

  try {
    const res = await apiPost("/api/ladder/action", {
      userId: APP_STATE.userId,
      sessionId: ladderSessionId,
      action,
    });

    if (!res.success) throw new Error(res.error || "Action failed");

    if (res.result === "win" || res.result === "cashout") {
      showToast(
        `💰 Cashed out KSh ${res.winAmount.toLocaleString()}!`,
        "success",
      );
      showWinModal(
        `KSh ${res.winAmount.toLocaleString()}`,
        `Level ${res.level} Cash Out`,
        0,
      );
      triggerConfetti();
      endLadderGame();
    } else if (res.result === "jackpot") {
      showToast("🏆 JACKPOT! You reached the top!", "success");
      showWinModal(
        `KSh ${res.winAmount.toLocaleString()}`,
        "×50 JACKPOT — TOP OF THE LADDER!",
        0,
      );
      triggerConfetti();
      triggerConfetti();
      endLadderGame();
    } else if (res.result === "loss") {
      document.getElementById("ladderStatus").innerHTML = `
                <div style="color:var(--red);font-size:16px;font-weight:700">
                    💥 YOU FELL! Game over at Level ${res.level}
                </div>`;
      showToast("💥 You lost everything! Better luck next time.", "error");
      endLadderGame(true);
    } else if (res.result === "advance") {
      ladderCurrentLevel = res.level;
      renderLadderLevels(res.level);
      const levelDef = LADDER_LEVELS[res.level - 1];
      document.getElementById("ladderStatus").innerHTML = `
                <div>
                    <div style="color:var(--gold);font-weight:700;font-size:16px">Level ${res.level} — ×${levelDef.multiplier}</div>
                    <div style="color:var(--text-muted);font-size:13px;margin-top:4px">
                        Current value: KSh ${(ladderBet * levelDef.multiplier).toLocaleString()}<br>
                        ${res.level < 8 ? `Cash out or risk ${levelDef.riskPercent}% to climb higher!` : "You are one step from the jackpot!"}
                    </div>
                </div>`;
      showToast(`🎉 Advanced to Level ${res.level}!`, "success");
    }

    updateUserState(res.user, res.coinsGained);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (cashoutBtn.isConnected) {
      cashoutBtn.disabled = false;
      continueBtn.disabled = false;
    }
  }
}

function endLadderGame(showRestart = false) {
  ladderSessionId = null;
  document.getElementById("ladderActionButtons").style.display = "none";
  const startBtn = document.getElementById("startLadderBtn");
  startBtn.style.display = "block";
  startBtn.textContent = "🪜 PLAY AGAIN";
  setTimeout(() => {
    renderLadderLevels(0);
  }, 2000);
}

/* ════════════════════════════════════════════════
   LUCKY 7
════════════════════════════════════════════════ */
// ════════════════════════════════════════════════════
// 🎰 LUCKY 7 — LUXURY 3-REEL CASINO SLOT MACHINE
// ════════════════════════════════════════════════════
let lucky7Bet = 100;
let lucky7Spinning = false;

function initLucky7() {
  document.querySelectorAll("#modal-lucky7 .bet-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document
        .querySelectorAll("#modal-lucky7 .bet-chip")
        .forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      lucky7Bet = Number(chip.dataset.amount);
      const betValEl = document.getElementById("lucky7BetVal");
      if (betValEl) betValEl.textContent = lucky7Bet.toLocaleString();
    });
  });
}

window.playLucky7Slot = async function () {
  if (lucky7Spinning) return;

  const wager = Number(lucky7Bet) || 100;
  if (typeof APP_STATE !== "undefined" && APP_STATE.isTester) {
    executeLucky7Slot();
    return;
  }

  if (typeof window.promptDirectMpesaPayAndPlay === "function") {
    window.promptDirectMpesaPayAndPlay(wager, "lucky7_slot", () => {
      executeLucky7Slot();
    });
  } else {
    executeLucky7Slot();
  }
};

async function executeLucky7Slot() {

  lucky7Spinning = true;
  const spinBtn = document.getElementById("spinLucky7Btn");
  const resultEl = document.getElementById("lucky7Result");
  if (spinBtn) {
    spinBtn.disabled = true;
    spinBtn.classList.add("lever-pulled");
  }
  if (resultEl) {
    resultEl.textContent = "🎰 REELS SPINNING... GOOD LUCK!";
    resultEl.style.color = "#ffd700";
  }

  playSlotSpinSound();

  const strip1 = document.getElementById("reelStrip1");
  const strip2 = document.getElementById("reelStrip2");
  const strip3 = document.getElementById("reelStrip3");
  const stage = document.getElementById("slotReelsStage");

  if (strip1) strip1.classList.add("spinning-blur");
  if (strip2) strip2.classList.add("spinning-blur");
  if (strip3) strip3.classList.add("spinning-blur");
  if (stage) stage.classList.add("cabinet-vibrating");

  try {
    const res = await apiPost("/api/lucky7/play", {
      userId: APP_STATE.userId,
      boxIndex: 0,
      betAmount: lucky7Bet,
    });

    if (!res.success) throw new Error(res.error || "Lucky 7 spin failed");

    let targetSymbols = ["🍒", "🔔", "BAR"];
    if (
      res.winAmount >= lucky7Bet * 25 ||
      (res.chosen && res.chosen.type === "jackpot")
    ) {
      targetSymbols = ["7️⃣", "7️⃣", "7️⃣"];
    } else if (res.winAmount >= lucky7Bet * 5) {
      targetSymbols = ["💎", "💎", "💎"];
    } else if (res.winAmount >= lucky7Bet * 2) {
      targetSymbols = ["BAR", "BAR", "BAR"];
    } else if (res.winAmount > 0) {
      targetSymbols = ["🍒", "🍒", "🔔"];
    } else if (res.chosen && res.chosen.type === "free_spin") {
      targetSymbols = ["⭐", "⭐", "🍀"];
    }

    setTimeout(() => {
      stopReel(strip1, targetSymbols[0]);
      playReelSnapSound();
    }, 1600);

    setTimeout(() => {
      stopReel(strip2, targetSymbols[1]);
      playReelSnapSound();
    }, 2200);

    setTimeout(() => {
      stopReel(strip3, targetSymbols[2]);
      playReelSnapSound();
      if (stage) stage.classList.remove("cabinet-vibrating");

      setTimeout(() => {
        if (spinBtn) {
          spinBtn.disabled = false;
          spinBtn.classList.remove("lever-pulled");
        }
        lucky7Spinning = false;

        if (res.winAmount > 0) {
          const isJackpot =
            targetSymbols[0] === "7️⃣" &&
            targetSymbols[1] === "7️⃣" &&
            targetSymbols[2] === "7️⃣";
          if (resultEl) {
            resultEl.textContent = isJackpot
              ? `👑 MEGA JACKPOT 777! WINS KSh ${res.winAmount.toLocaleString()}!`
              : `🏆 WINNER! LANDED ${targetSymbols.join(" ")} — KSh ${res.winAmount.toLocaleString()}`;
            resultEl.style.color = "#ffd700";
          }
          playWinCoinSound();
          triggerConfetti();
          showWinModal(
            `KSh ${res.winAmount.toLocaleString()}`,
            `${targetSymbols.join(" ")} Slot Win`,
            res.xpGained,
          );
        } else if (res.chosen && res.chosen.type === "free_spin") {
          if (resultEl) {
            resultEl.textContent = "🎁 FREE SPIN UNLOCKED!";
            resultEl.style.color = "#00f0ff";
          }
        } else {
          if (resultEl) {
            resultEl.textContent = `😔 ${targetSymbols.join(" ")} — No match. Try again!`;
            resultEl.style.color = "#ff6b6b";
          }
        }

        updateUserState(res.user, res.coinsGained);
        handleChallengesCompleted(res.completedChallenges);
        handleTierUp(res);
      }, 300);
    }, 2800);
  } catch (err) {
    showToast(err.message, "error");
    if (strip1) strip1.classList.remove("spinning-blur");
    if (strip2) strip2.classList.remove("spinning-blur");
    if (strip3) strip3.classList.remove("spinning-blur");
    if (stage) stage.classList.remove("cabinet-vibrating");
    if (spinBtn) {
      spinBtn.disabled = false;
      spinBtn.classList.remove("lever-pulled");
    }
    lucky7Spinning = false;
  }
};

function stopReel(stripEl, symbol) {
  if (!stripEl) return;
  stripEl.classList.remove("spinning-blur");
  stripEl.innerHTML = `
        <div class="slot-symbol symbol-prev">⭐</div>
        <div class="slot-symbol symbol-center landed-symbol">${symbol}</div>
        <div class="slot-symbol symbol-next">💎</div>
    `;
  stripEl.classList.add("reel-snap-anim");
  setTimeout(() => stripEl.classList.remove("reel-snap-anim"), 300);
}

function playSlotSpinSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

function playReelSnapSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
}

// Initialize all games and expose globally
window.openMysteryBox = openMysteryBox;
window.rollDice = rollDice;
window.pickCard = pickCard;
window.playLucky7 = function () {
  if (typeof window.playLucky7Slot === "function") {
    return window.playLucky7Slot();
  }
};

window.initAllGames = function () {
  initMysteryBox();
  initDiceRoll();
  initPickCard();
  initPrizeLadder();
  initLucky7();
};
