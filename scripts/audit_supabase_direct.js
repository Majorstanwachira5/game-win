const fs = require('fs');
const path = require('path');

// Manually parse .env
const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0 && !line.startsWith('#')) {
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        env[key] = val;
    }
});

const SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || 'https://tyznjnbpsobrapbamtbn.supabase.co';
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function checkSupabase() {
    console.log('Connecting to Supabase:', SUPABASE_URL);

    async function queryTable(table) {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });
            if (!res.ok) {
                return { error: `HTTP ${res.status}: ${res.statusText}` };
            }
            return await res.json();
        } catch(e) {
            return { error: e.message };
        }
    }

    const players = await queryTable('players');
    console.log('\n--- SUPABASE: players ---');
    console.log('Count:', Array.isArray(players) ? players.length : players);

    const wallets = await queryTable('wallets');
    console.log('\n--- SUPABASE: wallets ---');
    console.log('Count:', Array.isArray(wallets) ? wallets.length : wallets);

    const transactions = await queryTable('transactions');
    console.log('\n--- SUPABASE: transactions ---');
    console.log('Count:', Array.isArray(transactions) ? transactions.length : transactions);

    const ledger = await queryTable('wallet_ledger');
    console.log('\n--- SUPABASE: wallet_ledger ---');
    console.log('Count:', Array.isArray(ledger) ? ledger.length : ledger);

    if (Array.isArray(players)) {
        console.log('\nSample players from Supabase:');
        console.table(players.slice(0, 10).map(p => ({
            id: p.id,
            name: p.display_name,
            phone: p.phone_number,
            email: p.email,
            balance: p.balance,
            coins: p.coins,
            active: p.is_active
        })));
    }
}

checkSupabase().catch(console.error);
