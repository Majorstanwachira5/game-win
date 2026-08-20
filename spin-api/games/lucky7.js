/**
 * lucky7.js — Lucky 7 Game Engine
 * 7 randomized boxes / 3-reel slot outcomes, player picks one, all revealed
 */
const crypto = require('crypto');
const walletService = require('../services/WalletService');

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

function playLucky7(boxIndex, betAmount, user) {
    const index = parseInt(boxIndex, 10);
    if (isNaN(index) || index < 0 || index > 6) {
        throw new Error('Invalid box index (must be 0-6)');
    }

    const bet = Number(betAmount);
    const MIN_BET = 100;
    const MAX_BET = 50000;
    if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
        throw new Error(`Invalid bet amount. Minimum bet is KSh ${MIN_BET}, maximum is KSh ${MAX_BET.toLocaleString()}.`);
    }

    const isTester = walletService.isTesterAccount(user);
    if (!walletService.validateBalance(user, bet, 'KSH')) {
        throw new Error('Insufficient balance for Lucky 7.');
    }

    // Debit stake server-side before rolling
    walletService.debitWallet(user, bet, 'KSH');

    // Generate exactly 7 box rewards server-side
    let boxes = Array.from({ length: 7 }, () => pickReward());

    let chosen = boxes[index];
    let winAmount = 0;
    let freeSpinsGranted = 0;
    let mysteryKeyGranted = false;
    let coinsGained = bet; // 1:1 PlayCoin wager reward

    if (isTester) {
        const testerMult = 150 + Math.floor(Math.random() * 101);
        coinsGained = Math.round(bet * testerMult);
        winAmount = coinsGained;
        walletService.creditWallet(user, coinsGained, 'PLAY', 'Lucky 7 Tester Win');
        boxes[index] = {
            id: 'tester_lucky7_win',
            label: `×${testerMult} MEGA WIN!`,
            type: 'win',
            multiplier: testerMult,
            winAmount: coinsGained
        };
        chosen = boxes[index];
    } else {
        walletService.creditWallet(user, coinsGained, 'PLAY', 'Lucky 7 Bonus');

        if (chosen.type === 'win' || chosen.type === 'jackpot') {
            let mult = chosen.multiplier;
            if (user.doubleNextWin) {
                mult *= 2;
                user.doubleNextWin = false;
            }
            winAmount = Math.round((bet * mult) * 100) / 100;
            if (winAmount > 0) {
                walletService.creditWallet(user, winAmount, 'KSH', 'Lucky 7 Win');
            }
        } else if (chosen.type === 'free_spin') {
            freeSpinsGranted = 1;
            user.freeSpins = (user.freeSpins || 0) + 1;
        } else if (chosen.type === 'double_next') {
            user.doubleNextWin = true;
        } else if (chosen.type === 'mystery_key') {
            mysteryKeyGranted = true;
            user.mysteryKeys = (user.mysteryKeys || 0) + 1;
        }
    }

    return {
        boxes,          // all 7 revealed contents
        boxIndex: index, // which one player picked
        chosen,
        winAmount,
        coinsGained,
        betAmount: bet,
        freeSpinsGranted,
        mysteryKeyGranted,
        isTester,
        newBalance: user.balance,
        newCoins: user.coins
    };
}

module.exports = { playLucky7, BOX_REWARD_POOL };
