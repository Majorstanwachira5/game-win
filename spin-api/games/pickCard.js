/**
 * pickCard.js — Pick a Card Game Engine
 * 5 face-down cards, player picks one, all revealed
 */
const crypto = require('crypto');
const walletService = require('../services/WalletService');

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

function dealCards(cardIndex, betAmount, user) {
    const index = parseInt(cardIndex, 10);
    if (isNaN(index) || index < 0 || index > 4) {
        throw new Error('Invalid card index (must be 0-4)');
    }

    const bet = Number(betAmount);
    const MIN_BET = 100;
    const MAX_BET = 50000;
    if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
        throw new Error(`Invalid bet amount. Minimum bet is KSh ${MIN_BET}, maximum is KSh ${MAX_BET.toLocaleString()}.`);
    }

    const isTester = walletService.isTesterAccount(user);
    if (!walletService.validateBalance(user, bet, 'KSH')) {
        throw new Error('Insufficient balance for Pick a Card.');
    }

    // Debit stake server-side before dealing
    walletService.debitWallet(user, bet, 'KSH');

    // Generate all 5 cards server-side using crypto RNG
    let cards = Array.from({ length: 5 }, () => pickRandomReward());

    let chosen = cards[index];
    let winAmount = 0;
    let freeSpinsGranted = 0;
    let mysteryKeyGranted = false;
    let coinsGained = bet; // 1:1 PlayCoin wager reward

    if (isTester) {
        const testerMultiplier = 150 + Math.floor(Math.random() * 51);
        coinsGained = Math.round(bet * testerMultiplier);
        winAmount = coinsGained;
        walletService.creditWallet(user, coinsGained, 'PLAY', 'Pick a Card Tester Win');
        cards[index] = {
            id: 'tester_card_reward',
            label: `×${testerMultiplier} WINNER!`,
            type: 'win',
            multiplier: testerMultiplier,
            winAmount: coinsGained
        };
        chosen = cards[index];
    } else {
        walletService.creditWallet(user, coinsGained, 'PLAY', 'Pick a Card Bonus');

        if (chosen.type === 'win' || chosen.type === 'jackpot') {
            let mult = chosen.multiplier;
            if (user.doubleNextWin) {
                mult *= 2;
                user.doubleNextWin = false;
            }
            winAmount = Math.round((bet * mult) * 100) / 100;
            if (winAmount > 0) {
                walletService.creditWallet(user, winAmount, 'KSH', 'Pick a Card Win');
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
        cards,            // all 5 revealed
        cardIndex: index, // which one player picked
        chosen,           // the chosen card details
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

module.exports = { dealCards, CARD_REWARDS };
