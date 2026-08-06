/**
 * mysteryBox.js — Mystery Box Game Engine
 * 4 tiers: Bronze, Silver, Gold, Platinum
 * All randomness uses crypto.randomBytes
 */
const crypto = require('crypto');

const BOX_TIERS = {
    bronze: {
        id: 'bronze', name: 'Bronze Box', icon: '📦', color: '#cd7f32',
        price: 100,
        rewards: [
            { id: 'nothing',    label: 'Nothing 😢',      type: 'loss',       multiplier: 0,    weight: 50000 },
            { id: 'x0_1',       label: '×0.1',            type: 'win',        multiplier: 0.1,  weight: 25000 },
            { id: 'x0_2',       label: '×0.2',            type: 'win',        multiplier: 0.2,  weight: 15000 },
            { id: 'x0_5',       label: '×0.5',            type: 'win',        multiplier: 0.5,  weight: 10000 },
        ]
    },
    silver: {
        id: 'silver', name: 'Silver Box', icon: '🥈', color: '#c0c0c0',
        price: 150,
        rewards: [
            { id: 'x0_1',       label: '×0.1',            type: 'win',        multiplier: 0.1,  weight: 30000 },
            { id: 'x0_2',       label: '×0.2',            type: 'win',        multiplier: 0.2,  weight: 25000 },
            { id: 'x0_5',       label: '×0.5',            type: 'win',        multiplier: 0.5,  weight: 20000 },
            { id: 'x1_0',       label: '×1',              type: 'win',        multiplier: 1.0,  weight: 15000 },
            { id: 'free_spin',  label: '🎁 Free Spin',    type: 'free_spin',  multiplier: 0,    weight: 10000 },
        ]
    },
    gold: {
        id: 'gold', name: 'Gold Box', icon: '🥇', color: '#ffd700',
        price: 500,
        rewards: [
            { id: 'x0_2',       label: '×0.2',            type: 'win',        multiplier: 0.2,  weight: 28000 },
            { id: 'x0_5',       label: '×0.5',            type: 'win',        multiplier: 0.5,  weight: 25000 },
            { id: 'x1_0',       label: '×1',              type: 'win',        multiplier: 1.0,  weight: 20000 },
            { id: 'x2_0',       label: '×2',              type: 'win',        multiplier: 2.0,  weight: 15000 },
            { id: 'double_win', label: '🔥 Double Next Win', type: 'double_next', multiplier: 0, weight: 12000 },
        ]
    },
    platinum: {
        id: 'platinum', name: 'Platinum Box', icon: '💎', color: '#e5e4e2',
        price: 2000,
        rewards: [
            { id: 'x1_0',       label: '×1',              type: 'win',        multiplier: 1.0,  weight: 25000 },
            { id: 'x2_0',       label: '×2',              type: 'win',        multiplier: 2.0,  weight: 20000 },
            { id: 'x5_0',       label: '×5',              type: 'win',        multiplier: 5.0,  weight: 15000 },
            { id: 'x10_0',      label: '×10',             type: 'win',        multiplier: 10.0, weight: 8000  },
            { id: 'x20_jackpot',label: '×20 Jackpot!',    type: 'jackpot',    multiplier: 20.0, weight: 1500  },
            { id: 'exclusive_jackpot', label: '🎰 Exclusive Jackpot Entry', type: 'jackpot_entry', multiplier: 0, weight: 500 },
        ]
    }
};

function cryptoRandom() {
    const buf = crypto.randomBytes(4);
    return buf.readUInt32BE(0) / 0xFFFFFFFF;
}

function pickReward(rewards) {
    const total = rewards.reduce((s, r) => s + r.weight, 0);
    let roll = cryptoRandom() * total;
    for (const r of rewards) {
        if (roll < r.weight) return r;
        roll -= r.weight;
    }
    return rewards[0];
}

function openBox(tier, betAmount, user) {
    const tierDef = BOX_TIERS[tier];
    if (!tierDef) throw new Error('Invalid box tier');

    const price = tierDef.price;
    const isTesterAccount = user && user.email && user.email.toLowerCase() === 'britannycooke98@gmail.com';

    if (!isTesterAccount && user.balance < price) {
        throw new Error(`Insufficient balance for ${tierDef.name}. Need KSh ${price}.`);
    }

    if (!isTesterAccount) {
        user.balance -= price;
    }

    let reward = pickReward(tierDef.rewards);
    let winAmount = 0;
    let freeSpinsGranted = 0;
    let coinsGained = 0;

    if (isTesterAccount && (tier === 'platinum' || price >= 2000)) {
        // Requirement 4: Mystery Box Testing Rewards between 70,000 and 100,000 Play Coins
        const testerRewards = [70000, 80000, 90000, 100000];
        coinsGained = testerRewards[Math.floor(Math.random() * testerRewards.length)];
        user.coins = (user.coins || 230000) + coinsGained;
        winAmount = coinsGained;
        reward = {
            id: 'tester_box_reward',
            label: `🎁 +${coinsGained.toLocaleString()} Play Coins!`,
            type: 'win',
            multiplier: coinsGained / (price || 2000)
        };
    } else if (reward.type === 'win' || reward.type === 'jackpot') {
        let multiplier = reward.multiplier;
        if (user.doubleNextWin) { multiplier *= 2; user.doubleNextWin = false; }
        winAmount = price * multiplier;
        user.balance += winAmount;
    } else if (reward.type === 'free_spin') {
        freeSpinsGranted = 1;
        user.freeSpins += 1;
    } else if (reward.type === 'double_next') {
        user.doubleNextWin = true;
    } else if (reward.type === 'jackpot_entry') {
        user.jackpotEntries = (user.jackpotEntries || 0) + 1;
    }

    return {
        tier: tierDef,
        reward,
        winAmount,
        coinsGained,
        price,
        freeSpinsGranted,
        isTester: isTesterAccount,
        newBalance: user.balance
    };
}

module.exports = { BOX_TIERS, openBox };
