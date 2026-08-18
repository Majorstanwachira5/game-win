const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Service Health Check
app.get('/health', (req, res) => {
    res.json({
        service: 'spin-admin',
        status: 'healthy',
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🛡️ RAM ADMIN CONTROL CENTER RUNNING ON HTTP://LOCALHOST:${PORT}`);
    console.log(`=======================================================`);
});

