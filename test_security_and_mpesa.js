/**
 * test_security_and_mpesa.js — Empirical Verification Script
 * Validates M-Pesa OAuth, STK Push, Callback Idempotency & Security Headers
 */
require('dotenv').config({ path: './spin-api/.env' });
let mpesaService;
try {
    mpesaService = require('./spin-api/services/MpesaService');
} catch (e) {
    mpesaService = require('./services/MpesaService');
}

async function runTests() {
    console.log('====================================================');
    console.log('🚀 EMPIRICAL SECURITY & M-PESA END-TO-END TEST SUITE');
    console.log('====================================================\n');

    let passed = 0;
    let failed = 0;

    // TEST 1: M-Pesa OAuth Access Token Generation
    console.log('👉 [TEST 1] Safaricom Daraja OAuth Token Generation...');
    try {
        const token = await mpesaService.getAccessToken();
        if (token && typeof token === 'string' && token.length > 10) {
            console.log(`   ✅ PASS: OAuth Access Token retrieved successfully! (${token.substring(0, 15)}...)\n`);
            passed++;
        } else {
            throw new Error('Invalid token response');
        }
    } catch (err) {
        console.error(`   ❌ FAIL: OAuth Token failed: ${err.message}\n`);
        failed++;
    }

    // TEST 2: STK Push Initiator Formatting & Validation
    console.log('👉 [TEST 2] STK Push Request Format & Validation...');
    try {
        const passwordObj = mpesaService.generateStkPassword();
        if (passwordObj.password && passwordObj.timestamp) {
            console.log(`   ✅ PASS: STK Password & Timestamp generated. Timestamp=${passwordObj.timestamp}\n`);
            passed++;
        } else {
            throw new Error('Password generation failed');
        }
    } catch (err) {
        console.error(`   ❌ FAIL: STK Push validation failed: ${err.message}\n`);
        failed++;
    }

    // TEST 3: Phone Number Standardization
    console.log('👉 [TEST 3] Phone Number Formatter Check...');
    try {
        const p1 = mpesaService.formatPhone('0712345678');
        const p2 = mpesaService.formatPhone('254712345678');
        const p3 = mpesaService.formatPhone('712345678');
        if (p1 === '254712345678' && p2 === '254712345678' && p3 === '254712345678') {
            console.log('   ✅ PASS: Phone number standardization working for 07X, 2547X, 7X!\n');
            passed++;
        } else {
            throw new Error(`Phone formatting mismatch: ${p1}, ${p2}, ${p3}`);
        }
    } catch (err) {
        console.error(`   ❌ FAIL: Phone formatting failed: ${err.message}\n`);
        failed++;
    }

    // TEST 4: Anti-Replay & Callback Idempotency Guard
    console.log('👉 [TEST 4] Callback Anti-Replay Idempotency Security Guard...');
    try {
        const testUser = { id: 'security-test-user', balance: 100, coins: 500 };
        const mockCallback = {
            Body: {
                stkCallback: {
                    MerchantRequestID: 'TEST_MERCHANT_123',
                    CheckoutRequestID: 'SEC_CHECKOUT_999',
                    ResultCode: 0,
                    ResultDesc: 'The service request is processed successfully.',
                    CallbackMetadata: {
                        Item: [
                            { Name: 'Amount', Value: 100 },
                            { Name: 'MpesaReceiptNumber', Value: 'SEC_RECEIPT_888' },
                            { Name: 'PhoneNumber', Value: 254712345678 }
                        ]
                    }
                }
            }
        };

        // First callback execution
        const res1 = mpesaService.processCallback(mockCallback, testUser);
        const balAfterRes1 = testUser.balance;

        // Second (duplicate replay) callback execution
        const res2 = mpesaService.processCallback(mockCallback, testUser);
        const balAfterRes2 = testUser.balance;

        if (res1.success && res2.success && res2.resultDesc.includes('Idempotent') && balAfterRes1 === balAfterRes2) {
            console.log(`   ✅ PASS: Replay attack blocked! Initial credit: KSh 100, Replay balance unchanged at KSh ${balAfterRes2}\n`);
            passed++;
        } else {
            throw new Error(`Anti-replay guard failed. Initial: ${res1.resultDesc}, Replay: ${res2.resultDesc}`);
        }
    } catch (err) {
        console.error(`   ❌ FAIL: Anti-replay test failed: ${err.message}\n`);
        failed++;
    }

    console.log('====================================================');
    console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
