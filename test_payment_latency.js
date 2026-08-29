// test_payment_latency.js
const http = require('http');

function httpRequest(options, postData) {
    const start = performance.now();
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                const duration = performance.now() - start;
                try {
                    const data = JSON.parse(body);
                    resolve({ status: res.statusCode, duration, data });
                } catch (e) {
                    resolve({ status: res.statusCode, duration, body });
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

async function runBenchmark() {
    console.log('====================================================');
    console.log('⚡ PLAYCOIN — PAYMENT & SPIN LATENCY AUDIT');
    console.log('====================================================\n');

    // 1. Register a test user
    const userEmail = `perf_${Date.now()}@sampledomain.com`;
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
        name: 'Perf User'
    });

    const token = regRes.data.token;
    const userId = regRes.data.user.id;
    console.log(`[AUTH] User registered in ${regRes.duration.toFixed(2)}ms (ID: ${userId})`);

    // 2. Measure Deposit STK Push Initiation Latency
    console.log('\n--- 1. Testing /api/deposit initiation latency ---');
    const depRes = await httpRequest({
        hostname: '127.0.0.1',
        port: 8080,
        path: '/api/deposit',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    }, {
        userId,
        amount: 100,
        phone: '0712345678',
        gameAction: 'spin'
    });
    console.log(`[DEPOSIT] /api/deposit response in ${depRes.duration.toFixed(2)}ms`);
    console.log('   Response:', depRes.data);

    const checkoutRequestId = depRes.data.CheckoutRequestID || 'ws_CO_mock_test_123';

    // 3. Measure Deposit Status Polling Latency
    console.log('\n--- 2. Testing /api/deposit/status polling latency ---');
    const statusRes = await httpRequest({
        hostname: '127.0.0.1',
        port: 8080,
        path: `/api/deposit/status/${checkoutRequestId}`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    console.log(`[STATUS] /api/deposit/status/:id response in ${statusRes.duration.toFixed(2)}ms`);
    console.log('   Status:', statusRes.data.status);

    // 4. Simulate M-Pesa Callback / Confirmation Latency
    console.log('\n--- 3. Testing Callback / Deposit Settlement Latency ---');
    const callbackPayload = {
        Body: {
            stkCallback: {
                MerchantRequestID: depRes.data.MerchantRequestID || 'MR_123',
                CheckoutRequestID: checkoutRequestId,
                ResultCode: 0,
                ResultDesc: 'The service request is processed successfully.',
                CallbackMetadata: {
                    Item: [
                        { Name: 'Amount', Value: 100 },
                        { Name: 'MpesaReceiptNumber', Value: 'QGH' + Date.now().toString().slice(-7) },
                        { Name: 'TransactionDate', Value: 20260829120000 },
                        { Name: 'PhoneNumber', Value: 254712345678 }
                    ]
                }
            }
        }
    };

    const cbRes = await httpRequest({
        hostname: '127.0.0.1',
        port: 8080,
        path: '/api/mpesa/callback',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, callbackPayload);
    console.log(`[CALLBACK] /api/mpesa/callback processed in ${cbRes.duration.toFixed(2)}ms`);

    // 5. Measure Status Poll after Confirmation
    console.log('\n--- 4. Testing Post-Confirmation Status Poll Latency ---');
    const confirmedStatusRes = await httpRequest({
        hostname: '127.0.0.1',
        port: 8080,
        path: `/api/deposit/status/${checkoutRequestId}`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    console.log(`[STATUS CONFIRMED] response in ${confirmedStatusRes.duration.toFixed(2)}ms`);
    console.log('   Confirmed Status:', confirmedStatusRes.data.status);
    console.log('   User Balance:', confirmedStatusRes.data.user ? confirmedStatusRes.data.user.balance : 'N/A');

    // 6. Measure /api/spin Execution Latency
    console.log('\n--- 5. Testing /api/spin Execution Latency with newly deposited balance ---');
    const spinRes = await httpRequest({
        hostname: '127.0.0.1',
        port: 8080,
        path: '/api/spin',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    }, {
        userId,
        betAmount: 100
    });
    console.log(`[SPIN] /api/spin response in ${spinRes.duration.toFixed(2)}ms`);
    console.log('   Spin Result:', spinRes.data.wonSlice ? spinRes.data.wonSlice.label : spinRes.data.wonSlice);
    console.log('   Remaining Balance:', spinRes.data.user ? spinRes.data.user.balance : 'N/A');

    console.log('\n====================================================');
    console.log('BENCHMARK COMPLETE');
    console.log('====================================================');
}

runBenchmark();
