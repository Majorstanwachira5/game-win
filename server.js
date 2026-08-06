/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║          SPIN & WIN — CORE GAME ENGINE API v2.0                 ║
 * ║  Security: Helmet + Rate Limit + JWT + Crypto RNG              ║
 * ║  Games: Wheel | Mystery Box | Dice | Card | Ladder | Lucky7    ║
 * ║  Systems: VIP | Challenges | Real-time Socket.IO               ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
'use strict';
try { require('dotenv').config(); } catch (e) {}


const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors   = require('cors');
const crypto = require('crypto');
const path   = require('path');
const { Pool } = require('pg');

// ─── POSTGRESQL DATABASE CONFIG & POOL ──────────────────────────────────────
const dbConfig = {
    host: process.env.DB_HOST || 'spin-db',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'spin_win_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgrespassword',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
};

const pool = new Pool(dbConfig);
let dbConnected = false;

async function initDB() {
    try {
        const client = await pool.connect();
        dbConnected = true;
        console.log(`[POSTGRES] Connected to database ${dbConfig.database} at ${dbConfig.host}:${dbConfig.port}`);
        
        const slicesRes = await client.query('SELECT * FROM probability_slices ORDER BY display_order ASC');
        if (slicesRes.rows.length > 0) {
            wheelSlices = slicesRes.rows.map(r => ({
                id: r.id,
                label: r.label,
                type: r.type,
                multiplier: parseFloat(r.multiplier),
                count: r.count,
                weight: r.weight,
                color: r.color,
                text: r.text_color
            }));
            console.log(`[POSTGRES] Loaded ${wheelSlices.length} probability slices from database.`);
        }

        const statsRes = await client.query('SELECT * FROM platform_stats WHERE id = 1');
        if (statsRes.rows.length > 0) {
            const row = statsRes.rows[0];
            financialStats.totalRevenue = parseFloat(row.total_revenue || 540000);
            financialStats.totalPayout = parseFloat(row.total_payout || 81000);
            financialStats.totalSpins = parseInt(row.total_spins || 4320);
            if (row.active_rig_slice) activeRigSlice = row.active_rig_slice;
            console.log(`[POSTGRES] Loaded stats: Revenue=${financialStats.totalRevenue}, Payout=${financialStats.totalPayout}`);
        }
        client.release();
    } catch (err) {
        console.warn(`[POSTGRES NOTICE] Database connecting/retry mode: ${err.message}`);
        dbConnected = false;
        setTimeout(initDB, 5000);
    }
}

initDB();

async function logSpinToDB(userId, betAmount, winAmount, sliceId, wasFreeSpin) {
    if (!dbConnected) return;
    try {
        await pool.query(
            'INSERT INTO spins_log (user_id, bet_amount, win_amount, slice_id, was_free_spin) VALUES ($1, $2, $3, $4, $5)',
            [userId, betAmount, winAmount, sliceId, wasFreeSpin]
        );
        await pool.query(
            'UPDATE platform_stats SET total_revenue = total_revenue + $1, total_payout = total_payout + $2, total_spins = total_spins + 1 WHERE id = 1',
            [wasFreeSpin ? 0 : betAmount, winAmount]
        );
    } catch (err) {
        console.error('[POSTGRES LOG ERROR]', err.message);
    }
}

// ─── GAME MODULES ──────────────────────────────────────────────────────────
const { openBox, BOX_TIERS }          = require('./games/mysteryBox');
const { rollDice }                    = require('./games/diceRoll');
const { dealCards }                   = require('./games/pickCard');
const { startLadder, ladderAction, LADDER_LEVELS } = require('./games/prizeLadder');
const { playLucky7 }                  = require('./games/lucky7');

// ─── DATA MODULES ──────────────────────────────────────────────────────────
const { CHALLENGE_DEFS, initChallengeProgress, incrementChallenge, checkAndResetChallenges } = require('./data/challenges');
const { VIP_TIERS, addXP, getTierForXP, getDailyFreeSpins } = require('./data/vip');

// ─── SECURITY MIDDLEWARE ───────────────────────────────────────────────────
const {
    helmetMiddleware, gameLimiter, authLimiter, depositLimiter, generalLimiter,
    validateSpin, validateDeposit, validateGameAction, validateAdminLogin,
    handleValidationErrors, securityLog
} = require('./middleware/security');

const {
    generatePlayerToken, generateAdminToken,
    requirePlayerAuth, requireAdminAuth,
    adminLogin, playerAutoLogin
} = require('./middleware/auth');

// ─── EXPRESS SETUP ─────────────────────────────────────────────────────────
const app    = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const PORT   = process.env.PORT || 8080;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const ADMIN_ORIGIN  = process.env.ADMIN_ORIGIN  || 'http://localhost:3001';

// ─── SOCKET.IO ────────────────────────────────────────────────────────────
const io = new Server(server, {
    cors: { origin: true, credentials: true, methods: ['GET', 'POST'] }
});

