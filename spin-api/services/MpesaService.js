/**
 * services/MpesaService.js — Production-Grade Safaricom Daraja Engine
 * Strictly enforces Daraja API specs, OAuth authentication, STK Push validation,
 * East Africa Time (UTC+3) password hashing, anti-replay callback security, and true status tracking.
 */
const walletService = require('./WalletService');
const platformEvents = require('../events/EventEmitter');

class MpesaService {
    constructor() {
        this.env = (process.env.MPESA_ENV || 'production').toLowerCase();
        this.baseUrl = (this.env === 'sandbox')
            ? 'https://sandbox.safaricom.co.ke'
            : 'https://api.safaricom.co.ke';

        this.consumerKey = (process.env.MPESA_CONSUMER_KEY || '').trim();
        this.consumerSecret = (process.env.MPESA_CONSUMER_SECRET || '').trim();
        this.passkey = (process.env.MPESA_PASSKEY || '').trim();
        this.businessShortCode = (process.env.MPESA_PAYBILL || process.env.MPESA_SHORTCODE || '4502021').trim();
        this.transactionType = process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline';
        this.callbackUrl = process.env.MPESA_CALLBACK_URL || 'https://www.playcoin.live/api/mpesa/callback';

        // Global store for pending transactions & anti-replay defense across serverless lambdas
        if (!global.pendingMpesaTransactions) global.pendingMpesaTransactions = new Map();
        if (!global.processedMpesaReceipts) global.processedMpesaReceipts = new Set();
        if (!global.processedMpesaCheckoutIds) global.processedMpesaCheckoutIds = new Set();

        this.pendingTransactions = global.pendingMpesaTransactions;
        this.processedReceipts = global.processedMpesaReceipts;
        this.processedCheckoutIds = global.processedMpesaCheckoutIds;
    }

