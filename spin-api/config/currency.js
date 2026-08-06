/**
 * config/currency.js — PlayCoin ($PLAY) Central Configuration
 * Treats PlayCoin as a first-class digital asset configurable for Web3 (TRON / Coinbase / Telegram)
 */
module.exports = {
    currencyCode: process.env.PLAYCOIN_CODE || 'PLAY',
    currencyName: process.env.PLAYCOIN_NAME || 'PlayCoin',
    symbol: process.env.PLAYCOIN_SYMBOL || '$PLAY',
    decimals: 4,
    network: process.env.PLAYCOIN_NETWORK || 'OFFCHAIN', // Later: 'TRON_MAINNET' / 'BASE' / 'TELEGRAM_TON'
    contractAddress: process.env.PLAYCOIN_CONTRACT_ADDRESS || 'TPlayCoinsVirtualBridge2026',
    status: 'SETTLED',
    
    // Feature Flags & Environment Overrides
    features: {
        web3BridgeEnabled: process.env.FEATURE_WEB3_BRIDGE === 'true' || false,
        tronAutoMint: process.env.FEATURE_TRON_AUTOMINT === 'true' || false,
        telegramMiniAppSync: process.env.FEATURE_TELEGRAM_SYNC === 'true' || true,
        coinbasePayEnabled: process.env.FEATURE_COINBASE_PAY === 'true' || false,
        darajaMpesaEnabled: process.env.FEATURE_DARAJA_MPESA === 'true' || true
    },

    // Default Starting Balances
    defaultBalances: {
        playCoins: 200.0,
        cashBalance: 0.00,
        testerCoins: 250000.00,
        testerCash: 250000.00
    }
};
