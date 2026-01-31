/**
 * Fresh Wallet Signal Processor
 * Detects new wallets making significant trades, which could indicate insider activity.
 *
 * A "fresh" wallet is one that either:
 * - Is younger than maxAgeDays, OR
 * - Has fewer than maxTrades total trades
 *
 * When such a wallet makes a trade larger than minTradeSize (as % of liquidity),
 * it triggers a signal that may indicate insider knowledge.
 */

const BaseProcessor = require('../base-processor');
const { walletTracker } = require('../../wallet/tracker');
const config = require('../../../config/index');

class FreshWalletProcessor extends BaseProcessor {
    constructor() {
        const freshWalletConfig = config.signals.freshWallet;
        super('fresh-wallet', freshWalletConfig.weight);

        // Load thresholds from config
        this.maxAgeDays = freshWalletConfig.maxAgeDays;
        this.maxTrades = freshWalletConfig.maxTrades;
        this.minTradeSize = freshWalletConfig.minTradeSize;
    }

    /**
     * Process a trade event to detect fresh wallet activity
     *
     * @param {Object} event - The event object
     * @param {Object} market - Market data including liquidity
     * @param {Object} trade - Trade data with address, size, side
     * @returns {Promise<Object>} Signal result
     */
    async process(event, market, trade) {
        // Get wallet address from trade
        const address = (trade.maker || trade.taker || trade.address || '').toLowerCase();

        if (!address) {
            return { detected: false };
        }

        // Get wallet profile from tracker
        const profile = await walletTracker.getWalletProfile(address);

        // Calculate wallet age in days
        const walletAgeDays = this._getWalletAgeDays(profile);
        const totalTrades = profile.totalTrades || 0;

        // Check if wallet is "fresh"
        const isFresh = walletAgeDays < this.maxAgeDays || totalTrades < this.maxTrades;

        if (!isFresh) {
            return { detected: false };
        }

        // Calculate trade size as percentage of liquidity
        const tradeSize = this._calculateTradeSize(trade);
        const liquidity = market.liquidity || 0;

        if (liquidity === 0) {
            return { detected: false };
        }

        const liquidityPercent = tradeSize / liquidity;

        // Check if trade size exceeds minimum threshold
        if (liquidityPercent < this.minTradeSize) {
            return { detected: false };
        }

        // Both conditions met - calculate signal
        const confidence = this._calculateConfidence(walletAgeDays, totalTrades, liquidityPercent);
        const severity = this._calculateSeverity(walletAgeDays, totalTrades, liquidityPercent);

        return {
            detected: true,
            confidence,
            direction: trade.side || (trade.isBuy ? 'YES' : 'NO'),
            severity,
            metadata: {
                walletAge: walletAgeDays,
                totalTrades,
                tradeSize,
                liquidityPercent: (liquidityPercent * 100).toFixed(2) + '%',
                address
            }
        };
    }

    /**
     * Calculate confidence score based on freshness and trade size
     * Higher confidence for newer wallets making larger trades
     *
     * @param {number} walletAgeDays - Wallet age in days
     * @param {number} totalTrades - Total number of trades
     * @param {number} liquidityPercent - Trade size as fraction of liquidity
     * @returns {number} Confidence score (0-1)
     */
    _calculateConfidence(walletAgeDays, totalTrades, liquidityPercent) {
        // Freshness score: newer wallets get higher scores
        // 0 days = 1.0, maxAgeDays = 0.0
        const ageScore = Math.max(0, 1 - (walletAgeDays / this.maxAgeDays));

        // Trade count score: fewer trades = higher score
        // 0 trades = 1.0, maxTrades = 0.0
        const tradeScore = Math.max(0, 1 - (totalTrades / this.maxTrades));

        // Freshness component is average of age and trade scores
        const freshnessScore = (ageScore + tradeScore) / 2;

        // Trade size score: larger trades relative to liquidity get higher scores
        // minTradeSize = 0.0, 10x minTradeSize = 1.0
        const sizeScore = Math.min(1, (liquidityPercent - this.minTradeSize) / (this.minTradeSize * 9));

        // Final confidence: weighted combination
        // Freshness contributes 60%, trade size contributes 40%
        const confidence = (freshnessScore * 0.6) + (sizeScore * 0.4);

        return Math.min(1, Math.max(0, confidence));
    }

    /**
     * Calculate severity based on how new the wallet is and how large the trade
     *
     * @param {number} walletAgeDays - Wallet age in days
     * @param {number} totalTrades - Total number of trades
     * @param {number} liquidityPercent - Trade size as fraction of liquidity
     * @returns {string} 'HIGH' or 'MEDIUM'
     */
    _calculateSeverity(walletAgeDays, totalTrades, liquidityPercent) {
        // HIGH severity if:
        // - Wallet is very new (less than 1 day old OR less than 3 trades) AND
        // - Trade is very large (more than 5x the minimum threshold)
        const isVeryNew = walletAgeDays < 1 || totalTrades < 3;
        const isVeryLarge = liquidityPercent > this.minTradeSize * 5;

        if (isVeryNew && isVeryLarge) {
            return 'HIGH';
        }

        return 'MEDIUM';
    }

    /**
     * Calculate wallet age in days from profile
     *
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

    /**
     * Calculate trade size from trade object
     * Handles different trade formats
     *
     * @param {Object} trade - Trade object
     * @returns {number} Trade size
     */
    _calculateTradeSize(trade) {
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
            return parseFloat(trade.makerAmount);
        }
        return 0;
    }
}

// Export class and singleton instance
const freshWalletProcessor = new FreshWalletProcessor();

module.exports = {
    FreshWalletProcessor,
    freshWalletProcessor
};
