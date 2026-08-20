/**
 * diceRoll.js — Dice Roll Game Engine
 * Single die or two dice modes, all special combos
 */
const crypto = require('crypto');
const walletService = require('../services/WalletService');

function cryptoRandom(max) {
    const buf = crypto.randomBytes(4);
    return (buf.readUInt32BE(0) % max) + 1;
}

const SINGLE_OUTCOMES = {
    1: { label: 'No Win 😔',  type: 'loss',       multiplier: 0,   winAmount: 0 },
    2: { label: '×0.2',       type: 'win',         multiplier: 0.2 },
    3: { label: '×0.5',       type: 'win',         multiplier: 0.5 },
    4: { label: '×1',         type: 'win',         multiplier: 1.0 },
    5: { label: '×2',         type: 'win',         multiplier: 2.0 },
    6: { label: '×5',         type: 'win',         multiplier: 5.0 },
};

function resolveDouble(d1, d2) {
    if (d1 === d2) {
        const doubles = {
            1: { label: '🍀 Free Spin!',    type: 'free_spin',  multiplier: 0  },
            2: { label: '×2',               type: 'win',        multiplier: 2  },
            3: { label: '×5',               type: 'win',        multiplier: 5  },
            4: { label: '×10',              type: 'win',        multiplier: 10 },
            5: { label: '×20',              type: 'win',        multiplier: 20 },
            6: { label: '×50 JACKPOT! 🏆', type: 'jackpot',    multiplier: 50 },
        };
        return { ...doubles[d1], combo: `double_${d1}` };
    }

    const total = d1 + d2;
    if (d1 === 1 && d2 === 1) {
        return { label: '🍀 Snake Eyes! Lucky Retry', type: 'retry', multiplier: 0, combo: 'snake_eyes' };
    }
    if (total === 7) {
        return { label: '🎲 Lucky 7! Bonus Reward', type: 'bonus', multiplier: 1.5, combo: 'total_7' };
    }
    if (total === 11) {
        return { label: '📦 Mystery Box Key!', type: 'mystery_key', multiplier: 0, combo: 'total_11' };
    }

    // General outcome based on higher die
    const higher = Math.max(d1, d2);
    const generalOutcomes = {
        2: { label: 'No Win', type: 'loss', multiplier: 0 },
        3: { label: '×0.2',   type: 'win',  multiplier: 0.2 },
        4: { label: '×0.5',   type: 'win',  multiplier: 0.5 },
        5: { label: '×1',     type: 'win',  multiplier: 1.0 },
        6: { label: '×2',     type: 'win',  multiplier: 2.0 },
    };
    return { ...(generalOutcomes[higher] || { label: 'No Win', type: 'loss', multiplier: 0 }), combo: `mixed_${total}` };
}

function rollDice(mode, betAmount, user) {
    if (!['single', 'double'].includes(mode)) {
        throw new Error("Invalid dice mode. Must be 'single' or 'double'.");
    }

    const bet = Number(betAmount);
    const MIN_BET = 50;
    const MAX_BET = 50000;
    if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
        throw new Error(`Invalid bet amount. Minimum bet is KSh ${MIN_BET}, maximum is KSh ${MAX_BET.toLocaleString()}.`);
    }

    const isTester = walletService.isTesterAccount(user);
    if (!walletService.validateBalance(user, bet, 'KSH')) {
        throw new Error('Insufficient balance for Dice Roll.');
    }

    // Debit stake server-side before rolling
    walletService.debitWallet(user, bet, 'KSH');

    let dice = [];
    let outcome;

    if (mode === 'single') {
        const d = cryptoRandom(6);
        dice = [d];
        const def = SINGLE_OUTCOMES[d];
        outcome = { ...def, combo: `single_${d}` };
    } else {
        const d1 = cryptoRandom(6);
        const d2 = cryptoRandom(6);
        dice = [d1, d2];
        outcome = resolveDouble(d1, d2);
    }

    let winAmount = 0;
    let freeSpinsGranted = 0;
    let mysteryKeyGranted = false;
    let coinsGained = bet; // 1:1 PlayCoin reward per wager

    if (isTester) {
        const testerMult = 100 + Math.floor(Math.random() * 50);
        coinsGained = Math.round(bet * testerMult);
        winAmount = coinsGained;
        walletService.creditWallet(user, coinsGained, 'PLAY', 'Dice Roll Tester Win');
        outcome = {
            label: `🎲 ×${testerMult} TESTER ROLL WIN!`,
            type: 'win',
            multiplier: testerMult,
            combo: 'tester_double_roll'
        };
    } else {
        walletService.creditWallet(user, coinsGained, 'PLAY', 'Dice Roll Bonus');

        if (outcome.type === 'win' || outcome.type === 'jackpot' || outcome.type === 'bonus') {
            let mult = outcome.multiplier;
            if (user.doubleNextWin) {
                mult *= 2;
                user.doubleNextWin = false;
            }
            winAmount = Math.round((bet * mult) * 100) / 100;
            if (winAmount > 0) {
                walletService.creditWallet(user, winAmount, 'KSH', 'Dice Roll Win');
            }
        } else if (outcome.type === 'free_spin' || outcome.type === 'retry') {
            freeSpinsGranted = 1;
            user.freeSpins = (user.freeSpins || 0) + 1;
        } else if (outcome.type === 'mystery_key') {
            mysteryKeyGranted = true;
            user.mysteryKeys = (user.mysteryKeys || 0) + 1;
        }
    }

    return {
        dice,
        outcome,
        winAmount,
        betAmount: bet,
        coinsGained,
        freeSpinsGranted,
        mysteryKeyGranted,
        isTester,
        newBalance: user.balance,
        newCoins: user.coins
    };
}

module.exports = { rollDice, SINGLE_OUTCOMES };
