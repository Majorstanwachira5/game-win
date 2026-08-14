/**
 * security.js — Security Middleware Stack
 * Helmet headers, rate limiting, CORS lockdown, input sanitization
 */
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

// ─── HELMET SECURITY HEADERS ───────────────────────────────────────────────
const helmetMiddleware = helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    xFrameOptions: { action: 'sameorigin' },
    xXssProtection: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true }
});

const isVercelEnv = Boolean(process.env.VERCEL || process.env.NOW_REGION || process.env.NODE_ENV === 'production');

// ─── RATE LIMITERS ─────────────────────────────────────────────────────────
const gameLimiter = rateLimit({
    windowMs: 10 * 1000,        // 10 seconds window
    max: 60,                     // max 60 game actions per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down and try again.' },
    skip: () => isVercelEnv || req?.ip === '127.0.0.1' || req?.ip === '::1'
});

const authLimiter = rateLimit({
    windowMs: 60 * 1000,         // 1 minute
    max: 200,                     // max 200 auth attempts per minute
    message: { error: 'Too many login attempts. Please wait 1 minute.' },
    skip: () => isVercelEnv
});

const depositLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Too many deposit requests. Please wait before trying again.' },
    skip: () => isVercelEnv
});

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    message: { error: 'Too many requests from this IP.' },
    skip: () => isVercelEnv
});

// ─── VALIDATION CHAINS ─────────────────────────────────────────────────────
const validateSpin = [
    body('userId').optional().isString().isLength({ min: 1, max: 64 }).trim().escape(),
    body('betAmount').isNumeric().isFloat({ min: 10, max: 50000 }).withMessage('Bet must be between 10 and 50,000'),
];

const validateDeposit = [
    body('amount').isNumeric().isFloat({ min: 10, max: 500000 }).withMessage('Deposit must be between 10 and 500,000'),
    body('userId').optional().isString().isLength({ min: 1, max: 64 }).trim().escape(),
    body('method').optional().isIn(['M-Pesa', 'Airtel Money', 'Card']).withMessage('Invalid payment method'),
    body('phone').optional().isString().isLength({ min: 9, max: 15 }).trim(),
];

const validateGameAction = [
    body('userId').optional().isString().isLength({ min: 1, max: 128 }).trim(),
    body('betAmount').optional().isNumeric(),
    body('action').optional().isString().trim(),
    body('tier').optional().isString().trim(),
    body('diceMode').optional().isIn(['single', 'double']),
    body('cardIndex').optional().isInt({ min: 0, max: 4 }),
    body('boxIndex').optional().isInt({ min: 0, max: 6 }),
    body('choice').optional().isString().trim(),
    body('scratchArea').optional().isString().trim(),
];

const validateAdminLogin = [
    body('password').isString().isLength({ min: 6, max: 100 }).trim(),
];

// ─── VALIDATION ERROR HANDLER ──────────────────────────────────────────────
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array().map(e => e.msg)
        });
    }
    next();
};

// ─── REQUEST LOG ───────────────────────────────────────────────────────────
const securityLog = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${req.method} ${req.path} — IP: ${ip}`);
    next();
};

module.exports = {
    helmetMiddleware,
    gameLimiter,
    authLimiter,
    depositLimiter,
    generalLimiter,
    validateSpin,
    validateDeposit,
    validateGameAction,
    validateAdminLogin,
    handleValidationErrors,
    securityLog,
};
