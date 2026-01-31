/**
 * OrderBook
 * In-memory order book for a single market with sorted price levels.
 * Maintains bid and ask levels, supports incremental updates.
 */

class OrderBook {
    /**
     * Create a new OrderBook instance
     * @param {string} assetId - The asset/token identifier
     */
    constructor(assetId) {
        this.assetId = assetId;
        this.bids = new Map(); // numeric price -> size
        this.asks = new Map(); // numeric price -> size
        this.sortedBidPrices = []; // descending order
        this.sortedAskPrices = []; // ascending order
        this.timestamp = null;
        this.hash = null;
        this._initialized = false;
    }

    /**
     * Initialize the order book from a WebSocket snapshot
     * @param {Object} snapshot - Book snapshot from WebSocket
     * @param {Array} snapshot.bids - Array of { price, size } objects
     * @param {Array} snapshot.asks - Array of { price, size } objects
     * @param {string} [snapshot.timestamp] - Snapshot timestamp
     * @param {string} [snapshot.hash] - Snapshot hash for verification
     */
    initializeFromSnapshot(snapshot) {
        // Clear existing data
        this.bids.clear();
        this.asks.clear();
        this.sortedBidPrices = [];
        this.sortedAskPrices = [];

        const { bids, asks, timestamp, hash } = snapshot;

        // Process bids
        if (Array.isArray(bids)) {
            for (const bid of bids) {
                const { price, size } = this._normalizeLevel(bid);
                if (price !== null && size > 0) {
                    this.bids.set(price, size);
                }
            }
            // Sort bid prices descending (highest first)
            this.sortedBidPrices = Array.from(this.bids.keys()).sort((a, b) => b - a);
        }

        // Process asks
        if (Array.isArray(asks)) {
            for (const ask of asks) {
                const { price, size } = this._normalizeLevel(ask);
                if (price !== null && size > 0) {
                    this.asks.set(price, size);
                }
            }
            // Sort ask prices ascending (lowest first)
            this.sortedAskPrices = Array.from(this.asks.keys()).sort((a, b) => a - b);
        }

        this.timestamp = timestamp || Date.now().toString();
        this.hash = hash || null;
        this._initialized = true;
    }

    /**
     * Apply a single price change to the order book
     * @param {Object} change - Price change data
     * @param {string} change.price - Price level
     * @param {string|number} change.size - New size (0 = remove level)
     * @param {string} change.side - 'BUY' (bid) or 'SELL' (ask)
     */
    applyPriceChange(change) {
        const { price: rawPrice, size: rawSize, side } = change;
        const price = parseFloat(rawPrice);
        const size = parseFloat(rawSize) || 0;

        if (isNaN(price)) {
            return;
        }

        const isBid = side === 'BUY';
        const map = isBid ? this.bids : this.asks;
        const sortedPrices = isBid ? this.sortedBidPrices : this.sortedAskPrices;

        if (size === 0) {
            // Remove level
            if (map.has(price)) {
                map.delete(price);
                const idx = sortedPrices.indexOf(price);
                if (idx !== -1) {
                    sortedPrices.splice(idx, 1);
                }
            }
        } else {
            // Add or update level
            const existed = map.has(price);
            map.set(price, size);

            if (!existed) {
                // Insert into sorted array maintaining order
                if (isBid) {
                    // Descending order for bids
                    const insertIdx = this._binarySearchDescending(sortedPrices, price);
                    sortedPrices.splice(insertIdx, 0, price);
                } else {
                    // Ascending order for asks
                    const insertIdx = this._binarySearchAscending(sortedPrices, price);
                    sortedPrices.splice(insertIdx, 0, price);
                }
            }
        }

        this.timestamp = Date.now().toString();
    }

    /**
     * Apply multiple price changes in batch
     * @param {Array} changes - Array of price change objects
     */
    applyPriceChanges(changes) {
        if (!Array.isArray(changes)) {
            return;
        }
        for (const change of changes) {
            this.applyPriceChange(change);
        }
    }

    /**
     * Get the best bid (highest bid price)
     * @returns {Object|null} { price, size } or null if no bids
     */
    getBestBid() {
        if (this.sortedBidPrices.length === 0) {
            return null;
        }
        const price = this.sortedBidPrices[0];
        return {
            price,
            size: this.bids.get(price)
        };
    }

    /**
     * Get the best ask (lowest ask price)
     * @returns {Object|null} { price, size } or null if no asks
     */
    getBestAsk() {
        if (this.sortedAskPrices.length === 0) {
            return null;
        }
        const price = this.sortedAskPrices[0];
        return {
            price,
            size: this.asks.get(price)
        };
    }