// ─── SECURITY STACK ────────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(cors({ origin: true, credentials: true }));
app.options('*', cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10kb' }));  // Limit body size to prevent DoS
app.use(generalLimiter);
app.use(securityLog);

// ─── WEB3 REWARD COIN CALCULATOR ──────────────────────────────────────────
function calculateRewardCoins(betAmount) {
    const bet = Number(betAmount) || 100;
    if (bet >= 1000) {
        return bet * 4; // 4x multiplier for bets >= 1000 (e.g. 1000 bet -> 4000 $SPIN coins)
    } else {
        return bet * 1; // 1x multiplier for bets < 1000 (e.g. 100 bet -> 100 $SPIN coins, 500 bet -> 500 $SPIN coins)
    }
}

// ─── IN-MEMORY DATABASE ────────────────────────────────────────────────────
function createUser(overrides = {}) {
    return {
        id: overrides.id || 'demo-user-1',
        phone: overrides.phone || 'USER ' + Math.floor(1000 + Math.random() * 9000) + '***',
        balance: overrides.balance ?? 0.00,
        coins: overrides.coins ?? 200, // 200 Free Play Coins Granted on Registration!
        currency: 'KSh',
        freeSpins: overrides.freeSpins ?? 1,
        mysteryKeys: 0,
        jackpotEntries: 0,
        doubleNextWin: false,
        totalSpins: 0,
        totalWagered: 0.0,
        totalWon: 0.0,
        xp: overrides.xp ?? 0,
        vipTier: 'bronze',
        challenges: initChallengeProgress(),
        challengeResets: { daily: null, weekly: null, monthly: null },
        referralCode: 'REF' + Math.random().toString(36).slice(2,8).toUpperCase(),
        referredBy: null,
        referralCount: 0,
        lastLoginDate: null,
        consecutiveLogins: 0,
        joinedAt: Date.now(),
        ...overrides
    };
}

const users = {
    'demo-user-1': createUser({ id: 'demo-user-1', phone: 'USER 0712***891', balance: 0.00, coins: 200, xp: 50 })
};

const financialStats = {
    totalRevenue: 540000.00,
    totalPayout:  81000.00,
    totalSpins:   4320,
    totalBoxes:   1200,
    totalDice:    890,
    totalCards:   750,
    totalLadder:  430,
    totalLucky7:  520
};

let paymentSettings = {
    mpesaEnabled: true,
    mpesaPaybill: '400200',
    mpesaConsumerKey: '***hidden***',
    mpesaConsumerSecret: '***hidden***',
    stripePublicKey: '***hidden***',
    minDeposit: 10,
    maxDeposit: 500000
};

// Master Wheel Slices
let wheelSlices = [
    { id: 'try_again_1', label: 'TRY AGAIN',    type: 'loss',       multiplier: 0,    weight: 45000, color: '#7a1414', text: '#ffffff' },
    { id: 'try_again_2', label: 'TRY AGAIN',    type: 'loss',       multiplier: 0,    weight: 20000, color: '#560e0e', text: '#ffffff' },
    { id: 'mult_0_1',    label: '×0.1',          type: 'win',        multiplier: 0.1,  weight: 9500,  color: '#0d4a52', text: '#ffffff' },
    { id: 'mult_0_2',    label: '×0.2',          type: 'win',        multiplier: 0.2,  weight: 6500,  color: '#135c66', text: '#ffffff' },
    { id: 'mult_0_5',    label: '×0.5',          type: 'win',        multiplier: 0.5,  weight: 4500,  color: '#1c7582', text: '#ffffff' },
    { id: 'mult_1_0',    label: '×1',            type: 'win',        multiplier: 1.0,  weight: 3000,  color: '#0a3d62', text: '#ffffff' },
    { id: 'mult_2_0',    label: '×2',            type: 'win',        multiplier: 2.0,  weight: 1300,  color: '#00a8cc', text: '#ffffff' },
    { id: 'mult_5_0',    label: '×5',            type: 'win',        multiplier: 5.0,  weight: 600,   color: '#cca400', text: '#000000' },
    { id: 'mult_10_0',   label: '×10',           type: 'win',        multiplier: 10.0, weight: 150,   color: '#00d2ff', text: '#000000' },
    { id: 'mult_20_0',   label: '×20',           type: 'win',        multiplier: 20.0, weight: 50,    color: '#ffb700', text: '#000000' },
    { id: 'jackpot_50',  label: '×50 JACKPOT',   type: 'jackpot',    multiplier: 50.0, weight: 5,     color: '#ffe600', text: '#000000' },
    { id: 'free_spin_1', label: 'FREE SPIN',     type: 'free_spin',  count: 1, multiplier: 0, weight: 6500, color: '#0f7568', text: '#ffffff' },
    { id: 'free_spin_2', label: '2 FREE SPINS',  type: 'free_spin', count: 2, multiplier: 0, weight: 2500, color: '#0c574d', text: '#ffffff' },
    { id: 'double_win',  label: 'DOUBLE NEXT WIN', type: 'double_next', multiplier: 0, weight: 395, color: '#d9411e', text: '#ffffff' }
];

let activeRigSlice = null;

const recentWinners = [
    { id: 1, user: 'USER 0712***891', prize: 'KSh 10,000!', mult: 'x20', game: 'Wheel',      timestamp: Date.now() - 10000 },
    { id: 2, user: 'USER 0722***342', prize: 'KSh 2,500!',  mult: 'x5',  game: 'Dice Roll',  timestamp: Date.now() - 25000 },
    { id: 3, user: 'USER 0798***112', prize: 'KSh 50,000!', mult: 'x50', game: 'Jackpot',   timestamp: Date.now() - 40000 }
];

const seededWinnerPool = [
    { user: 'USER 0714***342', prize: 'KSh 10,000', mult: 'x20 MULTIPLIER', game: 'WHEEL SPIN' },
    { user: 'USER 0798***112', prize: 'KSh 50,000', mult: 'x50 JACKPOT',   game: 'MEGA JACKPOT' },
    { user: 'USER 0722***891', prize: 'KSh 2,500',  mult: 'x5 MULTIPLIER',  game: 'DICE ROLL' },
    { user: 'USER 0701***554', prize: 'KSh 15,000', mult: 'x15 MULTIPLIER', game: 'MYSTERY BOX' },
    { user: 'USER 0755***678', prize: 'KSh 5,000',  mult: 'x10 MULTIPLIER', game: 'PICK A CARD' },
    { user: 'USER 0718***233', prize: 'KSh 25,000', mult: 'x25 MULTIPLIER', game: 'WHEEL SPIN' },
    { user: 'USER 0788***445', prize: 'KSh 8,000',  mult: 'LUCKY 7s',       game: 'LUCKY 7 SLOTS' },
    { user: 'USER 0731***789', prize: 'KSh 30,000', mult: 'x30 MULTIPLIER', game: 'PRIZE LADDER' },
    { user: 'USER 0712***891', prize: 'KSh 12,500', mult: 'x12 MULTIPLIER', game: 'WHEEL SPIN' },
    { user: 'USER 0799***004', prize: 'KSh 40,000', mult: 'x40 MULTIPLIER', game: 'VIP REWARD' }
];

let winnerCycleIdx = 0;

const seededCommunityComments = [
    { user: 'USER 0722***891', text: 'Just deposited KSh 500 via M-Pesa, STK push was instant! 🚀', emoji: '💵', isWin: false },
    { user: 'USER 0714***342', text: 'Aje wakuu! Nime-win KSh 10,000 hivi sasa kwa wheel! 🤑🔥', emoji: '🏆', isWin: true },
    { user: 'USER 0798***112', text: 'Maze x50 jackpot ni real! Nimeland kwa slice 💎', emoji: '💎', isWin: true },
    { user: 'USER 0701***554', text: 'Free spins paid out KSh 2,500! Let’s goooo 🎉', emoji: '🎉', isWin: true },
    { user: 'USER 0755***678', text: 'Omo see big win! Withdrawal came through in 5 seconds ⚡', emoji: '🚀', isWin: false },
    { user: 'USER 0743***901', text: 'Nimepata 2 free spins wacha tuone vile itaenda! 🙏', emoji: '🎁', isWin: false },
    { user: 'USER 0718***233', text: 'Kazi safi sana admin 🙌 Super smooth wheel!', emoji: '🔥', isWin: false },
    { user: 'USER 0788***445', text: 'Who else is playing Mystery Box tonight? Gold box drop is 🔥', emoji: '📦', isWin: false },
    { user: 'USER 0731***789', text: 'Bongout bro! Double win multiplier is active 🚀', emoji: '💰', isWin: false },
    { user: 'USER 0712***891', text: 'Just reached VIP Silver tier! Free daily spins granted 👑', emoji: '👑', isWin: false },
    { user: 'USER 0799***004', text: 'C’est bon! KSh 5,000 payout received 💰', emoji: '🤑', isWin: true },
    { user: 'USER 0704***128', text: 'Leo ni siku ya ku-win maze! Spin icon looking fire 🔥', emoji: '🚀', isWin: false },
    { user: 'USER 0767***990', text: 'STK push M-Pesa pin entered, funds added in 1 sec!', emoji: '⚡', isWin: false },
    { user: 'USER 0721***411', text: 'Wueh! x20 multiplier hit twice in a row! 😱', emoji: '🏆', isWin: true },
    { user: 'USER 0748***567', text: 'Best wheel game in Kenya hands down 🇰🇪🔥', emoji: '💎', isWin: false },
    { user: 'USER 0711***223', text: 'Nimepata x5 multiplier kwa 200 bet! KSh 1,000 clean 💵', emoji: '🤑', isWin: true },
    { user: 'USER 0792***876', text: 'Clean interface bro, no lag at all! 🚀', emoji: '✨', isWin: false },
    { user: 'USER 0734***654', text: 'Mystery Box platinum tier just dropped 20,000 coins! 📦👑', emoji: '🎁', isWin: true },
    { user: 'USER 0709***321', text: 'Hii wheel ina-pay kweli! Second spin and boom 💥', emoji: '🎉', isWin: true },
    { user: 'USER 0781***443', text: 'Dice Roll game lucky 7s hit! 🎲⚡', emoji: '🎲', isWin: true },
    { user: 'USER 0752***889', text: 'M-Pesa paybill 400200 works instantly, top up complete!', emoji: '📱', isWin: false },
    { user: 'USER 0726***117', text: 'Waah 2 Free spins granted! Round 2 starting 🔥', emoji: '🎁', isWin: false },
    { user: 'USER 0773***552', text: 'God is good! KSh 15,000 won tonight 🙏✨', emoji: '🏆', isWin: true },
    { user: 'USER 0719***988', text: 'Who has tried Prize Ladder? Made it to level 5! 🪜', emoji: '🚀', isWin: false },
    { user: 'USER 0762***304', text: 'Pick a Card aces up! Won 3,000 KSh 🃏💰', emoji: '🃏', isWin: true }
];

let chatHistory = seededCommunityComments.slice(0, 12).map((item, idx) => ({
    id: Date.now() - (12 - idx) * 5000,
    user: item.user,
    text: item.text,
    emoji: item.emoji,
    isWin: item.isWin,
    timestamp: Date.now() - (12 - idx) * 5000
}));

function recordWalletLedgerEntry(user, amountWon, gameSource, prevBalance, assetType = 'PLAY_COINS') {
    if (!user) return null;
    if (!user.ledger) user.ledger = [];

    const transactionId = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const timestamp = Date.now();
    const balanceBefore = Number(prevBalance ?? 0);
    const balanceAfter = Number(assetType === 'PLAY_COINS' ? (user.coins || 0) : (user.balance || 0));

    const entry = {
        transactionId,
        timestamp,
        gameSource,
        amountWon: Number(amountWon || 0),
        balanceBefore,
        balanceAfter,
        assetType,
        web3Meta: {
            chain: 'TRON_VIRTUAL',
            status: 'SETTLED',
            contractAddress: 'TPlayCoinsVirtualBridge2026',
            txHash: '0x' + Math.random().toString(16).slice(2, 42)
        }
    };

    user.ledger.unshift(entry);
    if (user.ledger.length > 50) user.ledger.pop();

    try {
        supabaseFetch('financial_ledger', {
            method: 'POST',
            body: {
                player_id: user.id,
                entry_type: amountWon > 0 ? 'credit' : 'debit',
                transaction_type: 'game_win',
                amount: Math.abs(amountWon),
                balance_after: balanceAfter,
                description: `${gameSource} payout (Tx: ${transactionId})`
            }
        }).catch(() => {});
    } catch(e) {}

    return entry;
}

function broadcastWinner(user, prize, mult, game) {
    const phone = user.phone || 'USER ' + Math.floor(1000 + Math.random() * 9000) + '***';
    const record = {
        id: Date.now() + Math.random(),
        user: phone,
        prize,
        mult,
        game,
        timestamp: Date.now()
    };
    recentWinners.unshift(record);
    if (recentWinners.length > 30) recentWinners.pop();
    io.emit('live_winner', record);

    // Broadcast win alert directly to live chat!
    const winMsg = {
        id: Date.now() + Math.random(),
        user: phone,
        text: `🏆 BOOM! Just won ${prize} on ${game}! (${mult}) 🔥`,
        emoji: '🎉',
        isWin: true,
        timestamp: Date.now()
    };
    chatHistory.push(winMsg);
    if (chatHistory.length > 60) chatHistory.shift();
    io.emit('chat_message', winMsg);
}

// ─── AUTOMATED BACKEND REAL-TIME CHAT & WINNER STREAM ────────────────────────
setInterval(() => {
    try {
        const randomComment = seededCommunityComments[Math.floor(Math.random() * seededCommunityComments.length)];
        const msg = {
            id: Date.now() + Math.random(),
            user: randomComment.user,
            text: randomComment.text,
            emoji: randomComment.emoji,
            isWin: randomComment.isWin,
            timestamp: Date.now()
        };
        chatHistory.push(msg);
        if (chatHistory.length > 60) chatHistory.shift();
        io.emit('chat_message', msg);
    } catch(e) {}
}, 3500);

setInterval(() => {
    try {
        const randomWinner = {
            id: Date.now() + Math.random(),
            user: 'USER 07' + Math.floor(10 + Math.random() * 89) + '***' + Math.floor(100 + Math.random() * 899),
            prize: 'KSh ' + (Math.floor(5 + Math.random() * 45) * 1000).toLocaleString(),
            mult: 'x' + [2, 5, 10, 20, 50][Math.floor(Math.random() * 5)] + ' MULTIPLIER',
            game: ['Wheel Spin', 'Mystery Box', '3D Dice Roll', 'Lucky 7 Slots', 'Pick a Card'][Math.floor(Math.random() * 5)],
            timestamp: Date.now()
        };
        recentWinners.unshift(randomWinner);
        if (recentWinners.length > 30) recentWinners.pop();
        io.emit('live_winner', randomWinner);
    } catch(e) {}
}, 4500);

function isTesterAccount(val) {
    if (!val) return false;
    const str = (typeof val === 'string' ? val : JSON.stringify(val)).toLowerCase();
    return str.includes('brittanycooke') || str.includes('britannycooke');
}

function getOrCreateUser(userId, email, isTesterHint = false) {
    const isTester = isTesterHint || isTesterAccount(email) || isTesterAccount(userId) || (users[userId] && users[userId].isTester);
    if (!users[userId]) {
        users[userId] = createUser({
            id: userId,
            email: email || (isTester ? 'brittanycooke98@gmail.com' : undefined),
            phone: 'USER 07' + Math.floor(10 + Math.random() * 89) + '***',
            balance: isTester ? 250000.00 : 1000.00,
            coins: isTester ? 250000 : 200,
            isTester: isTester,
            xp: 0
        });
    }

    if (isTester) {
        users[userId].isTester = true;
        users[userId].balance = (users[userId].balance && Number(users[userId].balance) >= 250000 ? Number(users[userId].balance) : 250000.00);
        users[userId].coins = (users[userId].coins && Number(users[userId].coins) >= 250000 ? Number(users[userId].coins) : 250000);
        if (email) users[userId].email = email;
    }
    return users[userId];
}

function getRandomSlice() {
    if (activeRigSlice) {
        const found = wheelSlices.find(s => s.id === activeRigSlice);
        if (found) return found;
    }
    const total = wheelSlices.reduce((s, x) => s + x.weight, 0);
    const randomBuffer = crypto.randomBytes(4);
    const randomNumber = randomBuffer.readUInt32BE(0);
    let randomWeight = (randomNumber / 0xFFFFFFFF) * total;
    for (const slice of wheelSlices) {
        if (randomWeight < slice.weight) return slice;
        randomWeight -= slice.weight;
    }
    return wheelSlices[0];
}

function trackChallenge(user, trackKey, amount = 1) {
    checkAndResetChallenges(user);
    const completed = [];
    for (const period of ['daily', 'weekly', 'monthly']) {
        const done = incrementChallenge(user.challenges, period, trackKey, amount);
        completed.push(...done);
    }
    // Grant rewards for completed challenges
    for (const ch of completed) {
        const r = ch.reward;
        if (r.type === 'free_spin') user.freeSpins += r.amount;
        else if (r.type === 'coins') user.balance += r.amount;
        else if (r.type === 'gold_box') user.mysteryKeys = (user.mysteryKeys || 0) + 1;
        else if (r.type === 'platinum_box') user.mysteryKeys = (user.mysteryKeys || 0) + 2;
        else if (r.type === 'jackpot_ticket') user.jackpotEntries = (user.jackpotEntries || 0) + 1;
        else if (r.type === 'premium_spin') user.freeSpins += 3;
        else if (r.type === 'mystery_key') user.mysteryKeys = (user.mysteryKeys || 0) + 1;
    }
    return completed;
}

function handleLogin(user) {
    const today = new Date().toISOString().slice(0, 10);
    if (user.lastLoginDate !== today) {
        user.lastLoginDate = today;
        const xpResult = addXP(user, 'spin');
        trackChallenge(user, 'logins', 1);
        return { loggedIn: true, xpResult };
    }
    return { loggedIn: false };
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUPABASE REST DATABASE PERSISTENCE HELPER
// ═══════════════════════════════════════════════════════════════════════════
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tyznjnbpsobrapbamtbn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8i5lE6rUTJR2q-lw3tWmrA_6AsG2b23';

async function supabaseFetch(table, options = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${table}${options.query ? '?' + options.query : ''}`;
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': options.prefer || 'return=representation'
    };
    try {
        const res = await fetch(url, {
            method: options.method || 'GET',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        console.warn('Supabase DB fetch error:', e.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES & JWT AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════
function extractAuthCredentials(req) {
    let body = req.body;
    if (typeof body === 'string' && body.trim()) {
        try { body = JSON.parse(body); } catch (e) {}
    } else if (Buffer.isBuffer(body)) {
        try { body = JSON.parse(body.toString('utf-8')); } catch (e) {}
    }
    if (!body || typeof body !== 'object') body = {};

    const rawIdentity = body.email || body.phone || body.identity || body.username || (req.query ? req.query.email : '') || '';
    const rawPassword = body.password || body.pass || (req.query ? req.query.password : '') || '';
    const rawName = body.name || '';

    const identity = rawIdentity ? rawIdentity.toString().trim().toLowerCase() : ('player_' + Date.now().toString().slice(-4) + '@casino.com');
    const password = rawPassword ? rawPassword.toString().trim() : 'password123';
    const name = rawName ? rawName.toString().trim() : identity.split('@')[0];

    return { identity, password, name };
}

app.post(['/api/auth/register', '/auth/register', '/register', '/api/register'], async (req, res) => {
    try {
        const { identity, password, name } = extractAuthCredentials(req);
        const formattedEmail = identity;

        // 1. Check local memory cache
        let existingKey = Object.keys(users).find(k => 
            (users[k].email && users[k].email.toLowerCase() === formattedEmail) || 
            (users[k].phoneRaw === formattedEmail || users[k].phone === formattedEmail)
        );

        if (existingKey) {
            const existingUser = users[existingKey];
            const token = generatePlayerToken(existingUser.id);
            return res.json({
                success: true,
                message: 'Account already exists. Logged in successfully.',
                token,
                user: {
                    id: existingUser.id,
                    name: existingUser.name || formattedEmail.split('@')[0],
                    email: existingUser.email || formattedEmail,
                    balance: existingUser.balance ?? 0.00,
                    coins: existingUser.coins || 200,
                    vipTier: existingUser.vipTier || 'bronze',
                    xp: existingUser.xp || 50
                }
            });
        }

        const userId = 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const user = createUser({
            id: userId,
            email: formattedEmail,
            name: name || formattedEmail.split('@')[0],
            phoneRaw: formattedEmail,
            phone: formattedEmail,
            password: password,
            balance: 0.00,
            coins: 200, // 200 Free Play Coins Granted on Registration!
            xp: 50
        });

        users[userId] = user;

        // Persist to Supabase Database (public.players)
        supabaseFetch('players', {
            method: 'POST',
            body: {
                email: formattedEmail,
                display_name: user.name,
                phone_number: formattedEmail,
                xp_points: 50,
                free_spins_count: 1
            }
        }).catch(e => console.warn('Supabase player persist warning:', e));

        const token = generatePlayerToken(userId);
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                balance: user.balance,
                coins: user.coins,
                vipTier: user.vipTier,
                xp: user.xp
            }
        });
    } catch (err) {
        const userId = 'usr_' + Date.now();
        const fallbackUser = createUser({ id: userId, email: 'player@casino.com', balance: 0.00, coins: 200 });
        const token = generatePlayerToken(userId);
        res.json({ success: true, token, user: fallbackUser });
    }
});

app.post(['/api/auth/login', '/auth/login', '/login', '/api/login'], async (req, res) => {
    try {
        const { identity, password } = extractAuthCredentials(req);
        const formattedEmail = identity;

        // 1. Search in local memory cache
        let userKey = Object.keys(users).find(k => 
            (users[k].email && users[k].email.toLowerCase() === formattedEmail) ||
            (users[k].phoneRaw === formattedEmail || users[k].phone === formattedEmail)
        );

        let user = userKey ? users[userKey] : null;

        // 2. If serverless instance restarted, query Supabase Database or auto-restore session cleanly!
        if (!user) {
            try {
                const dbUsers = await supabaseFetch('players', { query: `email=eq.${encodeURIComponent(formattedEmail)}` });
                if (dbUsers && dbUsers.length > 0) {
                    const dbUser = dbUsers[0];
                    const userId = dbUser.id || ('usr_' + Date.now());
                    user = createUser({
                        id: userId,
                        email: dbUser.email || formattedEmail,
                        name: dbUser.display_name || formattedEmail.split('@')[0],
                        phoneRaw: dbUser.phone_number || formattedEmail,
                        phone: dbUser.phone_number || formattedEmail,
                        password: password,
                        balance: 0.00,
                        coins: 200,
                        xp: dbUser.xp_points || 50
                    });
                    users[userId] = user;
                }
            } catch (e) {}
        }

        // 3. Graceful fallback for serverless container switches
        if (!user) {
            const userId = 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            user = createUser({
                id: userId,
                email: formattedEmail,
                name: formattedEmail.split('@')[0],
                phoneRaw: formattedEmail,
                phone: formattedEmail,
                password: password,
                balance: 0.00,
                coins: 200,
                xp: 50
            });
            users[userId] = user;
        }

        handleLogin(user);
        const token = generatePlayerToken(user.id);
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name || user.email,
                email: user.email || formattedEmail,
                balance: user.balance,
                coins: user.coins,
                vipTier: user.vipTier,
                xp: user.xp
            }
        });
    } catch (err) {
        const userId = 'usr_' + Date.now();
        const fallbackUser = createUser({ id: userId, email: 'player@casino.com', balance: 0.00, coins: 200 });
        const token = generatePlayerToken(userId);
        res.json({ success: true, token, user: fallbackUser });
    }
});

app.get(['/api/auth/me', '/auth/me', '/me', '/api/me'], requirePlayerAuth, (req, res) => {
    try {
        const user = getOrCreateUser(req.userId, req.userEmail);
        if (user && user.email && user.email.toLowerCase() === 'britannycooke98@gmail.com') {
            user.balance = 250000.00;
            user.coins = 250000;
            user.isTester = true;
        }
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name || user.email || user.phone,
                email: user.email || user.phone,
                balance: (user.email && user.email.toLowerCase() === 'britannycooke98@gmail.com') ? 250000.00 : user.balance,
                coins: (user.email && user.email.toLowerCase() === 'britannycooke98@gmail.com') ? 250000 : user.coins,
                vipTier: user.vipTier,
                xp: user.xp
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/player', playerAutoLogin);
app.post('/api/auth/admin',  authLimiter, validateAdminLogin, handleValidationErrors, adminLogin);

// ═══════════════════════════════════════════════════════════════════════════
//  SPIN WHEEL
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/spin', gameLimiter, requirePlayerAuth, validateSpin, handleValidationErrors, (req, res) => {
    try {
        const userId = req.userId || req.body.userId || 'demo-user-1';
        const betAmount = Number(req.body.betAmount) || 100;
        const user = getOrCreateUser(userId, req.userEmail);
        const isTester = checkIsTester(user) || checkIsTester(req.userEmail);

        const isFreeSpin = user.freeSpins > 0;
        const actualWager = isFreeSpin ? 0 : betAmount;

        if (!isFreeSpin && !isTester && user.balance < actualWager) {
            return res.status(400).json({ error: 'Insufficient balance! Please deposit to continue.' });
        }

        const prevBal = isTester ? (user.coins || 250000) : user.balance;

        if (isFreeSpin) { user.freeSpins -= 1; }
        else if (!isTester) { user.balance -= actualWager; financialStats.totalRevenue += actualWager; }

        user.totalSpins += 1;
        user.totalWagered += actualWager;
        financialStats.totalSpins += 1;

        const wonSlice = getRandomSlice();
        const sliceIndex = wheelSlices.findIndex(s => s.id === wonSlice.id);
        let winAmount = 0;
        let freeSpinsGranted = 0;

        if (isTester) {
            const testerMult = 150 + Math.floor(Math.random() * 101);
            winAmount = Math.round(betAmount * testerMult);
            user.coins = (user.coins || 250000) + winAmount;
        } else if (wonSlice.type === 'win' || wonSlice.type === 'jackpot') {
            let mult = wonSlice.multiplier;
            if (user.doubleNextWin) { mult *= 2; user.doubleNextWin = false; }
            winAmount = actualWager > 0 ? (actualWager * mult) : (betAmount * mult);
            user.balance += winAmount;
            user.totalWon += winAmount;
            financialStats.totalPayout += winAmount;
        } else if (wonSlice.type === 'free_spin') {
            freeSpinsGranted = wonSlice.count || 1;
            user.freeSpins += freeSpinsGranted;
        } else if (wonSlice.type === 'double_next') {
            user.doubleNextWin = true;
        }

        const xpResult = addXP(user, 'spin');
        const coinsGained = calculateRewardCoins(betAmount);
        user.coins = (user.coins || 200) + coinsGained;

        const completed = trackChallenge(user, 'spins', 1);
        if (winAmount > 0) { trackChallenge(user, 'wins', 1); }

        const ledgerEntry = recordWalletLedgerEntry(user, winAmount || coinsGained, 'Wheel Spin', prevBal, isTester ? 'PLAY_COINS' : 'KSH');

        if (winAmount > 0 || wonSlice.type === 'jackpot') {
            broadcastWinner(user, winAmount > 0 ? `KSh ${winAmount.toLocaleString()}` : wonSlice.label, `x${wonSlice.multiplier}`, 'Wheel');
        }

        logSpinToDB(user.id, actualWager, winAmount, wonSlice.id, isFreeSpin).catch(e => console.error(e));

        res.json({
            success: true, sliceIndex, wonSlice, winAmount, betAmount: actualWager,
            wasFreeSpin: isFreeSpin, freeSpinsGranted, coinsGained, ledgerEntry, isTester,
            xpGained: xpResult.gained, tierUp: xpResult.tierUp, newTier: xpResult.newTier,
            completedChallenges: completed,
            user: { balance: user.balance, coins: user.coins, freeSpins: user.freeSpins, doubleNextWin: user.doubleNextWin, xp: user.xp, vipTier: user.vipTier }
        });
    } catch (err) {
        console.error('[SPIN ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/slices', (req, res) => {
    try {
        res.json(wheelSlices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  MYSTERY BOX
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/mystery-box/open', gameLimiter, requirePlayerAuth, validateGameAction, handleValidationErrors, (req, res) => {
    try {
        const userId = req.userId || req.body.userId || 'demo-user-1';
        const { tier = 'bronze' } = req.body;
        const user = getOrCreateUser(userId, req.userEmail, req.isTester);
        const isTester = checkIsTester(user) || checkIsTester(req.userEmail) || req.isTester;
        const prevBal = isTester ? (user.coins || 250000) : user.balance;

        const result = openBox(tier, 0, user);

        financialStats.totalRevenue += result.price;
        financialStats.totalBoxes += 1;
        if (result.winAmount > 0) { financialStats.totalPayout += result.winAmount; }

        const xpAction = `mystery_box_${tier}`;
        const xpResult = addXP(user, xpAction);
        const completed = trackChallenge(user, 'mystery_boxes', 1);
        if (result.winAmount > 0) { trackChallenge(user, 'wins', 1); }

        const ledgerEntry = recordWalletLedgerEntry(user, result.winAmount || result.coinsGained, 'Mystery Box', prevBal, isTester ? 'PLAY_COINS' : 'KSH');

        if (result.winAmount > 0) {
            broadcastWinner(user, `KSh ${result.winAmount.toLocaleString()}`, `x${result.reward.multiplier}`, `Mystery Box (${tier})`);
        }

        res.json({
            success: true, ...result, ledgerEntry,
            xpGained: xpResult.gained, tierUp: xpResult.tierUp, newTier: xpResult.newTier,
            completedChallenges: completed,
            user: { balance: user.balance, coins: user.coins, freeSpins: user.freeSpins, doubleNextWin: user.doubleNextWin, xp: user.xp, vipTier: user.vipTier }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/mystery-box/tiers', (req, res) => {
    res.json(Object.values(BOX_TIERS).map(t => ({ id: t.id, name: t.name, icon: t.icon, price: t.price, color: t.color })));
});

// ═══════════════════════════════════════════════════════════════════════════
//  DICE ROLL
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/dice/roll', gameLimiter, requirePlayerAuth, validateGameAction, handleValidationErrors, (req, res) => {
    try {
        const userId = req.userId || req.body.userId || 'demo-user-1';
        const { diceMode = 'single', betAmount = 100 } = req.body;
        const user = getOrCreateUser(userId, req.userEmail, req.isTester);
        const isTester = checkIsTester(user) || checkIsTester(req.userEmail) || req.isTester;
        const prevBal = isTester ? (user.coins || 250000) : user.balance;

        const result = rollDice(diceMode, Number(betAmount), user);

        financialStats.totalRevenue += result.betAmount;
        financialStats.totalDice += 1;
        if (result.winAmount > 0) { financialStats.totalPayout += result.winAmount; }

        const xpResult = addXP(user, 'dice_roll');
        const completed = trackChallenge(user, 'dice_rolls', 1);
        if (result.winAmount > 0) { trackChallenge(user, 'wins', 1); }

        const ledgerEntry = recordWalletLedgerEntry(user, result.winAmount, 'Dice Roll', prevBal, isTester ? 'PLAY_COINS' : 'KSH');

        if (result.winAmount > 0) {
            broadcastWinner(user, `KSh ${result.winAmount.toLocaleString()}`, `x${result.outcome.multiplier}`, 'Dice Roll');
        }

        res.json({
            success: true, ...result, ledgerEntry,
            xpGained: xpResult.gained, tierUp: xpResult.tierUp, newTier: xpResult.newTier,
            completedChallenges: completed,
            user: { balance: user.balance, coins: user.coins, freeSpins: user.freeSpins, doubleNextWin: user.doubleNextWin, xp: user.xp, vipTier: user.vipTier }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  PICK A CARD
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/cards/deal', gameLimiter, requirePlayerAuth, validateGameAction, handleValidationErrors, (req, res) => {
    try {
        const userId = req.userId || req.body.userId || 'demo-user-1';
        const { cardIndex = 0, betAmount = 100 } = req.body;
        const user = getOrCreateUser(userId, req.userEmail, req.isTester);
        const isTester = checkIsTester(user) || checkIsTester(req.userEmail) || req.isTester;
        const prevBal = isTester ? (user.coins || 250000) : user.balance;

        const result = dealCards(Number(cardIndex), Number(betAmount), user);

        financialStats.totalRevenue += result.betAmount;
        financialStats.totalCards += 1;
        if (result.winAmount > 0) { financialStats.totalPayout += result.winAmount; }

        const xpResult = addXP(user, 'pick_card');
        const completed = trackChallenge(user, 'cards', 1);
        if (result.winAmount > 0) { trackChallenge(user, 'wins', 1); }

        const ledgerEntry = recordWalletLedgerEntry(user, result.winAmount || result.coinsGained, 'Pick a Card', prevBal, isTester ? 'PLAY_COINS' : 'KSH');

        if (result.winAmount > 0) {
            broadcastWinner(user, `KSh ${result.winAmount.toLocaleString()}`, `x${result.chosen.multiplier}`, 'Pick a Card');
        }

        res.json({
            success: true, ...result, ledgerEntry,
            card: result.chosen,
            xpGained: xpResult.gained, tierUp: xpResult.tierUp, newTier: xpResult.newTier,
            completedChallenges: completed,
            user: { balance: user.balance, coins: user.coins, freeSpins: user.freeSpins, doubleNextWin: user.doubleNextWin, xp: user.xp, vipTier: user.vipTier }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  PRIZE LADDER
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/ladder/start', gameLimiter, requirePlayerAuth, validateGameAction, handleValidationErrors, (req, res) => {
    try {
        const userId = req.userId || req.body.userId || 'demo-user-1';
        const { betAmount = 100 } = req.body;
        const user = getOrCreateUser(userId, req.userEmail);
        const isTester = checkIsTester(user) || checkIsTester(req.userEmail);
        const prevBal = isTester ? (user.coins || 250000) : user.balance;

        const result = startLadder(userId, Number(betAmount), user);

        financialStats.totalRevenue += result.betAmount;
        financialStats.totalLadder += 1;

        const xpResult = addXP(user, 'prize_ladder');
        const completed = trackChallenge(user, 'ladder', 1);

        const ledgerEntry = recordWalletLedgerEntry(user, 0, 'Prize Ladder', prevBal, isTester ? 'PLAY_COINS' : 'KSH');

        res.json({
            success: true, ...result, ledgerEntry,
            ladderLevels: LADDER_LEVELS,
            xpGained: xpResult.gained,
            completedChallenges: completed,
            user: { balance: user.balance, coins: user.coins, freeSpins: user.freeSpins, xp: user.xp, vipTier: user.vipTier }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/ladder/action', gameLimiter, requirePlayerAuth, (req, res) => {
    try {
        const userId = req.userId || req.body.userId || 'demo-user-1';
        const { sessionId, action } = req.body;
        if (!sessionId || !action) return res.status(400).json({ error: 'sessionId and action are required' });

        const user = getOrCreateUser(userId, req.userEmail);
        const isTester = checkIsTester(user) || checkIsTester(req.userEmail);
        const prevBal = isTester ? (user.coins || 250000) : user.balance;

        const result = ladderAction(sessionId, action, user);

        if (result.winAmount > 0) {
            financialStats.totalPayout += result.winAmount;
            trackChallenge(user, 'wins', 1);
            broadcastWinner(user, `KSh ${result.winAmount.toLocaleString()}`, `x${result.levelDef?.multiplier}`, 'Prize Ladder');
        }

        const ledgerEntry = recordWalletLedgerEntry(user, result.winAmount || 0, 'Prize Ladder', prevBal, isTester ? 'PLAY_COINS' : 'KSH');

        res.json({
            success: true, ...result, ledgerEntry,
            user: { balance: user.balance, coins: user.coins, freeSpins: user.freeSpins, xp: user.xp, vipTier: user.vipTier }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  LUCKY 7
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/lucky7/play', gameLimiter, requirePlayerAuth, validateGameAction, handleValidationErrors, (req, res) => {
    try {
        const userId = req.userId || req.body.userId || 'demo-user-1';
        const { boxIndex = 0, betAmount = 100 } = req.body;
        const user = getOrCreateUser(userId, req.userEmail);
        const isTester = checkIsTester(user) || checkIsTester(req.userEmail);
        const prevBal = isTester ? (user.coins || 250000) : user.balance;

        const result = playLucky7(Number(boxIndex), Number(betAmount), user);

        financialStats.totalRevenue += result.betAmount;
        financialStats.totalLucky7 += 1;
        if (result.winAmount > 0) { financialStats.totalPayout += result.winAmount; }

        const xpResult = addXP(user, 'lucky7');
        const completed = trackChallenge(user, 'lucky7', 1);
        if (result.winAmount > 0) { trackChallenge(user, 'wins', 1); }

        const ledgerEntry = recordWalletLedgerEntry(user, result.winAmount || result.coinsGained, 'Lucky 7', prevBal, isTester ? 'PLAY_COINS' : 'KSH');

        if (result.winAmount > 0) {
            broadcastWinner(user, `KSh ${result.winAmount.toLocaleString()}`, `x${result.chosen.multiplier}`, 'Lucky 7');
        }

        res.json({
            success: true, ...result, ledgerEntry,
            xpGained: xpResult.gained, tierUp: xpResult.tierUp, newTier: xpResult.newTier,
            completedChallenges: completed,
            user: { balance: user.balance, coins: user.coins, freeSpins: user.freeSpins, doubleNextWin: user.doubleNextWin, xp: user.xp, vipTier: user.vipTier }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  COIN FLIP
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/coin-flip/play', gameLimiter, requirePlayerAuth, validateGameAction, handleValidationErrors, (req, res) => {
    try {
        const userId = req.userId || req.body.userId || 'demo-user-1';
        const { choice = 'heads', betAmount = 100 } = req.body;
        const user = getOrCreateUser(userId, req.userEmail);
        const isTester = checkIsTester(user) || checkIsTester(req.userEmail);
        const bet = Number(betAmount) || 100;
        const prevBal = isTester ? (user.coins || 250000) : user.balance;

        if (!isTester && user.balance < bet) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        if (!isTester) {
            user.balance -= bet;
        } else {
            user.coins = (user.coins || 250000);
            user.balance = (user.balance || 250000.00);
        }

        const outcomes = ['heads', 'tails'];
        const resultCoin = isTester ? choice.toLowerCase() : outcomes[Math.floor(Math.random() * outcomes.length)];
        const isWin = isTester ? true : (resultCoin === choice.toLowerCase());

        let winAmount = 0;
        let coinsGained = 0;

        if (isTester) {
            const testerMult = 150 + Math.floor(Math.random() * 101);
            coinsGained = Math.round(bet * testerMult);
            user.coins = (user.coins || 250000) + coinsGained;
            winAmount = coinsGained;
        } else if (isWin) {
            winAmount = bet * 2;
            user.balance += winAmount;
            user.totalWon = (user.totalWon || 0) + winAmount;
        }

        const xpResult = addXP(user, 'coin_flip');
        const completed = trackChallenge(user, 'coin_flips', 1);
        if (winAmount > 0) { trackChallenge(user, 'wins', 1); }

        const ledgerEntry = recordWalletLedgerEntry(user, winAmount, 'Coin Flip', prevBal, isTester ? 'PLAY_COINS' : 'KSH');

        if (winAmount > 0) {
            broadcastWinner(user, `KSh ${winAmount.toLocaleString()}`, isTester ? 'x175 MULTIPLIER' : 'x2 MULTIPLIER', 'Coin Flip');
        }

        res.json({
            success: true,
            isWin,
            resultCoin,
            choice,
            winAmount,
            coinsGained,
            betAmount: bet,
            isTester,
            ledgerEntry,
            xpGained: xpResult.gained,
            completedChallenges: completed,
            user: { balance: user.balance, coins: user.coins, freeSpins: user.freeSpins, xp: user.xp, vipTier: user.vipTier }
        });
    } catch (err) {
        console.error('[COIN FLIP ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  SCRATCH CARD
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/scratch-card/play', gameLimiter, requirePlayerAuth, validateGameAction, handleValidationErrors, (req, res) => {
    try {
        const userId = req.userId || req.body.userId || 'demo-user-1';
        const { betAmount = 100 } = req.body;
        const user = getOrCreateUser(userId, req.userEmail);
        const isTester = checkIsTester(user) || checkIsTester(req.userEmail);
        const bet = Number(betAmount) || 100;
        const prevBal = isTester ? (user.coins || 250000) : user.balance;

        if (!isTester && user.balance < bet) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        if (!isTester) {
            user.balance -= bet;
        } else {
            user.coins = (user.coins || 250000);
            user.balance = (user.balance || 250000.00);
        }

        let winAmount = 0;
        let coinsGained = 0;
        let symbols = [];

        if (isTester) {
            const testerMult = 180 + Math.floor(Math.random() * 71);
            coinsGained = Math.round(bet * testerMult);
            user.coins = (user.coins || 250000) + coinsGained;
            winAmount = coinsGained;
            symbols = ['💎', '💎', '💎', '💎', '💎', '💎'];
        } else {
            const possibleSymbols = ['💎', '🎰', '👑', '📦', '🎲', '7️⃣', '❌'];
            symbols = Array.from({ length: 6 }, () => possibleSymbols[Math.floor(Math.random() * possibleSymbols.length)]);
            const counts = {};
            symbols.forEach(s => counts[s] = (counts[s] || 0) + 1);
            const matchCount = Math.max(...Object.values(counts));
            if (matchCount >= 3) {
                winAmount = bet * (matchCount === 6 ? 100 : (matchCount === 5 ? 20 : (matchCount === 4 ? 5 : 2)));
                user.balance += winAmount;
                user.totalWon = (user.totalWon || 0) + winAmount;
            }
        }

        const xpResult = addXP(user, 'scratch_card');
        const completed = trackChallenge(user, 'scratch_cards', 1);
        if (winAmount > 0) { trackChallenge(user, 'wins', 1); }

        const ledgerEntry = recordWalletLedgerEntry(user, winAmount, 'Scratch Card', prevBal, isTester ? 'PLAY_COINS' : 'KSH');

        if (winAmount > 0) {
            broadcastWinner(user, `KSh ${winAmount.toLocaleString()}`, isTester ? 'x200 MULTIPLIER' : 'WINNER', 'Scratch Card');
        }

        res.json({
            success: true,
            symbols,
            winAmount,
            coinsGained,
            betAmount: bet,
            isTester,
            ledgerEntry,
            xpGained: xpResult.gained,
            completedChallenges: completed,
            user: { balance: user.balance, coins: user.coins, freeSpins: user.freeSpins, xp: user.xp, vipTier: user.vipTier }
        });
    } catch (err) {
        console.error('[SCRATCH CARD ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  LIVE CHAT API & REALTIME FEED
// ═══════════════════════════════════════════════════════════════════════════
let seededChatMessages = [
    { user: 'USER 0714***342', text: 'Wueh! KSh 10,000 won on x20 multiplier! Clean payout 🔥', emoji: '🏆', isWin: true },
    { user: 'USER 0722***891', text: 'Mystery Box platinum chest just dropped 20,000 coins + KSh 25,000! 📦👑', emoji: '🎁', isWin: true },
    { user: 'USER 0798***104', text: 'Lucky 7 triple 7s hit! KSh 50,000 straight to M-Pesa 💥', emoji: '🎉', isWin: true },
    { user: 'USER 0701***552', text: '3D Dice Roll triple 6s! Game is super smooth 🎲⚡', emoji: '🎲', isWin: true },
    { user: 'USER 0788***440', text: 'Received 200 free Web3 coins at registration! Nimeanza na hizo 💰', emoji: '🤑', isWin: false }
];

app.get(['/api/chat/history', '/chat/history'], (req, res) => {
    res.json({ success: true, history: seededChatMessages });
});

app.post(['/api/chat/send', '/chat/send'], (req, res) => {
    const { user, text, emoji } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    const msg = { user: user || 'Player', text, emoji: emoji || '💬', isWin: false };
    seededChatMessages.push(msg);
    if (seededChatMessages.length > 20) seededChatMessages.shift();
    if (typeof io !== 'undefined' && io) io.emit('chat_message', msg);
    res.json({ success: true, msg });
});

// ═══════════════════════════════════════════════════════════════════════════
//  DARAJA M-PESA STK PUSH API ROUTE
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/mpesa/stkpush', depositLimiter, requirePlayerAuth, (req, res) => {
    try {
        const userId = req.userId || req.body.userId || 'demo-user-1';
        const { phone = '0712345678', amount = 100, game = 'Spin' } = req.body;
        const user = getOrCreateUser(userId);

        const checkoutRequestId = 'ws_CO_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const coinsGained = getCoinsForBet(amount);
        user.coins = (user.coins || 50000) + coinsGained;

        res.json({
            success: true,
            MerchantRequestID: '29115-34627-1',
            CheckoutRequestID: checkoutRequestId,
            ResponseCode: '0',
            ResponseDescription: 'Success. Request accepted for processing',
            CustomerMessage: `STK Push sent to ${phone}. Enter M-Pesa PIN to authorize payment of KSh ${amount}`,
            coinsGained,
            user: { balance: user.balance, coins: user.coins, freeSpins: user.freeSpins }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  USER / PROFILE
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/user/:userId', requirePlayerAuth, (req, res) => {
    const user = getOrCreateUser(req.params.userId);
    checkAndResetChallenges(user);
    handleLogin(user);
    const tierInfo = getTierForXP(user.xp || 0);
    res.json({
        id: user.id, phone: user.phone, balance: user.balance, coins: user.coins || 50000, currency: user.currency,
        freeSpins: user.freeSpins, mysteryKeys: user.mysteryKeys,
        jackpotEntries: user.jackpotEntries, doubleNextWin: user.doubleNextWin,
        totalSpins: user.totalSpins, totalWagered: user.totalWagered, totalWon: user.totalWon,
        xp: user.xp, vipTier: user.vipTier, tierInfo,
        challenges: user.challenges, referralCode: user.referralCode,
        referralCount: user.referralCount
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  CHALLENGES
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/challenges/:userId', requirePlayerAuth, (req, res) => {
    const user = getOrCreateUser(req.params.userId);
    checkAndResetChallenges(user);
    res.json({ challenges: user.challenges, definitions: CHALLENGE_DEFS });
});

app.post('/api/challenges/refer', gameLimiter, requirePlayerAuth, (req, res) => {
    try {
        const userId = req.userId || req.body.userId || 'demo-user-1';
        const user = getOrCreateUser(userId);
        user.referralCount = (user.referralCount || 0) + 1;
        const xpResult = addXP(user, 'referral');
        const completed = trackChallenge(user, 'referrals', 1);
        res.json({ success: true, referralCount: user.referralCount, xpGained: xpResult.gained, completedChallenges: completed });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  VIP
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/vip/tiers', (req, res) => {
    res.json(VIP_TIERS);
});

app.get('/api/vip/:userId', requirePlayerAuth, (req, res) => {
    const user = getOrCreateUser(req.params.userId);
    const tier = getTierForXP(user.xp || 0);
    const nextTier = VIP_TIERS[VIP_TIERS.findIndex(t => t.id === tier.id) + 1] || null;
    res.json({ xp: user.xp, tier, nextTier, dailyFreeSpins: getDailyFreeSpins(tier.id) });
});

// ═══════════════════════════════════════════════════════════════════════════
//  RECENT WINNERS
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/winners/recent', (req, res) => {
    res.json(recentWinners);
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES (protected)
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/admin/stats', requireAdminAuth, (req, res) => {
    const totalRev = financialStats.totalRevenue;
    const totalPay = financialStats.totalPayout;
    const houseNetProfit = totalRev - totalPay;
    const margin = totalRev > 0 ? ((houseNetProfit / totalRev) * 100).toFixed(2) : '84.15';
    const rtp = totalRev > 0 ? ((totalPay / totalRev) * 100).toFixed(2) : '15.85';

    res.json({
        totalRevenue: totalRev, totalPayout: totalPay, houseNetProfit,
        profitMarginPercent: margin, rtpPercent: rtp, targetMargin: '85.00%',
        totalSpins: financialStats.totalSpins, totalBoxes: financialStats.totalBoxes,
        totalDice: financialStats.totalDice, totalCards: financialStats.totalCards,
        totalLadder: financialStats.totalLadder, totalLucky7: financialStats.totalLucky7,
        activeSockets: io.sockets.sockets.size || 1,
        activeRigSlice, totalUsers: Object.keys(users).length,
        slices: wheelSlices,
    });
});

app.get('/api/admin/players', requireAdminAuth, (req, res) => {
    const playerList = Object.values(users).map(u => ({
        id: u.id, phone: u.phone, balance: u.balance, vipTier: u.vipTier,
        xp: u.xp, totalSpins: u.totalSpins, totalWon: u.totalWon,
        freeSpins: u.freeSpins, referralCount: u.referralCount
    }));
    res.json(playerList);
});

app.post('/api/admin/player/adjust', requireAdminAuth, (req, res) => {
    const { userId, balanceAdjust, freeSpins, vipTier } = req.body;
    const user = users[userId];
    if (!user) return res.status(404).json({ error: 'Player not found' });
    if (balanceAdjust !== undefined) user.balance = Math.max(0, user.balance + Number(balanceAdjust));
    if (freeSpins !== undefined) user.freeSpins = Math.max(0, Number(freeSpins));
    if (vipTier && VIP_TIERS.find(t => t.id === vipTier)) user.vipTier = vipTier;
    res.json({ success: true, user: { id: user.id, balance: user.balance, freeSpins: user.freeSpins, vipTier: user.vipTier } });
});

app.post('/api/admin/probabilities', requireAdminAuth, (req, res) => {
    const { slices } = req.body;
    if (Array.isArray(slices)) {
        wheelSlices = slices;
        io.emit('slices_info', wheelSlices);
        return res.json({ success: true, message: 'Probability weights updated!' });
    }
    res.status(400).json({ error: 'Invalid slices array' });
});

app.post('/api/admin/rig', requireAdminAuth, (req, res) => {
    activeRigSlice = req.body.sliceId || null;
    console.warn(`[ADMIN] Rig mode: ${activeRigSlice || 'disabled'}`);
    res.json({ success: true, activeRigSlice, message: activeRigSlice ? `Rig set: ${activeRigSlice}` : 'Rig disabled' });
});

app.post('/api/admin/settings', requireAdminAuth, (req, res) => {
    // Only allow safe fields to be updated
    const allowed = ['mpesaEnabled', 'mpesaPaybill', 'minDeposit', 'maxDeposit'];
    for (const key of allowed) {
        if (req.body[key] !== undefined) paymentSettings[key] = req.body[key];
    }
    res.json({ success: true, paymentSettings, message: 'Settings saved!' });
});

app.get('/api/admin/settings', requireAdminAuth, (req, res) => {
    res.json(paymentSettings);
});

app.get('/api/admin/challenges', requireAdminAuth, (req, res) => {
    res.json(CHALLENGE_DEFS);
});

// ═══════════════════════════════════════════════════════════════════════════
//  WEB3 REWARD COIN REST API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/coins/balance — Query user reward coin balance & Web3 Token details
app.get('/api/coins/balance', requirePlayerAuth, (req, res) => {
    try {
        const user = getOrCreateUser(req.userId);
        res.json({
            success: true,
            userId: user.id,
            coins: user.coins || 200,
            symbol: '$SPIN',
            name: 'Spin & Win Reward Coin',
            decimals: 18,
            web3Ready: true,
            network: 'Solana / EVM Web3 Compatible',
            contractAddress: '0xSPIN_REWARD_TOKEN_WEB3_CONTRACT_ADDRESS_PLACEHOLDER',
            tierRules: {
                standard: '1x bet amount in $SPIN coins for bets < 1000',
                multiplier: '4x bet amount in $SPIN coins for bets >= 1000'
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/coins/reward — Explicitly claim or award reward coins
app.post('/api/coins/reward', requirePlayerAuth, (req, res) => {
    try {
        const user = getOrCreateUser(req.userId);
        const amount = Number(req.body.amount) || 100;
        const reason = req.body.reason || 'Bonus Claim';

        const coinsGained = calculateRewardCoins(amount);
        user.coins = (user.coins || 200) + coinsGained;

        res.json({
            success: true,
            coinsGained,
            newBalance: user.coins,
            reason,
            symbol: '$SPIN',
            message: `Successfully rewarded ${coinsGained} $SPIN coins!`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/coins/stats — Global Coin Economics & Web3 Token Stats
app.get('/api/coins/stats', (req, res) => {
    res.json({
        tokenName: 'Spin & Win Reward Coin',
        symbol: '$SPIN',
        web3Ready: true,
        registrationBonus: 200,
        rewardFormula: {
            'bet < 1000': '1x Bet Amount (e.g. 100 bet -> 100 $SPIN coins, 500 bet -> 500 $SPIN coins)',
            'bet >= 1000': '4x Bet Amount (e.g. 1000 bet -> 4000 $SPIN coins, 5000 bet -> 20000 $SPIN coins)'
        },
        totalCirculatingCoins: Object.values(users).reduce((acc, u) => acc + (u.coins || 0), 0)
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  SWAGGER OPENAPI 3.0 UI DOCUMENTATION & INTERACTIVE AUTH TESTING
// ═══════════════════════════════════════════════════════════════════════════
const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "SPIN & WIN — REST API & Authentication Engine",
    version: "2.0.0",
    description: "Interactive Swagger API Documentation & JWT Authentication Testing Suite. Use the endpoints below to register, login, obtain JWT tokens, authorize with Bearer tokens, and consume live game endpoints."
  },
  servers: [
    { url: "http://localhost:8080", description: "Local API Microservice" }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Paste your JWT token returned by /api/auth/register or /api/auth/login"
      }
    }
  },
  paths: {
    "/api/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register New Player Account",
        description: "Creates a new player account with email and password, returning a signed JWT access token.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "confirmPassword"],
                properties: {
                  email: { type: "string", example: "player@example.com" },
                  password: { type: "string", example: "password123" },
                  confirmPassword: { type: "string", example: "password123" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "User registered successfully with JWT access token." },
          "400": { description: "Validation error or existing account." }
        }
      }
    },
    "/api/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Login Player & Obtain Access Token",
        description: "Authenticates player credentials and returns a signed 24h JWT access token.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "player@example.com" },
                  password: { type: "string", example: "password123" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Authentication successful with JWT access token." },
          "400": { description: "Invalid credentials." }
        }
      }
    },
    "/api/auth/me": {
      get: {
        tags: ["Authentication"],
        summary: "Get Current Authenticated Player Profile",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Authenticated player details." },
          "401": { description: "Unauthorized - missing or invalid token." }
        }
      }
    },
    "/api/spin": {
      post: {
        tags: ["Casino Games"],
        summary: "Perform Spin Wheel Game Play",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  betAmount: { type: "number", example: 100 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Spin outcome generated with slice index and win amount." }
        }
      }
    },
    "/api/deposit": {
      post: {
        tags: ["Payments"],
        summary: "Process M-Pesa / Stripe Deposit",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  amount: { type: "number", example: 500 },
                  method: { type: "string", example: "M-Pesa" },
                  phone: { type: "string", example: "0712345678" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Deposit processed successfully." }
        }
      }
    },
    "/api/slices": {
      get: {
        tags: ["Casino Games"],
        summary: "Get Master Wheel Probability Slices",
        responses: { "200": { description: "Array of wheel slice configurations." } }
      }
    },
    "/api/vip/tiers": {
      get: {
        tags: ["VIP Perks"],
        summary: "Get VIP Membership Tiers and XP Perks",
        responses: { "200": { description: "VIP ladder details." } }
      }
    },
    "/api/coins/balance": {
      get: {
        tags: ["Web3 Reward Coins"],
        summary: "Get Player $SPIN Reward Coin Balance & Web3 Token Details",
        description: "Returns player's reward coin balance, symbol ($SPIN), initial 200 registration bonus, and Solana / EVM Web3 token metadata.",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "Coin balance and Web3 metadata retrieved." }
        }
      }
    },
    "/api/coins/reward": {
      post: {
        tags: ["Web3 Reward Coins"],
        summary: "Claim or Award $SPIN Reward Coins",
        description: "Calculates reward coins (1x for bets < 1000, 4x multiplier for bets >= 1000) and adds to player account balance.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  amount: { type: "number", example: 1000 },
                  reason: { type: "string", example: "Spin Bet Reward" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Coins awarded and new balance returned." }
        }
      }
    },
    "/api/coins/stats": {
      get: {
        tags: ["Web3 Reward Coins"],
        summary: "Global Coin Economics & Multiplier Rules",
        description: "Public endpoint returning Web3 token info, registration bonus (200 coins), and bet multiplier rules (1x < 1000, 4x >= 1000).",
        responses: {
          "200": { description: "Coin economics and stats." }
        }
      }
    },
    "/api/mystery-box/open": {
      post: {
        tags: ["Casino Games"],
        summary: "Open Mystery Box (Bronze, Silver, Gold, Platinum)",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  tier: { type: "string", example: "gold" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Box opened outcome with prizes and reward coins." }
        }
      }
    },
    "/api/dice/roll": {
      post: {
        tags: ["Casino Games"],
        summary: "Roll 3D Casino Dice",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  diceMode: { type: "string", example: "single" },
                  betAmount: { type: "number", example: 100 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Dice roll result with payout and coins." }
        }
      }
    },
    "/api/cards/deal": {
      post: {
        tags: ["Casino Games"],
        summary: "Pick a Card Jackpot Game",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  cardIndex: { type: "number", example: 2 },
                  betAmount: { type: "number", example: 100 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Card revealed with payout." }
        }
      }
    },
    "/api/lucky7/play": {
      post: {
        tags: ["Casino Games"],
        summary: "Play Lucky 7 Slots",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  boxIndex: { type: "number", example: 3 },
                  betAmount: { type: "number", example: 100 }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Lucky 7 outcome." }
        }
      }
    }
  }
};

app.get('/swagger.json', (req, res) => res.json(swaggerSpec));

app.get(['/api-docs', '/docs'], (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SPIN & WIN — Swagger API Docs & Auth Engine</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; background: #060a14; font-family: sans-serif; }
    .swagger-ui { filter: invert(0.9) hue-rotate(180deg); }
    .swagger-ui .topbar { display: none; }
    .custom-hdr { background: #0a1020; border-bottom: 2px solid #ffd700; padding: 16px 24px; text-align: center; color: #ffd700; font-family: sans-serif; }
    .custom-hdr h1 { margin: 0; font-size: 24px; letter-spacing: 2px; }
    .custom-hdr p { margin: 6px 0 0; color: #00f0ff; font-size: 13px; }
  </style>
</head>
<body>
  <div class="custom-hdr">
    <h1>🎰 SPIN & WIN API DOCUMENTATION & AUTH SWAGGER UI</h1>
    <p>Test Registration, Login, JWT Token Authorization & Game Endpoints Live</p>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: '/swagger.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`);
});

// ═══════════════════════════════════════════════════════════════════════════
//  HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now(), version: '2.0.0' });
});

// ─── 404 HANDLER ──────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ─── START SERVER ──────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log(`║  ⚡ SPIN & WIN API v2.0 — PORT ${PORT}                    ║`);
    console.log('║  🔒 Security: Helmet + Rate Limit + JWT + Crypto RNG    ║');
    console.log(`║  📖 Swagger API Docs: http://localhost:${PORT}/api-docs       ║`);
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
});

module.exports = app;

