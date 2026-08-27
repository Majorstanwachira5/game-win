const API_BASE = 'http://localhost:8080';

async function auditDatabase() {
    console.log('====================================================');
    console.log('PLAYCOIN — LIVE DATABASE & WALLET ECONOMICS AUDIT');
    console.log('====================================================\n');

    // 1. Authenticate as Admin
    const authRes = await fetch(`${API_BASE}/api/auth/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@playcoin.live', password: 'admin123password' })
    });
    const authData = await authRes.json();
    if (!authData.token) {
        console.error('Failed to authenticate as admin:', authData);
        return;
    }
    const adminToken = authData.token;

    // 2. Fetch Users
    const usersRes = await fetch(`${API_BASE}/api/admin/users?limit=5000`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const usersData = await usersRes.json();
    const users = usersData.users || [];

    // 3. Fetch Overview / Metrics
    const overviewRes = await fetch(`${API_BASE}/api/admin/overview`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const overview = await overviewRes.json();

    // 4. Fetch Withdrawals
    const withRes = await fetch(`${API_BASE}/api/admin/withdrawals?status=all`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const withData = await withRes.json();
    const withdrawals = withData.withdrawals || [];

    // 5. Fetch Payments
    const payRes = await fetch(`${API_BASE}/api/admin/payments?limit=5000`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const payData = await payRes.json();
    const payments = payData.payments || [];

    // 6. Fetch Ledger
    const ledgerRes = await fetch(`${API_BASE}/api/admin/ledger?limit=5000`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const ledgerData = await ledgerRes.json();
    const ledger = ledgerData.ledger || [];

    // Detailed user balance extraction
    const cashBalances = [];
    const coinBalances = [];
    const referralBalances = [];
    let totalCashLiability = 0;
    let totalCoins = 0;
    let totalReferralLiability = 0;

    let usersWithCash = 0;
    let usersAbove500 = 0;
    let usersAbove1000 = 0;
    let usersAbove5000 = 0;
    let usersAbove10000 = 0;

    const userTable = [];

    for (const u of users) {
        const cash = Number(u.balance || 0);
        const coins = Number(u.coins || 0);
        const refBal = Number(u.referralBalance || 0);

        cashBalances.push(cash);
        coinBalances.push(coins);
        referralBalances.push(refBal);

        totalCashLiability += cash;
        totalCoins += coins;
        totalReferralLiability += refBal;

        if (cash > 0) usersWithCash++;
        if (cash >= 500) usersAbove500++;
        if (cash >= 1000) usersAbove1000++;
        if (cash >= 5000) usersAbove5000++;
        if (cash >= 10000) usersAbove10000++;

        userTable.push({
            id: u.id,
            name: u.name || u.displayName || u.email || 'N/A',
            phone: u.phone || 'N/A',
            cashBalance: cash,
            coinBalance: coins,
            referralBalance: refBal,
            totalDeposited: u.totalDeposited || 0,
            totalWithdrawn: u.totalWithdrawn || 0,
            vipTier: u.vipTier || 'BRONZE'
        });
    }

    // Sort cash balances for statistics
    cashBalances.sort((a, b) => a - b);

    const highestCash = cashBalances.length ? cashBalances[cashBalances.length - 1] : 0;
    const lowestCash = cashBalances.length ? cashBalances[0] : 0;
    const avgCash = cashBalances.length ? (totalCashLiability / cashBalances.length) : 0;
    
    let medianCash = 0;
    if (cashBalances.length > 0) {
        const mid = Math.floor(cashBalances.length / 2);
        medianCash = cashBalances.length % 2 !== 0 ? cashBalances[mid] : (cashBalances[mid - 1] + cashBalances[mid]) / 2;
    }

    // Pending vs Completed Withdrawals
    const pendingWithdrawals = withdrawals.filter(w => (w.status || '').toUpperCase() === 'PENDING');
    const completedWithdrawals = withdrawals.filter(w => ['PAID', 'APPROVED', 'COMPLETED'].includes((w.status || '').toUpperCase()));
    const rejectedWithdrawals = withdrawals.filter(w => (w.status || '').toUpperCase() === 'REJECTED');

    const totalPendingAmount = pendingWithdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0);
    const totalPaidAmount = completedWithdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0);

    // Print Pre-Change Report
    console.log('--- 1. AUDIT REPORT: CORE USER & WALLET METRICS ---');
    console.log(`Total Users: ${users.length}`);
    console.log(`Users with Cash Balance (> 0): ${usersWithCash}`);
    console.log(`Highest Wallet Balance: KSh ${highestCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Lowest Wallet Balance: KSh ${lowestCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Average Wallet Balance: KSh ${avgCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Median Wallet Balance: KSh ${medianCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Total Wallet Cash Liability: KSh ${totalCashLiability.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Total PLAYCOIN Coins: ${totalCoins.toLocaleString('en-US')} Coins`);
    console.log(`Total Virtual Referral Balance: KSh ${totalReferralLiability.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

    console.log('\n--- 2. BALANCE DISTRIBUTION ---');
    console.log(`Users with Cash >= KSh 500: ${usersAbove500}`);
    console.log(`Users with Cash >= KSh 1,000: ${usersAbove1000}`);
    console.log(`Users with Cash >= KSh 5,000: ${usersAbove5000}`);
    console.log(`Users with Cash >= KSh 10,000: ${usersAbove10000}`);

    console.log('\n--- 3. WITHDRAWAL QUEUE & HISTORY ---');
    console.log(`Total Withdrawal Tickets: ${withdrawals.length}`);
    console.log(`Pending Withdrawals: ${pendingWithdrawals.length} (Total KSh ${totalPendingAmount.toLocaleString('en-US')})`);
    console.log(`Completed / Paid Withdrawals: ${completedWithdrawals.length} (Total KSh ${totalPaidAmount.toLocaleString('en-US')})`);
    console.log(`Rejected Withdrawals: ${rejectedWithdrawals.length}`);

    console.log('\n--- 4. TOP 15 WALLET HOLDERS ---');
    userTable.sort((a, b) => b.cashBalance - a.cashBalance);
    console.table(userTable.slice(0, 15));

    console.log('\n--- 5. PROPOSED 30% DRY-RUN SIMULATION (FOR HIGH-BALANCE USERS > KSh 1,000) ---');
    const dryRunTable = [];
    let simulatedReduction = 0;

    for (const u of userTable) {
        if (u.cashBalance >= 1000) {
            const oldBal = u.cashBalance;
            // 30% adjustment for balances > 1000
            const adj = Math.round(oldBal * 0.30 * 100) / 100;
            const newBal = Math.round((oldBal - adj) * 100) / 100;
            simulatedReduction += adj;
            dryRunTable.push({
                User: u.name,
                Phone: u.phone,
                'Old Balance': `KSh ${oldBal.toLocaleString()}`,
                'Adj %': '30%',
                Adjustment: `-KSh ${adj.toLocaleString()}`,
                'New Balance': `KSh ${newBal.toLocaleString()}`,
                'Total Dep.': `KSh ${u.totalDeposited.toLocaleString()}`
            });
        }
    }
    console.table(dryRunTable.slice(0, 15));
    console.log(`Total Simulated Economic Reduction: KSh ${simulatedReduction.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`Simulated New Wallet Liability: KSh ${(totalCashLiability - simulatedReduction).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
}

auditDatabase().catch(console.error);
