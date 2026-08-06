# 🎰 SPIN & WIN PLATFORM — WEB3 & SERVICE INTEGRATION ARCHITECTURE

## Overview
The Spin & Win platform backend has been refactored into a decoupled, modular layered architecture. This document details the clean extension points available for future TRON, Telegram TON Mini App, Coinbase, and Daraja M-Pesa integrations.

---

## 🏗️ Layered Architecture Overview

```
Frontend (HTML / JS / Mobile PWA)
  │
  ▼
API Routing Layer (Express.js / Security Middleware)
  │
  ▼
Controllers / Game Engines (Wheel, Dice, Cards, Mystery Box, Lucky 7, Coin Flip, Scratch)
  │
  ├──► RewardEngine (services/RewardEngine.js)
  │      ├── VIP Multipliers & XP Calculation
  │      └── PlayCoin ($PLAY) Asset Conversion
  │
  ├──► WalletService (services/WalletService.js)
  │      ├── Balance Credit / Debit & Validation
  │      └── Immutable Web3-Ready Double-Entry Ledger
  │
  ├──► BlockchainAdapter (adapters/BlockchainAdapter.js)
  │      ├── TRON Mainnet / Virtual Bridge
  │      ├── Telegram TON Settlement Adapter
  │      └── Coinbase On-Chain Minting & Wallets
  │
  └──► PlatformEventBus (events/EventEmitter.js)
         ├── Real-time Analytics & Winner Streams
         └── Webhook Dispatchers
```

---

## 🔌 Extension Points for Future Modules

### 1. BlockchainAdapter (`spin-api/adapters/BlockchainAdapter.js`)
- **`createWallet(userId, chain)`**: Extend to generate real TRON / Base / TON Web3 wallet keypairs via `@tronweb3/tronwallet-adapter` or `@coinbase/wallet-sdk`.
- **`transferTokens(fromUserId, toAddress, amount, assetType)`**: Connect to smart contract ABI `mint(address to, uint256 amount)` on TRON / Base mainnets.
- **`verifyTransaction(txHash)`**: Query TRONGRID or Base RPC node for on-chain block confirmations.

### 2. WalletService (`spin-api/services/WalletService.js`)
- Standardized double-entry ledger output includes `blockchain_network`, `blockchain_hash`, `wallet_address`, `token_symbol`, `smart_contract`, and `metadata`.
- Safe off-chain settlement with seamless fallback to TRON on-chain state.

### 3. RewardEngine (`spin-api/services/RewardEngine.js`)
- Centralized PlayCoin ($PLAY) bonus calculation rules (`calculateRewardCoins`) and VIP multipliers (`VIP_MULTIPLIERS`).
- Modular rewards allow adding token staking yields or referral bonus percentages without changing game controllers.

### 4. PlatformEventBus (`spin-api/events/EventEmitter.js`)
- Standard events emitted:
  - `PLAYER_REGISTERED`
  - `GAME_COMPLETED`
  - `REWARD_GRANTED`
  - `WALLET_UPDATED`
  - `TOKEN_MINTED_VIRTUAL`
- Connect event listeners to send Telegram Mini App push notifications or trigger Daraja B2C payouts.
