/**
 * pickCard.js — Pick a Card Game Engine
 * 5 face-down cards, player picks one, all revealed
 */
const crypto = require('crypto');

const CARD_REWARDS = [
    { id: 'x0_2',       label: '×0.2',              type: 'win',        multiplier: 0.2,  weight: 25000 },
    { id: 'x0_5',       label: '×0.5',              type: 'win',        multiplier: 0.5,  weight: 20000 },
    { id: 'x1_0',       label: '×1',                type: 'win',        multiplier: 1.0,  weight: 18000 },
    { id: 'x2_0',       label: '×2',                type: 'win',        multiplier: 2.0,  weight: 12000 },
    { id: 'free_spin',  label: '🎁 Free Spin',      type: 'free_spin',  multiplier: 0,    weight: 10000 },
    { id: 'double_win', label: '🔥 Double Next Win', type: 'double_next', multiplier: 0,  weight: 8000  },
    { id: 'mystery_box',label: '📦 Mystery Box Key', type: 'mystery_key', multiplier: 0,  weight: 5000  },
    { id: 'jackpot',    label: '🏆 JACKPOT CARD!',  type: 'jackpot',    multiplier: 25.0, weight: 500   },
    { id: 'nothing',    label: 'Nothing 😔',        type: 'loss',       multiplier: 0,    weight: 1500  },
];

function cryptoRandom() {
    const buf = crypto.randomBytes(4);
    return buf.readUInt32BE(0) / 0xFFFFFFFF;
}

function pickRandomReward() {
    const total = CARD_REWARDS.reduce((s, r) => s + r.weight, 0);
    let roll = cryptoRandom() * total;
    for (const r of CARD_REWARDS) {
        if (roll < r.weight) return { ...r };
        roll -= r.weight;
    }
    return { ...CARD_REWARDS[0] };
}

/**
 * Generate 5 card rewards server-side
 * Player's chosen card is at index `cardIndex`
 */
function dealCards(cardIndex, betAmount, user) {
    if (cardIndex < 0 || cardIndex > 4) throw new Error('Invalid card index (0-4)');
    if (user.balance < betAmount) throw new Error('Insufficient balance');
    if (betAmount < 100) throw new Error('Minimum bet is KSh 100');

    user.balance -= betAmount;

    // Generate all 5 cards
    const cards = Array.from({ length: 5 }, () => pickRandomReward());

    // The chosen card determines the actual outcome
    const chosen = cards[cardIndex];
    let winAmount = 0;
    let freeSpinsGranted = 0;
    let mysteryKeyGranted = false;

    if (chosen.type === 'win' || chosen.type === 'jackpot') {
        let mult = chosen.multiplier;
        if (user.doubleNextWin) { mult *= 2; user.doubleNextWin = false; }
        winAmount = betAmount * mult;
        user.balance += winAmount;
    } else if (chosen.type === 'free_spin') {
        freeSpinsGranted = 1;
        user.freeSpins += 1;
    } else if (chosen.type === 'double_next') {
        user.doubleNextWin = true;
    } else if (chosen.type === 'mystery_key') {
        mysteryKeyGranted = true;
        user.mysteryKeys = (user.mysteryKeys || 0) + 1;
    }

    return {
        cards,            // all 5 revealed
        cardIndex,        // which one player picked
        chosen,           // the chosen card details
        winAmount,
        betAmount,
        freeSpinsGranted,
        mysteryKeyGranted,
        newBalance: user.balance
    };
}

module.exports = { dealCards, CARD_REWARDS };
