/**
 * challenges.js — Daily / Weekly / Monthly Challenge Definitions
 * All progress is tracked server-side in userProfiles
 */

const CHALLENGE_DEFS = {
    daily: [
        {
            id: 'daily_login',
            label: 'Daily Login',
            description: 'Log in once today',
            icon: '📅',
            target: 1,
            trackKey: 'logins',
            reward: { type: 'free_spin', amount: 1, label: '1 Free Spin' }
        },
        {
            id: 'daily_spin3',
            label: 'Spin 3 Times',
            description: 'Spin the wheel 3 times',
            icon: '🎡',
            target: 3,
            trackKey: 'spins',
            reward: { type: 'coins', amount: 200, label: 'KSh 200 Bonus' }
        },
        {
            id: 'daily_mystery_box',
            label: 'Open a Mystery Box',
            description: 'Open 1 Mystery Box of any tier',
            icon: '🎁',
            target: 1,
            trackKey: 'mystery_boxes',
            reward: { type: 'free_spin', amount: 1, label: '1 Free Spin' }
        },
        {
            id: 'daily_dice',
            label: 'Play Dice Roll',
            description: 'Play Dice Roll once',
            icon: '🎲',
            target: 1,
            trackKey: 'dice_rolls',
            reward: { type: 'coins', amount: 100, label: 'KSh 100 Bonus' }
        },
        {
            id: 'daily_win',
            label: 'Win Any Reward',
            description: 'Win any prize from any game',
            icon: '🏆',
            target: 1,
            trackKey: 'wins',
            reward: { type: 'mystery_key', amount: 1, label: 'Mystery Box Key' }
        },
        {
            id: 'daily_refer',
            label: 'Refer a Friend',
            description: 'Share your referral link with 1 friend',
            icon: '👥',
            target: 1,
            trackKey: 'referrals',
            reward: { type: 'coins', amount: 500, label: 'KSh 500 Bonus' }
        },
    ],
    weekly: [
        {
            id: 'weekly_login7',
            label: 'Login 7 Days',
            description: 'Log in every day this week',
            icon: '🗓️',
            target: 7,
            trackKey: 'logins',
            reward: { type: 'gold_box', amount: 1, label: 'Gold Mystery Box' }
        },
        {
            id: 'weekly_spin30',
            label: 'Spin 30 Times',
            description: 'Spin the wheel 30 times this week',
            icon: '🎡',
            target: 30,
            trackKey: 'spins',
            reward: { type: 'jackpot_ticket', amount: 1, label: 'Jackpot Ticket' }
        },
        {
            id: 'weekly_win10',
            label: 'Win 10 Prizes',
            description: 'Win 10 prizes across any game',
            icon: '🏅',
            target: 10,
            trackKey: 'wins',
            reward: { type: 'premium_spin', amount: 1, label: 'Premium Spin' }
        },
        {
            id: 'weekly_refer5',
            label: 'Refer 5 Friends',
            description: 'Refer 5 new players this week',
            icon: '👥',
            target: 5,
            trackKey: 'referrals',
            reward: { type: 'jackpot_ticket', amount: 1, label: 'Jackpot Ticket' }
        },
    ],
    monthly: [
        {
            id: 'monthly_login25',
            label: 'Login 25 Days',
            description: 'Log in 25 days this month',
            icon: '📆',
            target: 25,
            trackKey: 'logins',
            reward: { type: 'platinum_box', amount: 1, label: 'Platinum Mystery Box' }
        },
        {
            id: 'monthly_refer20',
            label: 'Refer 20 Friends',
            description: 'Refer 20 new players this month',
            icon: '🌟',
            target: 20,
            trackKey: 'referrals',
            reward: { type: 'mega_jackpot', amount: 1, label: 'Mega Jackpot Entry' }
        },
        {
            id: 'monthly_vip',
            label: 'Reach VIP Status',
            description: 'Achieve Gold VIP or higher',
            icon: '👑',
            target: 1,
            trackKey: 'vip_gold_reached',
            reward: { type: 'vip_badge', amount: 1, label: 'Exclusive VIP Badge' }
        },
    ]
};

/**
 * Build a fresh challenge progress snapshot for a user
 */
function initChallengeProgress() {
    const progress = { daily: {}, weekly: {}, monthly: {} };
    for (const period of ['daily', 'weekly', 'monthly']) {
        for (const ch of CHALLENGE_DEFS[period]) {
            progress[period][ch.id] = { count: 0, completed: false, rewardClaimed: false };
        }
    }
    return progress;
}

/**
 * Increment a challenge counter for a user
 */
function incrementChallenge(userChallenges, period, trackKey, amount = 1) {
    if (!CHALLENGE_DEFS[period]) return [];
    const completedNow = [];
    for (const ch of CHALLENGE_DEFS[period]) {
        if (ch.trackKey !== trackKey) continue;
        const prog = userChallenges[period][ch.id];
        if (prog.completed) continue;
        prog.count += amount;
        if (prog.count >= ch.target) {
            prog.count = ch.target;
            prog.completed = true;
            completedNow.push({ ...ch });
        }
    }
    return completedNow;
}

/**
 * Check if resets are needed (daily/weekly/monthly boundaries)
 */
function checkAndResetChallenges(user) {
    const now = new Date();
    if (!user.challengeResets) {
        user.challengeResets = { daily: null, weekly: null, monthly: null };
    }

    // Daily reset
    const todayStr = now.toISOString().slice(0, 10);
    if (user.challengeResets.daily !== todayStr) {
        user.challengeResets.daily = todayStr;
        for (const ch of CHALLENGE_DEFS.daily) {
            user.challenges.daily[ch.id] = { count: 0, completed: false, rewardClaimed: false };
        }
    }

    // Weekly reset (Sunday = 0)
    const weekStart = getWeekStart(now);
    if (user.challengeResets.weekly !== weekStart) {
        user.challengeResets.weekly = weekStart;
        for (const ch of CHALLENGE_DEFS.weekly) {
            user.challenges.weekly[ch.id] = { count: 0, completed: false, rewardClaimed: false };
        }
    }

    // Monthly reset
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (user.challengeResets.monthly !== monthStr) {
        user.challengeResets.monthly = monthStr;
        for (const ch of CHALLENGE_DEFS.monthly) {
            user.challenges.monthly[ch.id] = { count: 0, completed: false, rewardClaimed: false };
        }
    }
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
}

module.exports = { CHALLENGE_DEFS, initChallengeProgress, incrementChallenge, checkAndResetChallenges };
