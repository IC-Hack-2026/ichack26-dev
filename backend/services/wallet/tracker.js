/**
 * Wallet Tracker - Tracks and manages wallet profiles
 *
 * Monitors trading activity, updates wallet profiles, and provides
 * methods to query wallet statistics and detect suspicious patterns.
 */

const db = require('../../db');
const config = require('../../config');
const { profileBuilder } = require('./profile-builder');

class WalletTracker {
    constructor() {
        this.profileBuilder = profileBuilder;
    }

    /**
     * Track a new trade and update the wallet profile
     * Called on each trade to maintain up-to-date wallet stats
     *
     * @param {Object} trade - Trade object with address, size, price, timestamp, etc.
     * @returns {Promise<Object>} Updated wallet profile
     */
    async trackTrade(trade) {
        const address = (trade.maker || trade.taker || trade.address || '').toLowerCase();

        if (!address) {
            throw new Error('Trade must have a wallet address (maker, taker, or address)');
        }

        // Get or create profile
        let profile = await this.getWalletProfile(address);

        // Calculate trade size (handle different trade formats)
        const tradeSize = this._calculateTradeSize(trade);
        const tradeTimestamp = trade.timestamp || new Date().toISOString();

        // Update profile statistics
        profile.totalTrades += 1;
        profile.totalVolume += tradeSize;
        profile.lastTradeAt = tradeTimestamp;

        // Update first trade timestamp if this is earlier
        if (!profile.firstTradeAt || tradeTimestamp < profile.firstTradeAt) {
            profile.firstTradeAt = tradeTimestamp;
        }

        // Update average trade size
        profile.avgTradeSize = profile.totalVolume / profile.totalTrades;

        // Update max trade size
        if (tradeSize > profile.maxTradeSize) {
            profile.maxTradeSize = tradeSize;
        }

        // Check for suspicious patterns on this trade
        await this._checkForSuspiciousActivity(profile, trade, tradeSize);

        // Recalculate risk score
        profile.riskScore = this.profileBuilder.calculateRiskScore(profile);

        // Save updated profile
        await db.walletProfiles.upsert(address, profile);

        // Also record the trade in history
        await db.tradeHistory.record({
            ...trade,
            address,
            size: tradeSize
        });

        return profile;
    }

    /**
     * Get or build a wallet profile for an address
     * @param {string} address - Wallet address
     * @returns {Promise<Object>} Wallet profile
     */
    async getWalletProfile(address) {
        const normalizedAddress = address.toLowerCase();

        let profile = await db.walletProfiles.getByAddress(normalizedAddress);

        if (!profile) {
            // Build new profile
            profile = this.profileBuilder.buildProfile(normalizedAddress);
            await db.walletProfiles.upsert(normalizedAddress, profile);
        }

        return profile;
    }

    /**
     * Check if a wallet is considered "fresh" (new/inexperienced)
     * A fresh wallet is one that:
     * - Is less than config.signals.freshWallet.maxAgeDays old, OR
     * - Has fewer than config.signals.freshWallet.maxTrades trades
     *
     * @param {string} address - Wallet address
     * @returns {Promise<boolean>} True if wallet is fresh
     */
    async isFreshWallet(address) {
        const profile = await this.getWalletProfile(address);

        const maxAgeDays = config.signals.freshWallet.maxAgeDays;
        const maxTrades = config.signals.freshWallet.maxTrades;

        // Check wallet age
        const walletAgeDays = this._getWalletAgeDays(profile);
        if (walletAgeDays < maxAgeDays) {
            return true;
        }

        // Check total trades
        if (profile.totalTrades < maxTrades) {
            return true;
        }

        return false;
    }

    /**
     * Get wallet accuracy statistics
     * @param {string} address - Wallet address
     * @returns {Promise<Object>} Accuracy stats: { winRate, resolvedPositions, wins, losses }
     */
    async getWalletAccuracy(address) {
        const profile = await this.getWalletProfile(address);

        return {
            winRate: profile.winRate || 0,
            resolvedPositions: profile.resolvedPositions || 0,
            wins: profile.wins || 0,
            losses: profile.losses || 0
        };
    }

