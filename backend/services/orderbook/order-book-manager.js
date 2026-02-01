/**
 * OrderBookManager
 * Manages order books for all subscribed markets.
 * Handles WebSocket book snapshots and price change events.
 */

const EventEmitter = require('events');
const { OrderBook } = require('./order-book');

class OrderBookManager extends EventEmitter {
    constructor() {
        super();
        this.orderBooks = new Map(); // assetId -> OrderBook
    }

    /**
     * Get or create an order book for an asset
     * @param {string} assetId - The asset identifier
     * @returns {OrderBook} The order book instance
     */
    getOrderBook(assetId) {
        if (!this.orderBooks.has(assetId)) {
            this.orderBooks.set(assetId, new OrderBook(assetId));
        }
        return this.orderBooks.get(assetId);
    }

    /**
     * Check if an order book exists for an asset
     * @param {string} assetId - The asset identifier
     * @returns {boolean}
     */
    hasOrderBook(assetId) {
        return this.orderBooks.has(assetId);
    }

    /**
     * Remove an order book for an asset
     * @param {string} assetId - The asset identifier
     * @returns {boolean} True if removed, false if didn't exist
     */
    removeOrderBook(assetId) {
        return this.orderBooks.delete(assetId);
    }

    /**
     * Clear all order books (e.g., on disconnect)
     */
    clearAll() {
        this.orderBooks.clear();
    }

    /**
     * Handle a book snapshot from WebSocket
     * @param {Object} data - Book snapshot data
     */
    handleBookSnapshot(data) {
        const assetId = this._extractAssetId(data);

        if (!assetId) {
            console.warn('[OrderBookManager] Book snapshot missing asset_id');
            return;
        }

        const orderBook = this.getOrderBook(assetId);
        const wasInitialized = orderBook.isInitialized();

        orderBook.initializeFromSnapshot({
            bids: data.bids || [],
            asks: data.asks || [],
            timestamp: data.timestamp,
            hash: data.hash
        });

        if (!wasInitialized) {
            this.emit('initialized', assetId);
            console.log(`[OrderBook] Initialized ${assetId} with ${orderBook.bids.size} bids, ${orderBook.asks.size} asks`);
        }

        this.emit('updated', assetId, orderBook);
    }

    /**
     * Handle price change events from WebSocket
     * Can be a single change object or an array of changes
     * @param {Object|Array} data - Price change data
     */
    handlePriceChange(data) {
        // Handle array of price changes
        if (Array.isArray(data)) {
            // Group by asset ID for efficiency
            const changesByAsset = new Map();

            for (const change of data) {
                const assetId = this._extractAssetId(change);
                if (!assetId) {
                    continue;
                }

                if (!changesByAsset.has(assetId)) {
                    changesByAsset.set(assetId, []);
                }
                changesByAsset.get(assetId).push(change);
            }

            // Apply changes to each order book
            for (const [assetId, changes] of changesByAsset) {
                this._applyChangesToOrderBook(assetId, changes);
            }
        } else if (data && typeof data === 'object') {
            // Single change object
            const assetId = this._extractAssetId(data);
            if (assetId) {
                this._applyChangesToOrderBook(assetId, [data]);
            }
        }
    }

    /**
     * Get status summary of all order books
     * @returns {Object} Status information
     */
    getStatus() {
        const orderBooks = [];
        let totalBidLevels = 0;
        let totalAskLevels = 0;
        let initializedCount = 0;

        for (const [assetId, orderBook] of this.orderBooks) {
            const stats = orderBook.getStats();
            orderBooks.push(stats);
            totalBidLevels += stats.bidLevels;
            totalAskLevels += stats.askLevels;
            if (stats.initialized) {
                initializedCount++;
            }
        }

        return {
            totalOrderBooks: this.orderBooks.size,
            initializedCount,
            totalBidLevels,
            totalAskLevels,
            orderBooks
        };
    }

    /**
     * Extract asset ID from various field name formats
     * @private
     */
    _extractAssetId(data) {
        if (!data) {
            return null;
        }
        return data.asset_id || data.assetId || data.market || data.token_id || data.tokenId || null;
    }

    /**
     * Apply changes to an order book
     * @private
     */
    _applyChangesToOrderBook(assetId, changes) {
        const orderBook = this.getOrderBook(assetId);

        // Skip if not yet initialized (wait for snapshot)
        if (!orderBook.isInitialized()) {
            return;
        }

        orderBook.applyPriceChanges(changes);
        this.emit('updated', assetId, orderBook);
    }
}

// Singleton instance
const orderBookManager = new OrderBookManager();

module.exports = {
    OrderBookManager,
    orderBookManager
};
