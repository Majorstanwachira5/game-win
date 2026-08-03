/**
 * vip.js — VIP Tier System
 * XP thresholds, perks, and tier management
 */

const VIP_TIERS = [
    {
        id: 'bronze',
        name: 'Bronze',
        icon: '🥉',
        minXP: 0,
        maxXP: 999,
        color: '#cd7f32',
        perks: [
            'Access to all standard games',
            '1 daily free spin',
            'Standard jackpot entries'
        ]
    },
    {
        id: 'silver',
        name: 'Silver',
        icon: '🥈',
        minXP: 1000,
        maxXP: 4999,
        color: '#c0c0c0',
        perks: [
            'All Bronze perks',
            '2 daily free spins',
            'Priority customer support',
            '5% bonus on all wins'
        ]
    },
    {
        id: 'gold',
        name: 'Gold',
        icon: '🥇',
        minXP: 5000,
        maxXP: 19999,
        color: '#ffd700',
        perks: [
            'All Silver perks',
            '3 daily free spins',
            '1 free Silver Mystery Box/week',
            '10% bonus on all wins',
            'Exclusive Gold jackpot draws'
        ]
    },
    {
        id: 'platinum',
        name: 'Platinum',
        icon: '💎',
        minXP: 20000,
        maxXP: 99999,
        color: '#e5e4e2',
        perks: [
            'All Gold perks',
            '5 daily free spins',
            '1 free Gold Mystery Box/week',
            '15% bonus on all wins',
            'Exclusive Platinum jackpot entries',
            'Special event access'
        ]
    },
    {
        id: 'diamond',
        name: 'Diamond',
        icon: '👑',
        minXP: 100000,
        maxXP: Infinity,
        color: '#00d2ff',
        perks: [
            'All Platinum perks',
            '10 daily free spins',
            '1 free Platinum Mystery Box/week',
            '25% bonus on all wins',
            'Exclusive Diamond jackpot draws',
            'VIP-only games & events',
            'Personal account manager'
        ]
    }
];

/** XP earned per action */
const XP_RATES = {
    spin: 10,
    mystery_box_bronze: 5,
    mystery_box_silver: 15,
    mystery_box_gold: 30,
    mystery_box_platinum: 80,
    dice_roll: 8,
    pick_card: 8,
    prize_ladder: 12,
    lucky7: 10,
    deposit_100: 5,         // 5 XP per 100 KSh deposited
    referral: 200,
    daily_challenge: 50,
    weekly_challenge: 200,
    monthly_challenge: 500,
};

function getTierForXP(xp) {
    for (let i = VIP_TIERS.length - 1; i >= 0; i--) {
        if (xp >= VIP_TIERS[i].minXP) return VIP_TIERS[i];
    }
    return VIP_TIERS[0];
}

function addXP(user, action, amount = 1) {
    const rate = XP_RATES[action] || 0;
    const gained = rate * amount;
    const oldTier = getTierForXP(user.xp || 0);
    user.xp = (user.xp || 0) + gained;
    const newTier = getTierForXP(user.xp);
    const tierUp = oldTier.id !== newTier.id;
    user.vipTier = newTier.id;
    return { gained, oldTier, newTier, tierUp };
}

function getDailyFreeSpins(tierId) {
    const tier = VIP_TIERS.find(t => t.id === tierId) || VIP_TIERS[0];
    const spinMap = { bronze: 1, silver: 2, gold: 3, platinum: 5, diamond: 10 };
    return spinMap[tier.id] || 1;
}

module.exports = { VIP_TIERS, XP_RATES, getTierForXP, addXP, getDailyFreeSpins };
