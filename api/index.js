const app = require('../spin-api/server.js');

module.exports = (req, res) => {
    try {
        if (typeof req.body === 'string' && req.body.trim()) {
            try { req.body = JSON.parse(req.body); } catch (e) {}
        } else if (Buffer.isBuffer(req.body)) {
            try { req.body = JSON.parse(req.body.toString('utf-8')); } catch (e) {}
        }
    } catch (e) {}

    if (req.url.startsWith('/api/index')) {
        req.url = req.url.replace('/api/index', '/api');
    }
    if (!req.url.startsWith('/api') && !req.url.startsWith('/health')) {
        req.url = '/api' + req.url;
    }
    return app(req, res);
};
