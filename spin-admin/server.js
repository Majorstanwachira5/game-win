const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`📊 SPIN & WIN ADMIN PORTAL RUNNING ON HTTP://LOCALHOST:${PORT}`);
    console.log(`=======================================================`);
});
