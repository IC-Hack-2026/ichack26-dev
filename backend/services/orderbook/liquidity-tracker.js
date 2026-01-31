/**
 * Liquidity Tracker
 * Tracks and analyzes liquidity changes over time for order books
 */

const db = require('../../db');
const config = require('../../config');

class LiquidityTracker {
    /**
     * Default threshold for detecting significant liquidity drops (percentage)
     */
    static DEFAULT_DROP_THRESHOLD = 20;

    /**
     * Record an orderbook snapshot for a token
     * @param {string} tokenId - Token/market identifier
     * @param {Object} orderbook - Order book data with bids and asks
     * @returns {Promise<Object>} Recorded snapshot
     */
    async recordSnapshot(tokenId, orderbook) {
        const { bids, asks } = this._normalizeOrderbook(orderbook);

        const bidDepth = bids.reduce((sum, b) => sum + b.size, 0);
        const askDepth = asks.reduce((sum, a) => sum + a.size, 0);
        const totalDepth = bidDepth + askDepth;

        // Get best bid/ask
        const bestBid = bids.length > 0 ? Math.max(...bids.map(b => b.price)) : 0;
        const bestAsk = asks.length > 0 ? Math.min(...asks.map(a => a.price)) : 0;
        const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : (bestBid || bestAsk);

        const snapshot = {
            bids,
            asks,
            bidDepth,
            askDepth,
            totalDepth,
            bestBid,
            bestAsk,
            midPrice,
            bidLevels: bids.length,
            askLevels: asks.length
        };

        return await db.orderbookSnapshots.record(tokenId, snapshot);
    }

    /**
     * Get recent orderbook snapshots for a token
     * @param {string} tokenId - Token/market identifier
     * @param {number} count - Number of recent snapshots to retrieve
     * @returns {Promise<Array>} Array of snapshots (most recent first)
     */
    async getRecentSnapshots(tokenId, count = 10) {
        return await db.orderbookSnapshots.getHistory(tokenId, count);
    }

    /**
     * Calculate liquidity change between current and previous snapshot
     * @param {string} tokenId - Token/market identifier
     * @returns {Promise<Object|null>} Liquidity change metrics or null if insufficient data
     */
    async calculateLiquidityChange(tokenId) {
        const snapshots = await db.orderbookSnapshots.getHistory(tokenId, 2);

        if (snapshots.length < 2) {
            return null;
        }

        // Snapshots are returned most recent first
        const current = snapshots[0];
        const previous = snapshots[1];

        const bidChange = current.bidDepth - previous.bidDepth;
        const askChange = current.askDepth - previous.askDepth;
        const totalChange = current.totalDepth - previous.totalDepth;

        // Calculate percentage change relative to previous total
        const changePercent = previous.totalDepth > 0
            ? (totalChange / previous.totalDepth) * 100
            : 0;

        return {
            bidChange,
            askChange,
            totalChange,
            changePercent,
            currentDepth: current.totalDepth,
            previousDepth: previous.totalDepth,
            timestamp: current.recordedAt
        };
    }

    /**
     * Detect if liquidity has dropped more than a threshold percentage
     * @param {string} tokenId - Token/market identifier
     * @param {number} thresholdPercent - Threshold percentage for significant drop (default: 20)
     * @returns {Promise<boolean>} True if liquidity dropped more than threshold
     */
    async detectLiquidityDrop(tokenId, thresholdPercent = LiquidityTracker.DEFAULT_DROP_THRESHOLD) {
        const change = await this.calculateLiquidityChange(tokenId);

        if (!change) {
            return false;
        }

        // Check if there's a significant drop (negative change exceeding threshold)
        return change.changePercent < -thresholdPercent;
    }

    /**
     * Get liquidity trend over multiple snapshots
     * @param {string} tokenId - Token/market identifier
     * @param {number} count - Number of snapshots to analyze
     * @returns {Promise<Object>} Trend analysis
     */
    async getLiquidityTrend(tokenId, count = 10) {
        const snapshots = await db.orderbookSnapshots.getHistory(tokenId, count);

        if (snapshots.length < 2) {
            return {
                trend: 'insufficient_data',
                snapshots: snapshots.length,
                avgDepth: snapshots.length > 0 ? snapshots[0].totalDepth : 0,
                minDepth: snapshots.length > 0 ? snapshots[0].totalDepth : 0,
                maxDepth: snapshots.length > 0 ? snapshots[0].totalDepth : 0
            };
        }

        // Snapshots are most recent first, reverse for chronological order
        const chronological = [...snapshots].reverse();

        const depths = chronological.map(s => s.totalDepth);
        const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;
        const minDepth = Math.min(...depths);
        const maxDepth = Math.max(...depths);

        // Calculate overall trend (compare first half average to second half)
        const midpoint = Math.floor(depths.length / 2);
        const firstHalfAvg = depths.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
        const secondHalfAvg = depths.slice(midpoint).reduce((a, b) => a + b, 0) / (depths.length - midpoint);

        let trend = 'stable';
        const trendThreshold = 0.1; // 10% change considered significant

        if (secondHalfAvg > firstHalfAvg * (1 + trendThreshold)) {
            trend = 'increasing';
        } else if (secondHalfAvg < firstHalfAvg * (1 - trendThreshold)) {
            trend = 'decreasing';
        }

        return {
            trend,
            snapshots: snapshots.length,
            avgDepth,
            minDepth,
            maxDepth,
            currentDepth: snapshots[0].totalDepth,
            oldestDepth: chronological[0].totalDepth,
            overallChangePercent: chronological[0].totalDepth > 0
                ? ((snapshots[0].totalDepth - chronological[0].totalDepth) / chronological[0].totalDepth) * 100
                : 0
        };
    }

    /**
     * Normalize orderbook to consistent format
     * @private
     */
    _normalizeOrderbook(orderbook) {
        const normalize = (orders) => {
            if (!orders || !Array.isArray(orders)) return [];

            return orders.map(order => {
                if (Array.isArray(order)) {
                    return { price: parseFloat(order[0]), size: parseFloat(order[1]) };
                }
                return {
                    price: parseFloat(order.price || order.p || 0),
                    size: parseFloat(order.size || order.s || order.amount || 0)
                };
            }).filter(o => o.price > 0 && o.size > 0);
        };

        return {
            bids: normalize(orderbook?.bids || []),
            asks: normalize(orderbook?.asks || [])
        };
    }
}

// Export class and singleton instance
const liquidityTracker = new LiquidityTracker();

module.exports = {
    LiquidityTracker,
    liquidityTracker
};
