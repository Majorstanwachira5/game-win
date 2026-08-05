const app = require('../spin-api/server.js');

module.exports = (req, res) => {
    if (req.url.startsWith('/api/index')) {
        req.url = req.url.replace('/api/index', '/api');
    }
    if (!req.url.startsWith('/api') && !req.url.startsWith('/health')) {
        req.url = '/api' + req.url;
    }
    return app(req, res);
};
