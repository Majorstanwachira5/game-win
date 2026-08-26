const assert = require('assert');

const API_BASE = 'http://localhost:8080';

async function runTests() {
    console.log('====================================================');
    console.log('PLAYCOIN — MOBILE WALLET WITHDRAWAL REGRESSION SUITE');
    console.log('====================================================\n');

    let passed = 0;
    let failed = 0;

    function assertTest(name, condition, details = '') {
        if (condition) {
            console.log(`[PASS] ${name} ${details ? '(' + details + ')' : ''}`);
            passed++;
        } else {
            console.error(`[FAIL] ${name} ${details ? '(' + details + ')' : ''}`);
            failed++;
        }
    }

    // 1. Create / login a test user
    const testEmail = `withdraw_test_${Date.now()}@playcoin.live`;
    const testPhone = `07${Math.floor(10000000 + Math.random() * 90000000)}`;

    const regRes = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, phone: testPhone, password: 'password123', name: 'Withdraw Tester' })
    });
    const regData = await regRes.json();
    assertTest('User Registration', regData.success && regData.token, `Token received: ${!!regData.token}`);
    const token = regData.token;

    // Login as Admin to credit balances for testing
    const adminLogin = await fetch(`${API_BASE}/api/auth/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@playcoin.live', password: 'admin123password' })
    });
    const adminData = await adminLogin.json();
    const adminToken = adminData.token;
    assertTest('Admin Auth for Test Setup', !!adminToken);

    // Helper to set user balance via admin
    async function setBalance(targetBal) {
        const userRes = await fetch(`${API_BASE}/api/user/${regData.user.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const userData = await userRes.json();
        const cur = Number(userData.balance !== undefined ? userData.balance : (userData.user ? userData.user.balance : 0));
        const delta = targetBal - cur;
        const res = await fetch(`${API_BASE}/api/admin/users/${regData.user.id}/adjust`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ balanceAdjust: delta, note: 'Test Setup' })
        });
        return await res.json();
    }

    // Helper to attempt user withdrawal
    async function withdraw(amount) {
        const res = await fetch(`${API_BASE}/api/wallet/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ phone: testPhone, amount: amount })
        });
        return await res.json();
    }

    // TEST 1: User with KSh 500 attempts withdrawal of KSh 500
    console.log('\n--- TEST SCENARIO 1: Balance KSh 500 ---');
    await setBalance(500);
    const res500 = await withdraw(500);
    assertTest('Balance KSh 500 rejected (min rule)', res500.success === false, res500.error);
    assertTest('Error message contains 1,000 rule', res500.error && res500.error.includes('1,000'), res500.error);

    // TEST 2: User with KSh 999 attempts withdrawal of KSh 999
    console.log('\n--- TEST SCENARIO 2: Balance KSh 999 ---');
    await setBalance(999);
    const res999 = await withdraw(999);
    assertTest('Balance KSh 999 rejected (min rule)', res999.success === false, res999.error);

    // TEST 3: User with KSh 1,000 attempts withdrawal of KSh 1,000
    console.log('\n--- TEST SCENARIO 3: Balance KSh 1,000 ---');
    await setBalance(1000);
    const res1000 = await withdraw(1000);
    assertTest('Balance KSh 1,000 accepted', res1000.success === true, `Ticket: ${res1000.ticket ? res1000.ticket.id : 'N/A'}`);
    assertTest('Balance deducted to 0', res1000.balance === 0, `Remaining balance: KSh ${res1000.balance}`);

    // TEST 4: Pending withdrawal prevention
    console.log('\n--- TEST SCENARIO 4: Duplicate Pending Withdrawal Prevention ---');
    await setBalance(2000);
    const resPending = await withdraw(1000);
    assertTest('Duplicate withdrawal blocked while pending in queue', resPending.success === false, resPending.error);

    // Admin approves/clears pending ticket so we can test more
    if (res1000.ticket) {
        const appRes = await fetch(`${API_BASE}/api/admin/withdrawals/${res1000.ticket.id}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ action: 'PAID' })
        });
        const appData = await appRes.json();
        assertTest('Admin clears pending ticket', appData.success === true);
    }

    // TEST 5: User with KSh 1,500 attempts withdrawal of KSh 2,000 (exceeds balance)
    console.log('\n--- TEST SCENARIO 5: Balance KSh 1,500 ---');
    await setBalance(1500);
    const resExceed = await withdraw(2000);
    assertTest('Withdrawal exceeding balance rejected', resExceed.success === false && resExceed.error.includes('Insufficient funds'), resExceed.error);

    const res1500 = await withdraw(1500);
    assertTest('Withdrawal of KSh 1,500 accepted', res1500.success === true, `Ticket: ${res1500.ticket ? res1500.ticket.id : 'N/A'}`);

    console.log('\n====================================================');
    console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
    console.log('====================================================');
}

runTests().catch(console.error);
