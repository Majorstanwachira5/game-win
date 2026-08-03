/**
 * auth.js — JWT Authentication Middleware
 * Handles player tokens and admin tokens separately
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'spinwin_dev_secret';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'admin_dev_secret';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ─── GENERATE PLAYER TOKEN ─────────────────────────────────────────────────
function generatePlayerToken(userId) {
    return jwt.sign({ userId, role: 'player' }, JWT_SECRET, { expiresIn: '24h' });
}

// ─── GENERATE ADMIN TOKEN ──────────────────────────────────────────────────
function generateAdminToken() {
    return jwt.sign({ role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '8h' });
}

// ─── VERIFY PLAYER TOKEN (middleware) ─────────────────────────────────────
function requirePlayerAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        // Allow demo mode: auto-issue a demo token
        req.userId = req.body?.userId || 'demo-user-1';
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token. Please refresh.' });
    }
}

// ─── VERIFY ADMIN TOKEN (middleware) ─────────────────────────────────────
function requireAdminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Admin authentication required.' });
    }

    try {
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
        if (decoded.role !== 'admin') throw new Error('Not admin');
        req.adminRole = true;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Admin access denied. Invalid credentials.' });
    }
}

// ─── ADMIN LOGIN ENDPOINT HANDLER ─────────────────────────────────────────
function adminLogin(req, res) {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        // Log failed attempt
        console.warn(`[SECURITY] Failed admin login from IP: ${req.ip}`);
        return res.status(403).json({ error: 'Invalid admin password.' });
    }
    const token = generateAdminToken();
    res.json({ success: true, token, message: 'Admin authenticated successfully.' });
}

// ─── PLAYER AUTO-LOGIN (demo mode) ────────────────────────────────────────
function playerAutoLogin(req, res) {
    const { userId } = req.body;
    const id = userId || ('user_' + Date.now());
    const token = generatePlayerToken(id);
    res.json({ success: true, token, userId: id });
}

module.exports = {
    generatePlayerToken,
    generateAdminToken,
    requirePlayerAuth,
    requireAdminAuth,
    adminLogin,
    playerAutoLogin,
};