    /**
     * Update wallet statistics after a market resolution
     * Call this when a position the wallet held is resolved
     *
     * @param {string} address - Wallet address
     * @param {boolean} won - Whether the position was a winning position
     * @param {number} profit - Profit/loss amount (positive or negative)
     * @returns {Promise<Object>} Updated wallet profile
     */
    async updateWalletOnResolution(address, won, profit) {
        const normalizedAddress = address.toLowerCase();
        let profile = await this.getWalletProfile(normalizedAddress);

        // Update resolution stats
        profile.resolvedPositions = (profile.resolvedPositions || 0) + 1;

        if (won) {
            profile.wins = (profile.wins || 0) + 1;
        } else {
            profile.losses = (profile.losses || 0) + 1;
        }

        // Recalculate win rate
        profile.winRate = profile.resolvedPositions > 0
            ? profile.wins / profile.resolvedPositions
            : 0;

        // Update average profit (running average)
        const previousTotalProfit = (profile.avgProfit || 0) * ((profile.resolvedPositions || 1) - 1);
        profile.avgProfit = (previousTotalProfit + profit) / profile.resolvedPositions;

        // Check for high win rate flag
        const minPositions = config.signals.walletAccuracy.minResolvedPositions;
        const minWinRate = config.signals.walletAccuracy.minWinRate;

        if (profile.resolvedPositions >= minPositions && profile.winRate >= minWinRate) {
            await this.profileBuilder.addSuspiciousFlag(normalizedAddress, 'high_win_rate', {
                winRate: profile.winRate,
                resolvedPositions: profile.resolvedPositions
            });
        }

        // Recalculate risk score
        profile.riskScore = this.profileBuilder.calculateRiskScore(profile);

        // Save updated profile
        await db.walletProfiles.upsert(normalizedAddress, profile);

        return profile;
    }

    /**
     * Check for suspicious activity patterns on a trade
     * @param {Object} profile - Current wallet profile
     * @param {Object} trade - Trade being processed
     * @param {number} tradeSize - Calculated trade size
     */
    async _checkForSuspiciousActivity(profile, trade, tradeSize) {
        const address = profile.address;
        const isFresh = await this.isFreshWallet(address);
        const minTradeSize = config.signals.freshWallet.minTradeSize;

        // Flag 1: Fresh wallet making large trade
        if (isFresh && tradeSize >= minTradeSize) {
            await this.profileBuilder.addSuspiciousFlag(address, 'fresh_wallet_large_trade', {
                tradeSize,
                totalTrades: profile.totalTrades,
                walletAgeDays: this._getWalletAgeDays(profile)
            });
        }

        // Flag 2: Unusually large trade relative to wallet's history
        if (profile.avgTradeSize > 0 && tradeSize > profile.avgTradeSize * 5) {
            await this.profileBuilder.addSuspiciousFlag(address, 'unusual_trade_size', {
                tradeSize,
                avgTradeSize: profile.avgTradeSize,
                ratio: tradeSize / profile.avgTradeSize
            });
        }
    }

    /**
     * Helper: Calculate trade size from trade object
     * Handles different trade formats from various sources
     *
     * @param {Object} trade - Trade object
     * @returns {number} Trade size
     */
    _calculateTradeSize(trade) {
        // Try different field names for trade size
        if (typeof trade.size === 'number') {
            return trade.size;
        }
        if (typeof trade.amount === 'number') {
            return trade.amount;
        }
        if (trade.price && trade.quantity) {
            return parseFloat(trade.price) * parseFloat(trade.quantity);
        }
        if (trade.makerAmount && trade.takerAmount) {
            // Use maker amount as the trade size
            return parseFloat(trade.makerAmount);
        }

        // Default to 0 if we can't determine size
        return 0;
    }

    /**
     * Helper: Calculate wallet age in days
     * @param {Object} profile - Wallet profile
     * @returns {number} Age in days
     */
    _getWalletAgeDays(profile) {
        if (!profile.firstTradeAt) {
            return 0;
        }
        const firstTrade = new Date(profile.firstTradeAt);
        const now = new Date();
        const diffMs = now - firstTrade;
        return diffMs / (1000 * 60 * 60 * 24);
    }
}

// Export class and singleton instance
const walletTracker = new WalletTracker();

module.exports = {
    WalletTracker,
    walletTracker
};
