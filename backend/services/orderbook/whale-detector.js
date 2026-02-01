/**
 * WhaleDetector
 * Detects unusual/whale trades by analyzing trade size against order book depth.
 * A trade is flagged as whale/unusual if it meets BOTH:
 * 1. Relative threshold: Trade size > configurable % of total book depth on that side
 * 2. Absolute threshold: Trade notional > configurable minimum USD value
 */

class WhaleDetector {
    /**
     * Create a new WhaleDetector instance
     * @param {Object} orderBookManager - The OrderBookManager instance
     * @param {Object} config - Configuration options
     */
    constructor(orderBookManager, config = {}) {
        this.orderBookManager = orderBookManager;
        this.config = {
            depthThresholdPercent: 5,      // Flag if trade > 5% of book depth
            minNotionalUsd: 1000,          // Minimum trade size in USD (shares * price)
            ...config
        };
    }

    /**
     * Analyze a trade to determine if it's a whale trade
     * @param {Object} tradeData - Trade data from WebSocket
     * @param {string} tradeData.asset_id - Asset identifier
     * @param {number} tradeData.price - Trade price
     * @param {number} tradeData.size - Trade size (shares)
     * @param {string} tradeData.side - 'BUY' or 'SELL'
     * @param {number} [tradeData.timestamp] - Trade timestamp
     * @returns {Object|null} Whale trade info if detected, null otherwise
     */
    analyzeTrade(tradeData) {
        const assetId = tradeData.asset_id || tradeData.assetId || tradeData.tokenId;
        const price = parseFloat(tradeData.price) || 0;
        const size = parseFloat(tradeData.size) || 0;
        const side = tradeData.side;

        if (!assetId || !price || !size || !side) {
            return null;
        }

        // Get order book for this asset
        const orderBook = this.orderBookManager.getOrderBook(assetId);
        if (!orderBook || !orderBook.isInitialized()) {
            return null;
        }

        // Calculate notional value (shares * price)
        const notional = size * price;

        // Check absolute threshold first (cheaper check)
        if (notional < this.config.minNotionalUsd) {
            return null;
        }

        // Get book depth on the relevant side
        // BUY trades consume asks, SELL trades consume bids
        const stats = orderBook.getStats();
        const relevantDepth = side === 'BUY' ? stats.askTotal : stats.bidTotal;

        // Avoid division by zero
        if (relevantDepth === 0) {
            return null;
        }

        // Check relative threshold
        const depthPercent = (size / relevantDepth) * 100;
        if (depthPercent < this.config.depthThresholdPercent) {
            return null;
        }

        // Both thresholds met - this is a whale trade
        const spreadInfo = orderBook.getSpread();

        return {
            assetId,
            price,
            size,
            side,
            notional,
            depthPercent,
            bookDepth: relevantDepth,
            spread: spreadInfo.spread,
            spreadPercent: spreadInfo.spreadPercent,
            midPrice: spreadInfo.midPrice,
            imbalance: stats.imbalance,
            timestamp: tradeData.timestamp || Date.now()
        };
    }

    /**
     * Update configuration
     * @param {Object} newConfig - New configuration values to merge
     */
    updateConfig(newConfig) {
        this.config = {
            ...this.config,
            ...newConfig
        };
    }

    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}

module.exports = { WhaleDetector };