    /**
     * Get the spread information
     * @returns {Object} { spread, spreadPercent, midPrice }
     */
    getSpread() {
        const bestBid = this.getBestBid();
        const bestAsk = this.getBestAsk();

        if (!bestBid && !bestAsk) {
            return { spread: 0, spreadPercent: 0, midPrice: 0 };
        }

        if (!bestBid) {
            return { spread: 0, spreadPercent: 0, midPrice: bestAsk.price };
        }

        if (!bestAsk) {
            return { spread: 0, spreadPercent: 0, midPrice: bestBid.price };
        }

        const spread = bestAsk.price - bestBid.price;
        const midPrice = (bestBid.price + bestAsk.price) / 2;
        const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : 0;

        return { spread, spreadPercent, midPrice };
    }

    /**
     * Get top N levels from each side
     * @param {number} n - Number of levels to return
     * @returns {Object} { bids: [...], asks: [...] }
     */
    getDepth(n = 10) {
        const bids = [];
        const asks = [];

        for (let i = 0; i < Math.min(n, this.sortedBidPrices.length); i++) {
            const price = this.sortedBidPrices[i];
            bids.push({ price, size: this.bids.get(price) });
        }

        for (let i = 0; i < Math.min(n, this.sortedAskPrices.length); i++) {
            const price = this.sortedAskPrices[i];
            asks.push({ price, size: this.asks.get(price) });
        }

        return { bids, asks };
    }

    /**
     * Get the full order book
     * @returns {Object} { bids: [...], asks: [...], timestamp, hash }
     */
    getFullBook() {
        const bids = this.sortedBidPrices.map(price => ({
            price,
            size: this.bids.get(price)
        }));

        const asks = this.sortedAskPrices.map(price => ({
            price,
            size: this.asks.get(price)
        }));

        return {
            bids,
            asks,
            timestamp: this.timestamp,
            hash: this.hash
        };
    }

    /**
     * Get order book imbalance (-1 to 1, positive = more bids)
     * @returns {number} Imbalance value
     */
    getImbalance() {
        let bidTotal = 0;
        let askTotal = 0;

        for (const size of this.bids.values()) {
            bidTotal += size;
        }
        for (const size of this.asks.values()) {
            askTotal += size;
        }

        const total = bidTotal + askTotal;
        if (total === 0) {
            return 0;
        }

        return (bidTotal - askTotal) / total;
    }

    /**
     * Check if the order book has been initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * Get summary statistics
     * @returns {Object} Summary stats
     */
    getStats() {
        let bidTotal = 0;
        let askTotal = 0;

        for (const size of this.bids.values()) {
            bidTotal += size;
        }
        for (const size of this.asks.values()) {
            askTotal += size;
        }

        const spread = this.getSpread();

        return {
            assetId: this.assetId,
            initialized: this._initialized,
            bidLevels: this.bids.size,
            askLevels: this.asks.size,
            bidTotal,
            askTotal,
            ...spread,
            imbalance: this.getImbalance(),
            timestamp: this.timestamp
        };
    }

    /**
     * Normalize a price level from various formats
     * Returns numeric price for consistent Map keys
     * @private
     */
    _normalizeLevel(level) {
        if (!level) {
            return { price: null, size: 0 };
        }

        // Array format [price, size]
        if (Array.isArray(level)) {
            const price = parseFloat(level[0]);
            return {
                price: isNaN(price) ? null : price,
                size: parseFloat(level[1]) || 0
            };
        }

        // Object format { price, size }
        const rawPrice = level.price ?? level.p;
        const size = level.size ?? level.s ?? level.amount ?? 0;
        const price = parseFloat(rawPrice);

        return {
            price: isNaN(price) ? null : price,
            size: parseFloat(size) || 0
        };
    }

    /**
     * Binary search for descending sorted array
     * @private
     */
    _binarySearchDescending(arr, value) {
        let low = 0;
        let high = arr.length;

        while (low < high) {
            const mid = (low + high) >>> 1;
            if (arr[mid] > value) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        return low;
    }

    /**
     * Binary search for ascending sorted array
     * @private
     */
    _binarySearchAscending(arr, value) {
        let low = 0;
        let high = arr.length;

        while (low < high) {
            const mid = (low + high) >>> 1;
            if (arr[mid] < value) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        return low;
    }
}

module.exports = { OrderBook };
