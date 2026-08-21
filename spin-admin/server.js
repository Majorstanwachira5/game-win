const express = require('express');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3001;
const API_TARGET = process.env.API_URL || process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' && process.env.DB_HOST === 'spin-db' ? 'http://spin-api:8080' : 'http://localhost:8080');

// Service Health Check
app.get('/health', (req, res) => {
    res.json({
        service: 'spin-admin',
        status: 'healthy',
        port: PORT,
        apiTarget: API_TARGET,
        timestamp: new Date().toISOString()
    });
});

// Proxy /api/* requests to backend API (Port 8080 / spin-api)
app.use('/api', (req, res) => {
    const targetUrl = new URL('/api' + req.url, API_TARGET);
    const proxyReq = http.request(targetUrl, {
        method: req.method,
        headers: { ...req.headers, host: targetUrl.host }
    }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        res.status(502).json({ success: false, error: 'Backend API unreachable: ' + err.message });
    });

    req.pipe(proxyReq, { end: true });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🛡️ RAM ADMIN CONTROL CENTER RUNNING ON HTTP://LOCALHOST:${PORT}`);
    console.log(`📡 PROXYING /api/* -> ${API_TARGET}`);
    console.log(`=======================================================`);
});
