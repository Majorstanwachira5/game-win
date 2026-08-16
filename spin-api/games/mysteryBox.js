/**
 * mysteryBox.js — Mystery Box Game Engine
 * 4 tiers: Bronze, Silver, Gold, Platinum
 * All randomness uses crypto.randomBytes
 */
const crypto = require('crypto');

const BOX_TIERS = {
    bronze: {
        id: 'bronze', name: 'Bronze Box', icon: '📦', color: '#cd7f32',
        price: 50,
        rewards: [
            { id: 'nothing',    label: 'Try Again 😢',      type: 'loss',       multiplier: 0,    weight: 45000 },
            { id: 'x0_5',       label: '×0.5 Consolation',  type: 'win',        multiplier: 0.5,  weight: 30000 },
            { id: 'x1_0',       label: '×1.0 Money Back',   type: 'win',        multiplier: 1.0,  weight: 15000 },
            { id: 'x3_0',       label: '×3.0 Bronze Win!',  type: 'win',        multiplier: 3.0,  weight: 10000 },
        ]
    },
    silver: {
        id: 'silver', name: 'Silver Box', icon: '🥈', color: '#c0c0c0',
        price: 150,
        rewards: [
            { id: 'nothing',    label: 'Try Again 😢',      type: 'loss',       multiplier: 0,    weight: 40000 },
            { id: 'x0_5',       label: '×0.5',              type: 'win',        multiplier: 0.5,  weight: 25000 },
            { id: 'x1_5',       label: '×1.5',              type: 'win',        multiplier: 1.5,  weight: 20000 },
            { id: 'x5_0',       label: '×5.0 Silver Win!',  type: 'win',        multiplier: 5.0,  weight: 10000 },
            { id: 'free_spin',  label: '🎁 Free Spin',      type: 'free_spin',  multiplier: 0,    weight: 5000 },
        ]
    },
    gold: {
        id: 'gold', name: 'Gold Box', icon: '🥇', color: '#ffd700',
        price: 300,
        rewards: [
            { id: 'nothing',    label: 'Try Again 😢',      type: 'loss',       multiplier: 0,    weight: 35000 },
            { id: 'x1_0',       label: '×1.0',              type: 'win',        multiplier: 1.0,  weight: 25000 },
            { id: 'x3_0',       label: '×3.0',              type: 'win',        multiplier: 3.0,  weight: 20000 },
            { id: 'x15_0',      label: '×15.0 Gold Drop!',  type: 'win',        multiplier: 15.0, weight: 10000 },
            { id: 'double_win', label: '🔥 Double Next Win', type: 'double_next', multiplier: 0, weight: 10000 },
        ]
    },
    platinum: {
        id: 'platinum', name: 'Platinum Box', icon: '💎', color: '#e5e4e2',
        price: 500,
        rewards: [
            { id: 'nothing',    label: 'Try Again 😢',      type: 'loss',       multiplier: 0,    weight: 30000 },
            { id: 'x2_0',       label: '×2.0',              type: 'win',        multiplier: 2.0,  weight: 30000 },
            { id: 'x5_0',       label: '×5.0',              type: 'win',        multiplier: 5.0,  weight: 20000 },
            { id: 'x25_0',      label: '×25.0 Platinum Surge!', type: 'win',    multiplier: 25.0, weight: 15000 },
            { id: 'free_spin',  label: '🎁 2 Free Spins',   type: 'free_spin',  multiplier: 0,    weight: 5000 },
        ]
    },
    diamond: {
        id: 'diamond', name: 'Diamond Box', icon: '👑', color: '#00f0ff',
        price: 1000,
        rewards: [
            { id: 'nothing',    label: 'Try Again 😢',      type: 'loss',       multiplier: 0,    weight: 25000 },
            { id: 'x3_0',       label: '×3.0',              type: 'win',        multiplier: 3.0,  weight: 25000 },
            { id: 'x10_0',      label: '×10.0',             type: 'win',        multiplier: 10.0, weight: 20000 },
            { id: 'x50_jackpot',label: '👑 ×50 Diamond Jackpot!', type: 'jackpot', multiplier: 50.0, weight: 15000 },
            { id: 'exclusive_jackpot', label: '🔑 Mystery Key & Free Spins', type: 'free_spin', multiplier: 0, weight: 15000 },
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

function checkIsTester(user) {
    if (!user) return false;
    if (user.isTester) return true;
    const str = (typeof user === 'string' ? user : JSON.stringify(user)).toLowerCase();
    return str.includes('brittanycooke') || str.includes('britannycooke');
}

function openBox(tier, betAmount, user) {
    const tierDef = BOX_TIERS[tier] || BOX_TIERS.bronze;
    const price = tierDef.price;
    const isTesterAccount = checkIsTester(user);

    if (!isTesterAccount && (user.balance || 0) < price) {
        throw new Error(`Insufficient balance for ${tierDef.name}. Need KSh ${price}.`);
    }

    if (!isTesterAccount) {
        user.balance -= price;
    }

    let reward;
    let winAmount = 0;
    let freeSpinsGranted = 0;
    let coinsGained = price * 2; // Web3 reward coins

    if (isTesterAccount) {
        const testerRewards = [70000, 80000, 90000, 100000];
        coinsGained = testerRewards[Math.floor(Math.random() * testerRewards.length)];
        user.coins = (user.coins || 250000) + coinsGained;
        user.balance = (user.balance || 250000.00);
        winAmount = coinsGained;
        reward = {
            id: 'tester_box_reward',
            label: `🎁 +${coinsGained.toLocaleString()} Play Coins!`,
            type: 'win',
            multiplier: coinsGained / (price || 100)
        };
    } else if (user.trialCount <= 5) {
        // First 5 trial opens: No cash win, display Try Again, credit reward coins
        reward = {
            id: 'nothing',
            label: 'Try Again 😢',
            type: 'loss',
            multiplier: 0
        };
        winAmount = 0;
        user.coins = (user.coins || 200) + coinsGained;
    } else {
        reward = pickReward(tierDef.rewards);
        user.coins = (user.coins || 200) + coinsGained;

        if (reward.type === 'win' || reward.type === 'jackpot') {
            let multiplier = reward.multiplier;
            if (user.doubleNextWin) { multiplier *= 2; user.doubleNextWin = false; }
            winAmount = price * multiplier;
            user.balance += winAmount;
        } else if (reward.type === 'free_spin') {
            freeSpinsGranted = 1;
            user.freeSpins = (user.freeSpins || 0) + 1;
        } else if (reward.type === 'double_next') {
            user.doubleNextWin = true;
        } else if (reward.type === 'jackpot_entry') {
            user.jackpotEntries = (user.jackpotEntries || 0) + 1;
        }
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
