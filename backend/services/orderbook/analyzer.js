/**
 * Order Book Analyzer
 * Analyzes order book data for spread, depth, imbalance, and liquidity impact
 */

const config = require('../../config');

class OrderBookAnalyzer {
    /**
     * Analyze an order book and return key metrics
     * @param {Object} orderbook - Order book with bids and asks arrays
     * @param {Array} orderbook.bids - Array of [price, size] or {price, size}
     * @param {Array} orderbook.asks - Array of [price, size] or {price, size}
     * @returns {Object} Analysis results
     */
    analyzeOrderBook(orderbook) {
        const { bids, asks } = this._normalizeOrderbook(orderbook);

        if (bids.length === 0 && asks.length === 0) {
            return {
                spread: 0,
                spreadPercent: 0,
                bidDepth: 0,
                askDepth: 0,
                totalDepth: 0,
                imbalance: 0,
                momentum: 0,
                midPrice: 0
            };
        }

        // Best bid is highest price, best ask is lowest price
        const bestBid = bids.length > 0 ? Math.max(...bids.map(b => b.price)) : 0;
        const bestAsk = asks.length > 0 ? Math.min(...asks.map(a => a.price)) : 0;

        // Mid price calculation
        let midPrice = 0;
        if (bestBid > 0 && bestAsk > 0) {
            midPrice = (bestBid + bestAsk) / 2;
        } else if (bestBid > 0) {
            midPrice = bestBid;
        } else if (bestAsk > 0) {
            midPrice = bestAsk;
        }

        // Spread calculation
        const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
        const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

        // Depth calculations
        const bidDepth = bids.reduce((sum, b) => sum + b.size, 0);
        const askDepth = asks.reduce((sum, a) => sum + a.size, 0);
        const totalDepth = bidDepth + askDepth;

        // Imbalance: positive means more bids (buying pressure), negative means more asks (selling pressure)
        // Ranges from -1 to 1
        const imbalance = totalDepth > 0 ? (bidDepth - askDepth) / totalDepth : 0;

        // Momentum: weighted imbalance based on proximity to mid price
        const momentum = this._calculateMomentum(bids, asks, midPrice);

        return {
            spread,
            spreadPercent,
            bidDepth,
            askDepth,
            totalDepth,
            imbalance,
            momentum,
            midPrice
        };
    }

    /**
     * Calculate how much a trade of given size would impact the price
     * @param {number} tradeSize - Size of the trade
     * @param {string} side - 'buy' or 'sell'
     * @param {Object} orderbook - Order book data
     * @returns {Object} Impact analysis
     */
    calculateLiquidityImpact(tradeSize, side, orderbook) {
        const { bids, asks } = this._normalizeOrderbook(orderbook);

        // For a buy order, we consume asks (sorted by price ascending)
        // For a sell order, we consume bids (sorted by price descending)
        const orders = side === 'buy'
            ? [...asks].sort((a, b) => a.price - b.price)
            : [...bids].sort((a, b) => b.price - a.price);

        if (orders.length === 0) {
            return {
                impactPercent: 100,
                levelsConsumed: 0,
                avgFillPrice: 0,
                slippage: 100
            };
        }

        const startPrice = orders[0].price;
        let remainingSize = tradeSize;
        let totalCost = 0;
        let levelsConsumed = 0;
        let lastFillPrice = startPrice;

        for (const order of orders) {
            if (remainingSize <= 0) break;

            const fillSize = Math.min(remainingSize, order.size);
            totalCost += fillSize * order.price;
            remainingSize -= fillSize;
            lastFillPrice = order.price;
            levelsConsumed++;
        }

        const filledSize = tradeSize - remainingSize;
        const avgFillPrice = filledSize > 0 ? totalCost / filledSize : 0;

        // Impact is the percentage price movement from start to last fill
        const impactPercent = startPrice > 0
            ? Math.abs((lastFillPrice - startPrice) / startPrice) * 100
            : 0;

        // Slippage is the difference between expected price (first level) and average fill price
        const slippage = startPrice > 0
            ? Math.abs((avgFillPrice - startPrice) / startPrice) * 100
            : 0;

        return {
            impactPercent,
            levelsConsumed,
            avgFillPrice,
            slippage
        };
    }

    /**
     * Detect large orders in the order book that exceed a threshold
     * @param {Object} orderbook - Order book data
     * @param {number} threshold - Size threshold for detecting large orders
     * @returns {Array} Array of large orders with metadata
     */
    detectLargeOrders(orderbook, threshold) {
        const { bids, asks } = this._normalizeOrderbook(orderbook);
        const totalBidDepth = bids.reduce((sum, b) => sum + b.size, 0);
        const totalAskDepth = asks.reduce((sum, a) => sum + a.size, 0);

        const largeOrders = [];

        // Check bids
        for (const bid of bids) {
            if (bid.size >= threshold) {
                largeOrders.push({
                    side: 'bid',
                    price: bid.price,
                    size: bid.size,
                    percentOfDepth: totalBidDepth > 0 ? (bid.size / totalBidDepth) * 100 : 0
                });
            }
        }

        // Check asks
        for (const ask of asks) {
            if (ask.size >= threshold) {
                largeOrders.push({
                    side: 'ask',
                    price: ask.price,
                    size: ask.size,
                    percentOfDepth: totalAskDepth > 0 ? (ask.size / totalAskDepth) * 100 : 0
                });
            }
        }

        // Sort by size descending
        largeOrders.sort((a, b) => b.size - a.size);

        return largeOrders;
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

    /**
     * Calculate momentum based on weighted order book pressure
     * Orders closer to mid price have more weight
     * @private
     */
    _calculateMomentum(bids, asks, midPrice) {
        if (midPrice === 0 || (bids.length === 0 && asks.length === 0)) {
            return 0;
        }

        const calculateWeightedDepth = (orders, isBid) => {
            return orders.reduce((sum, order) => {
                // Weight by inverse distance to mid price (closer = higher weight)
                const distance = Math.abs(order.price - midPrice);
                const weight = midPrice > 0 ? 1 / (1 + distance / midPrice) : 1;
                return sum + order.size * weight;
            }, 0);
        };

        const weightedBidDepth = calculateWeightedDepth(bids, true);
        const weightedAskDepth = calculateWeightedDepth(asks, false);
        const totalWeightedDepth = weightedBidDepth + weightedAskDepth;

        if (totalWeightedDepth === 0) return 0;

        // Momentum ranges from -1 to 1
        return (weightedBidDepth - weightedAskDepth) / totalWeightedDepth;
    }
}

// Export class and singleton instance
const orderBookAnalyzer = new OrderBookAnalyzer();

module.exports = {
    OrderBookAnalyzer,
    orderBookAnalyzer
};
