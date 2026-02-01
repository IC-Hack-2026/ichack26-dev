/**
 * Order Book API Routes
 * Exposes order book data for the visualization frontend.
 */

const express = require('express');
const router = express.Router();
const { orderBookManager } = require('../../services/orderbook/order-book-manager');
const { assetRegistry } = require('../../services/orderbook/asset-registry');

/**
 * GET /api/orderbook
 * Returns summary of all order books
 */
router.get('/', (req, res) => {
    try {
        const status = orderBookManager.getStatus();

        // Filter to only include initialized order books to prevent 503 errors when clicking
        const orderBooks = status.orderBooks
            .filter(ob => ob.initialized)
            .map(ob => {
                const assetMeta = assetRegistry.get(ob.assetId);
                return {
                    assetId: ob.assetId,
                    eventTitle: assetMeta?.eventTitle || null,
                    outcome: assetMeta?.outcome || null,
                    eventId: assetMeta?.eventId || null,
                    initialized: ob.initialized,
                    bidLevels: ob.bidLevels,
                    askLevels: ob.askLevels,
                    bestBid: ob.midPrice - ob.spread / 2 || null,
                    bestAsk: ob.midPrice + ob.spread / 2 || null,
                    spread: ob.spread,
                    spreadPercent: ob.spreadPercent,
                    midPrice: ob.midPrice,
                    imbalance: ob.imbalance,
                    timestamp: ob.timestamp
                };
            });

        res.json({
            count: orderBooks.length,
            initializedCount: status.initializedCount,
            totalOrderBooks: status.totalOrderBooks,
            totalBidLevels: status.totalBidLevels,
            totalAskLevels: status.totalAskLevels,
            orderBooks
        });
    } catch (error) {
        console.error('Error fetching order books:', error.message);
        res.status(500).json({
            error: 'Failed to fetch order books',
            details: error.message
        });
    }
});

/**
 * GET /api/orderbook/:assetId
 * Returns full order book for a single asset
 */
router.get('/:assetId', (req, res) => {
    try {
        const { assetId } = req.params;

        if (!orderBookManager.hasOrderBook(assetId)) {
            return res.status(404).json({
                error: 'Order book not found',
                assetId
            });
        }

        const orderBook = orderBookManager.getOrderBook(assetId);

        if (!orderBook.isInitialized()) {
            return res.status(503).json({
                error: 'Order book not yet initialized',
                assetId
            });
        }

        const fullBook = orderBook.getFullBook();
        const stats = orderBook.getStats();
        const assetMeta = assetRegistry.get(assetId);

        res.json({
            assetId,
            eventTitle: assetMeta?.eventTitle || null,
            outcome: assetMeta?.outcome || null,
            eventId: assetMeta?.eventId || null,
            ...fullBook,
            stats: {
                bidLevels: stats.bidLevels,
                askLevels: stats.askLevels,
                bidTotal: stats.bidTotal,
                askTotal: stats.askTotal,
                spread: stats.spread,
                spreadPercent: stats.spreadPercent,
                midPrice: stats.midPrice,
                imbalance: stats.imbalance
            }
        });
    } catch (error) {
        console.error('Error fetching order book:', error.message);
        res.status(500).json({
            error: 'Failed to fetch order book',
            details: error.message
        });
    }
});

/**
 * GET /api/orderbook/:assetId/depth
 * Returns top N levels from each side
 * Query params: levels (default 10)
 */
router.get('/:assetId/depth', (req, res) => {
    try {
        const { assetId } = req.params;
        const levels = parseInt(req.query.levels) || 10;

        if (!orderBookManager.hasOrderBook(assetId)) {
            return res.status(404).json({
                error: 'Order book not found',
                assetId
            });
        }

        const orderBook = orderBookManager.getOrderBook(assetId);

        if (!orderBook.isInitialized()) {
            return res.status(503).json({
                error: 'Order book not yet initialized',
                assetId
            });
        }

        const depth = orderBook.getDepth(levels);
        const spread = orderBook.getSpread();
        const imbalance = orderBook.getImbalance();
        const assetMeta = assetRegistry.get(assetId);

        res.json({
            assetId,
            eventTitle: assetMeta?.eventTitle || null,
            outcome: assetMeta?.outcome || null,
            eventId: assetMeta?.eventId || null,
            levels,
            ...depth,
            spread: spread.spread,
            spreadPercent: spread.spreadPercent,
            midPrice: spread.midPrice,
            imbalance,
            timestamp: orderBook.timestamp
        });
    } catch (error) {
        console.error('Error fetching order book depth:', error.message);
        res.status(500).json({
            error: 'Failed to fetch order book depth',
            details: error.message
        });
    }
});

module.exports = router;
