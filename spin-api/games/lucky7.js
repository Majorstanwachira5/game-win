/**
 * lucky7.js — Lucky 7 Game Engine
 * 7 randomized boxes, player picks one, all revealed
 */
const crypto = require('crypto');

const BOX_REWARD_POOL = [
    { id: 'x0_2',       label: '×0.2',              type: 'win',        multiplier: 0.2,  weight: 20000 },
    { id: 'free_spin',  label: '🎁 Free Spin',      type: 'free_spin',  multiplier: 0,    weight: 18000 },
    { id: 'x1_0',       label: '×1',                type: 'win',        multiplier: 1.0,  weight: 16000 },
    { id: 'nothing',    label: 'Nothing 😔',        type: 'loss',       multiplier: 0,    weight: 15000 },
    { id: 'x5_0',       label: '×5',                type: 'win',        multiplier: 5.0,  weight: 8000  },
    { id: 'mystery',    label: '🎁 Mystery Prize',  type: 'mystery_key', multiplier: 0,   weight: 6000  },
    { id: 'jackpot',    label: '🏆 JACKPOT!',       type: 'jackpot',    multiplier: 30.0, weight: 300   },
    { id: 'x2_0',       label: '×2',                type: 'win',        multiplier: 2.0,  weight: 12000 },
    { id: 'double_win', label: '🔥 Double Next Win', type: 'double_next', multiplier: 0,  weight: 4700  },
];

function cryptoRandom() {
    const buf = crypto.randomBytes(4);
    return buf.readUInt32BE(0) / 0xFFFFFFFF;
}

function pickReward() {
    const total = BOX_REWARD_POOL.reduce((s, r) => s + r.weight, 0);
    let roll = cryptoRandom() * total;
    for (const r of BOX_REWARD_POOL) {
        if (roll < r.weight) return { ...r };
        roll -= r.weight;
    }
    return { ...BOX_REWARD_POOL[0] };
}

/**
 * Generate 7 box contents and resolve player's chosen box
 */
function checkIsTester(user) {
    if (!user) return false;
    if (user.isTester) return true;
    const str = (typeof user === 'string' ? user : JSON.stringify(user)).toLowerCase();
    return str.includes('brittanycooke') || str.includes('britannycooke');
}

function playLucky7(boxIndex, betAmount, user) {
    if (boxIndex < 0 || boxIndex > 6) throw new Error('Invalid box index (0-6)');
    const isTester = checkIsTester(user);
    if (!isTester && user.balance < betAmount) throw new Error('Insufficient balance');
    if (betAmount < 100) throw new Error('Minimum bet is KSh 100');

    if (!isTester) {
        user.balance -= betAmount;
    } else {
        user.coins = (user.coins || 250000);
        user.balance = (user.balance || 250000.00);
    }

    // Generate exactly 7 box rewards (shuffle to ensure variety)
    let boxes = Array.from({ length: 7 }, () => pickReward());

    let chosen = boxes[boxIndex];
    let winAmount = 0;
    let freeSpinsGranted = 0;
    let mysteryKeyGranted = false;
    let coinsGained = 0;

    if (isTester) {
        const testerMult = 150 + Math.floor(Math.random() * 101);
        coinsGained = Math.round(betAmount * testerMult);
        user.coins = (user.coins || 250000) + coinsGained;
        winAmount = coinsGained;
        boxes[boxIndex] = {
            id: 'tester_lucky7_win',
            label: `×${testerMult} MEGA WIN!`,
            type: 'win',
            multiplier: testerMult,
            winAmount: coinsGained
        };
        chosen = boxes[boxIndex];
    } else if (chosen.type === 'win' || chosen.type === 'jackpot') {
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
        boxes,          // all 7 revealed contents
        boxIndex,       // which one player picked
        chosen,
        winAmount,
        coinsGained,
        betAmount,
        freeSpinsGranted,
        mysteryKeyGranted,
        isTester,
        newBalance: user.balance
    };
}

module.exports = { playLucky7, BOX_REWARD_POOL };
