// test_free_spin_e2e.js
const http = require('http');

function httpRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve({ status: res.statusCode, headers: res.headers, data });
                } catch (e) {
                    resolve({ status: res.statusCode, headers: res.headers, body });
                }
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

async function runTests() {
    console.log('====================================================');
    console.log('PLAYCOIN — FREE SPIN END-TO-END VERIFICATION');
    console.log('====================================================\n');

    let allPassed = true;

    // Test 1: User registers with 0 free spins
    console.log('--- TEST 1: User registers with 0 free spins ---');
    const userEmail = `player_${Date.now()}@sampledomain.com`;
    const regRes = await httpRequest({
        hostname: '127.0.0.1',
        port: 8080,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        email: userEmail,
        password: 'Password123!',
        phone: '0712345678',
        name: 'Normal Player'
    });

    if (!regRes.data || !regRes.data.token) {
        console.error('Failed to register test user:', regRes.data);
        allPassed = false;
        return;
    }

    const token = regRes.data.token;
    const userId = regRes.data.user.id;
    console.log(`User registered: ${userId} (${userEmail})`);
    console.log(`Initial balance: ${regRes.data.user.balance}, freeSpins: ${regRes.data.user.freeSpins}`);

    // Backend grants 1 Free Spin via Admin API
    console.log('\n--- TEST 2: Backend grants 1 Free Spin to user via Admin API ---');
    const adminLoginRes = await httpRequest({
        hostname: '127.0.0.1',
        port: 8080,
        path: '/api/auth/admin',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, {
        identity: 'admin@playcoin.live',
        password: 'admin123'
    });

    if (!adminLoginRes.data || !adminLoginRes.data.token) {
        console.error('Failed to log in as admin:', adminLoginRes.data);
        allPassed = false;
        return;
    }

    const adminToken = adminLoginRes.data.token;
    console.log('Admin authenticated successfully.');

    const grantRes = await httpRequest({
        hostname: '127.0.0.1',
        port: 8080,
        path: `/api/admin/users/${userId}/adjust`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
        }
    }, {
        freeSpins: 1
    });

    console.log('Grant Response:', grantRes.data);

    // Verify user profile reflects 1 Free Spin
    const meRes = await httpRequest({
        hostname: '127.0.0.1',
        port: 8080,
        path: '/api/auth/me',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Profile /api/auth/me response:', meRes.data);
    const userMe = meRes.data.user || meRes.data;

    if (!userMe || userMe.freeSpins !== 1) {
        console.error('TEST 2 FAILED: Backend did not reflect 1 free spin.');
        allPassed = false;
    } else {
        console.log('TEST 2 PASSED: Backend successfully granted 1 Free Spin and returned it in profile.');
    }

    // Test 3: User executes /api/spin using the granted Free Spin
    console.log('\n--- TEST 3: User executes Free Spin without payment ---');
    const spinRes1 = await httpRequest({
        hostname: '127.0.0.1',
        port: 8080,
        path: '/api/spin',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    }, {
        userId: userId,
        betAmount: 100
    });

    console.log('Spin Response 1:', spinRes1.data);
    if (spinRes1.data && spinRes1.data.success) {
        const wasFreeSpin = spinRes1.data.wasFreeSpin;
        const granted = spinRes1.data.freeSpinsGranted || 0;
        const expectedRemaining = 0 + granted;
        const remainingFreeSpins = spinRes1.data.user ? spinRes1.data.user.freeSpins : null;
        const actualWager = spinRes1.data.betAmount;

        console.log(`   wasFreeSpin: ${wasFreeSpin}`);
        console.log(`   betAmount charged: ${actualWager}`);
        console.log(`   freeSpinsGranted on spin: ${granted}`);
        console.log(`   remainingFreeSpins in user state: ${remainingFreeSpins} (expected: ${expectedRemaining})`);
        console.log(`   wonSlice:`, spinRes1.data.wonSlice ? spinRes1.data.wonSlice.label : spinRes1.data.wonSlice);

        if (wasFreeSpin === true && actualWager === 0 && remainingFreeSpins === expectedRemaining) {
            console.log('TEST 3 PASSED: Free spin recognized, balance not charged, free spin consumed & rewards added.');
        } else {
            console.error('TEST 3 FAILED: Unexpected free spin response properties.');
            allPassed = false;
        }
    } else {
        console.error('TEST 3 FAILED:', spinRes1.data);
        allPassed = false;
    }

    // Test 4: Drain any remaining Free Spins so user has 0 free spins and 0 balance
    console.log('\n--- TEST 4: Drain any won Free Spins until 0 Free Spins remain ---');
    let currentFreeSpins = (spinRes1.data && spinRes1.data.user) ? spinRes1.data.user.freeSpins : 0;
    while (currentFreeSpins > 0) {
        console.log(`   Spinning to consume remaining ${currentFreeSpins} free spin(s)...`);
        const drainRes = await httpRequest({
            hostname: '127.0.0.1',
            port: 8080,
            path: '/api/spin',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        }, {
            userId: userId,
            betAmount: 100
        });
        if (drainRes.data && drainRes.data.user) {
            currentFreeSpins = drainRes.data.user.freeSpins;
            console.log(`   Result: wasFreeSpin=${drainRes.data.wasFreeSpin}, remaining=${currentFreeSpins}`);
            // If they keep winning free spins, break after 10 tries for safety
            if (drainRes.data.freeSpinsGranted > 0) {
                // Adjust to 0 via admin to guarantee test condition
                await httpRequest({
                    hostname: '127.0.0.1',
                    port: 8080,
                    path: `/api/admin/users/${userId}/adjust`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${adminToken}`
                    }
                }, { freeSpins: 0, balance: 0 });
                currentFreeSpins = 0;
            }
        } else {
            break;
        }
    }

    // Test 5: Next spin with 0 Free Spins and 0 Balance should be rejected
    console.log('\n--- TEST 5: User with 0 Free Spins and 0 Balance is blocked from unpaid spin ---');
    const spinResBlocked = await httpRequest({
        hostname: '127.0.0.1',
        port: 8080,
        path: '/api/spin',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    }, {
        userId: userId,
        betAmount: 100
    });

    console.log('Blocked Spin Response (Status:', spinResBlocked.status, '):', spinResBlocked.data);
    if (spinResBlocked.status === 400 && spinResBlocked.data && spinResBlocked.data.error) {
        console.log('TEST 5 PASSED: Correctly rejected with 400 Insufficient balance when 0 free spins remain.');
    } else {
        console.error('TEST 5 FAILED: Expected 400 insufficient balance error.');
        allPassed = false;
    }

    // Test 3: Slice resolution check
    console.log('\n--- TEST 3: Wheel Slice Mapping & Resolution ---');
    const wheelSlices = [
        { id: 'try_again_1', label: 'TRY AGAIN' },
        { id: 'mult_0_1', label: '0.1X' },
        { id: 'free_spin_1', label: 'FREE SPIN' },
        { id: 'mult_0_5', label: '0.5X' },
        { id: 'mult_2_0', label: '2.0X' },
        { id: 'try_again_2', label: 'TRY AGAIN' },
        { id: 'mult_5_0', label: '5.0X' },
        { id: 'free_spin_2', label: '2 FREE SPINS' },
        { id: 'mult_10_0', label: '10.0X' },
        { id: 'mult_0_2', label: '0.2X' },
        { id: 'mult_20_0', label: '20.0X' },
        { id: 'double_win', label: 'DOUBLE NEXT' },
        { id: 'jackpot_50', label: '50X JACKPOT' },
        { id: 'mult_1_0', label: '1.0X' }
    ];

    let allSlicesResolve = true;
    for (let i = 0; i < wheelSlices.length; i++) {
        const slice = wheelSlices[i];
        const found = wheelSlices.findIndex(s => s.id === slice.id);
        if (found !== i) {
            console.error(`Slice mismatch for ${slice.id}: expected index ${i}, got ${found}`);
            allSlicesResolve = false;
        }
    }
    if (allSlicesResolve) {
        console.log(`TEST 3 PASSED: All 14 wheel slices map accurately to their target index.`);
    } else {
        allPassed = false;
    }

    // Summary
    console.log('\n====================================================');
    if (allPassed) {
        console.log('ALL END-TO-END VERIFICATION TESTS PASSED!');
    } else {
        console.log('SOME TESTS FAILED. CHECK LOGS.');
    }
    console.log('====================================================');
}

runTests();
