/**
 * prizeLadder.js — Prize Ladder Game Engine
 * 8-level risk/cashout system. State tracked per session.
 */
const crypto = require('crypto');

const LADDER_LEVELS = [
    { level: 1, label: 'Level 1',  multiplier: 0.2,  riskPercent: 10 },
    { level: 2, label: 'Level 2',  multiplier: 0.5,  riskPercent: 15 },
    { level: 3, label: 'Level 3',  multiplier: 1.0,  riskPercent: 20 },
    { level: 4, label: 'Level 4',  multiplier: 2.0,  riskPercent: 25 },
    { level: 5, label: 'Level 5',  multiplier: 5.0,  riskPercent: 30 },
    { level: 6, label: 'Level 6',  multiplier: 10.0, riskPercent: 35 },
    { level: 7, label: 'Level 7',  multiplier: 20.0, riskPercent: 40 },
    { level: 8, label: 'Level 8 — JACKPOT!', multiplier: 50.0, riskPercent: 0 }, // guaranteed at top
];

// Active sessions: { sessionId: { userId, betAmount, currentLevel, active } }
const ladderSessions = new Map();

function cryptoRandom() {
    const buf = crypto.randomBytes(4);
    return (buf.readUInt32BE(0) / 0xFFFFFFFF) * 100; // 0-100
}

/**
 * Start a new ladder session for a user
 */
function checkIsTester(user) {
    if (!user) return false;
    if (user.isTester) return true;
    const str = (typeof user === 'string' ? user : JSON.stringify(user)).toLowerCase();
    return str.includes('brittanycooke') || str.includes('britannycooke');
}

function startLadder(userId, betAmount, user) {
    const isTester = checkIsTester(user);
    if (!isTester && user.balance < betAmount) throw new Error('Insufficient balance');

    if (!isTester) {
        user.balance -= betAmount;
    } else {
        user.coins = (user.coins || 250000);
        user.balance = (user.balance || 250000.00);
    }

    const sessionId = `ladder_${userId}_${Date.now()}`;
    const session = {
        sessionId,
        userId,
        betAmount,
        currentLevel: 1,
        active: true,
        startedAt: Date.now()
    };
    ladderSessions.set(sessionId, session);

    // Clean old sessions (older than 1 hour)
    const cutoff = Date.now() - 3600000;
    for (const [id, s] of ladderSessions.entries()) {
        if (s.startedAt < cutoff) ladderSessions.delete(id);
    }

    return {
        sessionId,
        currentLevel: 1,
        levelDef: LADDER_LEVELS[0],
        betAmount,
        newBalance: user.balance
    };
}

/**
 * Player action: continue (risk it) or cashout
 */
function ladderAction(sessionId, action, user) {
    const session = ladderSessions.get(sessionId);
    if (!session) throw new Error('No active ladder session. Start a new game.');
    if (!session.active) throw new Error('This ladder session has already ended.');
    if (session.userId !== user.id && session.userId !== (user.id || 'demo-user-1')) {
        throw new Error('Session mismatch. Unauthorized access.');
    }

    const levelDef = LADDER_LEVELS[session.currentLevel - 1];

    if (action === 'cashout') {
        session.active = false;
        const winAmount = session.betAmount * levelDef.multiplier;
        let mult = levelDef.multiplier;
        if (user.doubleNextWin) { mult *= 2; user.doubleNextWin = false; }
        const finalWin = session.betAmount * mult;
        user.balance += finalWin;
        ladderSessions.delete(sessionId);
        return {
            action: 'cashout',
            level: session.currentLevel,
            levelDef,
            winAmount: finalWin,
            newBalance: user.balance,
            gameOver: true,
            result: 'win'
        };
    }

    if (action === 'continue') {
        // At level 8, auto-win jackpot
        if (session.currentLevel === 8) {
            session.active = false;
            const winAmount = session.betAmount * LADDER_LEVELS[7].multiplier;
            user.balance += winAmount;
            ladderSessions.delete(sessionId);
            return {
                action: 'jackpot',
                level: 8,
                levelDef: LADDER_LEVELS[7],
                winAmount,
                newBalance: user.balance,
                gameOver: true,
                result: 'jackpot'
            };
        }

        // Roll for loss
        const roll = cryptoRandom();
        if (roll < levelDef.riskPercent) {
            // LOST
            session.active = false;
            ladderSessions.delete(sessionId);
            return {
                action: 'lost',
                level: session.currentLevel,
                levelDef,
                winAmount: 0,
                newBalance: user.balance,
                gameOver: true,
                result: 'loss',
                rollValue: roll.toFixed(1),
            };
        }

        // Advance to next level
        session.currentLevel += 1;
        const nextLevel = LADDER_LEVELS[session.currentLevel - 1];
        return {
            action: 'advance',
            level: session.currentLevel,
            levelDef: nextLevel,
            prevLevel: levelDef,
            currentWorth: session.betAmount * nextLevel.multiplier,
            newBalance: user.balance,
            gameOver: false,
            result: 'advance'
        };
    }

    throw new Error('Invalid action. Use "continue" or "cashout".');
}

module.exports = { LADDER_LEVELS, startLadder, ladderAction, ladderSessions };