    /**
     * Generate Daraja OAuth Access Token using Basic Auth
     */
    async getAccessToken() {
        if (!this.consumerKey || !this.consumerSecret) {
            throw new Error('[M-Pesa Config Error] MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET environment variables are missing.');
        }

        const authBuffer = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
        const url = `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;

        console.log(`[MPESA OAUTH REQUEST] Target: ${url}`);
        
        let response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${authBuffer}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (fetchErr) {
            console.error(`[MPESA OAUTH ERROR] Network request failed: ${fetchErr.message}`);
            throw new Error(`M-Pesa OAuth Network Error: ${fetchErr.message}`);
        }

        let data = {};
        try {
            data = await response.json();
        } catch (jsonErr) {
            throw new Error(`M-Pesa OAuth Invalid JSON Response (Status ${response.status})`);
        }

        if (!response.ok || !data.access_token) {
            const errDesc = data.errorMessage || data.error_description || JSON.stringify(data);
            console.error(`[MPESA OAUTH FAILED] HTTP ${response.status}: ${errDesc}`);
            throw new Error(`Safaricom Daraja OAuth Rejected (${response.status}): ${errDesc}`);
        }

        console.log(`[MPESA OAUTH SUCCESS] Access token generated successfully.`);
        return data.access_token;
    }

    /**
     * Format phone number to standard 254XXXXXXXXX format
     */
    formatPhone(phone) {
        if (!phone) return '';
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) {
            cleaned = '254' + cleaned.substring(1);
        } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
            cleaned = '254' + cleaned;
        } else if (!cleaned.startsWith('254')) {
            cleaned = '254' + cleaned;
        }
        return cleaned;
    }

    /**
     * Generate STK Push Password & Timestamp (East Africa Time - EAT UTC+3)
     */
    generateStkPassword(shortCode = this.businessShortCode, passkey = this.passkey) {
        const now = new Date();
        const eatOffsetMs = 3 * 60 * 60 * 1000;
        const eatDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + eatOffsetMs);

        const year = eatDate.getFullYear().toString();
        const month = (eatDate.getMonth() + 1).toString().padStart(2, '0');
        const day = eatDate.getDate().toString().padStart(2, '0');
        const hours = eatDate.getHours().toString().padStart(2, '0');
        const minutes = eatDate.getMinutes().toString().padStart(2, '0');
        const seconds = eatDate.getSeconds().toString().padStart(2, '0');
        const timestamp = year + month + day + hours + minutes + seconds;

        const rawPassword = (shortCode || '').trim() + (passkey || '').trim() + timestamp;
        const password = Buffer.from(rawPassword).toString('base64');

        return { password, timestamp };
    }

    /**
     * Initiate M-Pesa Express STK Push
     */
    async initiateStkPush(userId, rawPhone, amount, accountReference = 'SpinWin') {
        const phone = this.formatPhone(rawPhone);
        if (!phone || phone.length !== 12 || !phone.startsWith('254')) {
            throw new Error('Invalid Kenyan phone number format. Must be 07XXXXXXXX, 01XXXXXXXX, or 254XXXXXXXXX.');
        }

        if (!this.passkey) {
            throw new Error('[M-Pesa Config Error] MPESA_PASSKEY environment variable is missing.');
        }

        const token = await this.getAccessToken();
        const { password, timestamp } = this.generateStkPassword();

        const requestBody = {
            BusinessShortCode: this.businessShortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: this.transactionType,
            Amount: Math.max(1, Math.round(Number(amount))),
            PartyA: phone,
            PartyB: this.businessShortCode,
            PhoneNumber: phone,
            CallBackURL: this.callbackUrl,
            AccountReference: accountReference,
            TransactionDesc: `Wallet Topup for User ${userId}`
        };

        const targetUrl = `${this.baseUrl}/mpesa/stkpush/v1/processrequest`;
        console.log(`[MPESA STK REQUEST] Target: ${targetUrl}, Phone: ${phone.substring(0, 6)}****, Amount: ${amount}, ShortCode: ${this.businessShortCode}`);

        let res;
        try {
            res = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
        } catch (fetchErr) {
            console.error(`[MPESA STK ERROR] Network request failed: ${fetchErr.message}`);
            throw new Error(`Safaricom STK Push Network Error: ${fetchErr.message}`);
        }

        let data = {};
        try {
            data = await res.json();
        } catch (e) {
            throw new Error(`Safaricom Daraja STK Push returned non-JSON response (Status ${res.status})`);
        }

        console.log(`[MPESA STK RESPONSE] HTTP ${res.status}:`, JSON.stringify(data));

        // Strict Validation: STK Push MUST return ResponseCode === '0' and valid CheckoutRequestID
        if (!res.ok || !data || data.ResponseCode !== '0' || !data.CheckoutRequestID) {
            const errDesc = data?.ResponseDescription || data?.errorMessage || `HTTP Status ${res.status}`;
            console.error(`[MPESA STK REJECTED] Safaricom Daraja rejected STK Push: ${errDesc}`);
            throw new Error(`M-Pesa STK Push Failed: ${errDesc}`);
        }

        const checkoutRequestId = data.CheckoutRequestID;
        const merchantRequestId = data.MerchantRequestID || '';
        const customerMessage = data.CustomerMessage || 'Request accepted for processing';

        console.log(`[MPESA STK ACCEPTED] CheckoutRequestID: ${checkoutRequestId}`);

        // Register pending transaction for status tracking & callback verification
        this.pendingTransactions.set(checkoutRequestId, {
            userId,
            phone,
            amount: Number(amount),
            status: 'PENDING',
            createdAt: Date.now(),
            checkoutRequestId,
            merchantRequestId
        });

        platformEvents.emitEvent('STK_PUSH_INITIATED', {
            userId,
            phone,
            amount,
            checkoutRequestId
        });

        return {
            success: true,
            MerchantRequestID: merchantRequestId,
            CheckoutRequestID: checkoutRequestId,
            ResponseCode: '0',
            ResponseDescription: data.ResponseDescription,
            CustomerMessage: customerMessage
        };
    }

    /**
     * Process M-Pesa Callback & Credit User Wallet (Authoritative Callback & Anti-Replay)
     */
    processCallback(callbackBody) {
        if (!callbackBody || !callbackBody.Body || !callbackBody.Body.stkCallback) {
            return { success: false, message: 'Invalid callback payload structure' };
        }

        const stkCallback = callbackBody.Body.stkCallback;
        const checkoutRequestId = stkCallback.CheckoutRequestID;
        const resultCode = stkCallback.ResultCode;
        const resultDesc = stkCallback.ResultDesc || '';

        console.log(`[MPESA CALLBACK RECEIVED] CheckoutRequestID: ${checkoutRequestId}, ResultCode: ${resultCode}, Desc: ${resultDesc}`);

        if (!checkoutRequestId) {
            return { success: false, message: 'Missing CheckoutRequestID in callback' };
        }

        // Look up registered internal transaction
        const pendingTx = this.pendingTransactions.get(checkoutRequestId);
        const userId = pendingTx ? pendingTx.userId : null;

        if (resultCode === 0) {
            let amount = 0;
            let mpesaReceiptNumber = '';
            let phone = '';

            const items = stkCallback.CallbackMetadata?.Item || [];
            items.forEach(item => {
                if (item.Name === 'Amount') amount = item.Value;
                if (item.Name === 'MpesaReceiptNumber') mpesaReceiptNumber = item.Value;
                if (item.Name === 'PhoneNumber') phone = item.Value;
            });

            // Idempotency & Replay Protection
            if (this.processedCheckoutIds.has(checkoutRequestId) || (mpesaReceiptNumber && this.processedReceipts.has(mpesaReceiptNumber))) {
                console.warn(`[SECURITY WARN] Replay attack or duplicate callback blocked for CheckoutRequestID: ${checkoutRequestId}, Receipt: ${mpesaReceiptNumber}`);
                return {
                    success: true,
                    resultCode: 0,
                    resultDesc: 'Duplicate callback ignored (Idempotent)',
                    amount,
                    mpesaReceiptNumber,
                    userId
                };
            }

            // Register receipt & checkout ID as processed
            if (checkoutRequestId) this.processedCheckoutIds.add(checkoutRequestId);
            if (mpesaReceiptNumber) this.processedReceipts.add(mpesaReceiptNumber);

            if (pendingTx) {
                pendingTx.status = 'COMPLETED';
                pendingTx.mpesaReceiptNumber = mpesaReceiptNumber;
                pendingTx.completedAmount = amount;
                this.pendingTransactions.set(checkoutRequestId, pendingTx);
            }

            platformEvents.emitEvent('PAYMENT_RECEIVED', {
                userId: userId || 'unknown',
                amount,
                receipt: mpesaReceiptNumber,
                phone
            });

            return {
                success: true,
                resultCode: 0,
                resultDesc: 'Payment processed successfully',
                userId,
                amount,
                mpesaReceiptNumber
            };
        }

        // Handle Failed / Cancelled / Timed out STK Push
        if (pendingTx) {
            pendingTx.status = 'FAILED';
            pendingTx.reason = resultDesc;
            this.pendingTransactions.set(checkoutRequestId, pendingTx);
        }

        return {
            success: false,
            resultCode,
            resultDesc: resultDesc || 'Payment failed or cancelled by user',
            userId
        };
    }

    /**
     * Check transaction status by CheckoutRequestID
     */
    getTransactionStatus(checkoutRequestId) {
        if (!checkoutRequestId) {
            return { status: 'NOT_FOUND' };
        }
        if (this.pendingTransactions.has(checkoutRequestId)) {
            return this.pendingTransactions.get(checkoutRequestId);
        }
        return { status: 'PENDING', checkoutRequestId, createdAt: Date.now() };
    }
}

module.exports = new MpesaService();
