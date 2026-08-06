/**
 * events/EventEmitter.js — Platform Event Bus
 * Emits decoupled system events to prepare for real-time analytics, Web3 bridges, and external webhooks
 */
const EventEmitter = require('events');

class PlatformEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50);
        this.setupDefaultListeners();
    }

    setupDefaultListeners() {
        this.on('PLAYER_REGISTERED', (data) => {
            console.log(`[EVENT: PLAYER_REGISTERED] Player: ${data.email || data.id}`);
        });

        this.on('GAME_COMPLETED', (data) => {
            console.log(`[EVENT: GAME_COMPLETED] Game: ${data.gameSource} | Win: ${data.winAmount} | Player: ${data.userId}`);
        });

        this.on('REWARD_GRANTED', (data) => {
            console.log(`[EVENT: REWARD_GRANTED] ${data.amount} ${data.assetType} awarded to ${data.userId}`);
        });

        this.on('WALLET_UPDATED', (data) => {
            console.log(`[EVENT: WALLET_UPDATED] ${data.userId} new balance: ${data.newBalance} ${data.assetType}`);
        });

        this.on('TOKEN_MINTED_VIRTUAL', (data) => {
            console.log(`[EVENT: TOKEN_MINTED_VIRTUAL] Virtual Tx: ${data.txHash} for ${data.amount} $PLAY`);
        });
    }

    emitEvent(eventName, payload) {
        try {
            this.emit(eventName, {
                event: eventName,
                timestamp: Date.now(),
                ...payload
            });
        } catch (err) {
            console.warn(`[EVENT ERROR] Failed emitting ${eventName}:`, err.message);
        }
    }
}

const platformEvents = new PlatformEventBus();
module.exports = platformEvents;
