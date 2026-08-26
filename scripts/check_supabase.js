const fs = require('fs');

const SUPABASE_URL = 'https://tyznjnbpsobrapbamtbn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8i5lE6rUTJR2q-lw3tWmrA_6AsG2b23';

async function checkRestoredSupabase() {
    console.log('Testing connection to restored Supabase:', SUPABASE_URL);
    const tables = [
        'players', 'users', 'wallets', 'transactions', 'spins', 'spin_history', 
        'game_sessions', 'games', 'referrals', 'referral_commissions', 
        'withdrawals', 'deposits_log', 'live_chats', 'winner_broadcasts'
    ];
    
    for (const tbl of tables) {
        try {
            const url = SUPABASE_URL + '/rest/v1/' + tbl + '?select=*';
            const res = await fetch(url, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_KEY,
                    'Range': '0-99',
                    'Prefer': 'count=exact'
                }
            });
            if (res.ok) {
                const data = await res.json();
                const contentRange = res.headers.get('content-range');
                console.log(`[SUCCESS] Table '${tbl}': Status ${res.status}, Records fetched: ${data.length}, Range/Count: ${contentRange}`);
                if (data.length > 0) {
                    console.log(`  -> Columns:`, Object.keys(data[0]));
                    if (tbl === 'players' || tbl === 'users') {
                        console.log(`  -> Total ${tbl} records in range:`, data.length);
                        console.log('  -> Sample users:', data.slice(0, 5).map(u => ({
                            id: u.id,
                            email: u.email,
                            phone: u.phone_number || u.phone,
                            name: u.display_name || u.name,
                            created_at: u.created_at
                        })));
                    } else if (tbl === 'spins' || tbl === 'spin_history' || tbl === 'game_sessions' || tbl === 'games') {
                        console.log(`  -> Sample spin record:`, data.slice(0, 2));
                    }
                }
            } else {
                console.log(`[HTTP ${res.status}] Table '${tbl}': ${res.statusText}`);
            }
        } catch (e) {
            console.log(`[ERROR] Table '${tbl}':`, e.message);
        }
    }
}

checkRestoredSupabase();
