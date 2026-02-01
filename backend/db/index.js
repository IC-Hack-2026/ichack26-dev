// Database layer with in-memory fallback
// Can be replaced with PostgreSQL for production

const config = require('../config');
const fs = require('fs');
const path = require('path');

// Data directory for persistent storage
const DATA_DIR = path.join(__dirname, '..', 'data');
const PATTERNS_FILE = path.join(DATA_DIR, 'detected-patterns.json');
const WHALE_TRADES_FILE = path.join(DATA_DIR, 'whale-trades.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load persisted patterns on startup
function loadPersistedPatterns() {
    try {
        if (fs.existsSync(PATTERNS_FILE)) {
            const data = fs.readFileSync(PATTERNS_FILE, 'utf8');
            const patterns = JSON.parse(data);
            console.log(`[DB] Loaded ${patterns.length} persisted patterns from disk`);
            return patterns;
        }
    } catch (error) {
        console.error('[DB] Failed to load persisted patterns:', error.message);
    }
    return [];
}

// Load persisted whale trades on startup
function loadPersistedWhaleTrades() {
    try {
        if (fs.existsSync(WHALE_TRADES_FILE)) {
            const data = fs.readFileSync(WHALE_TRADES_FILE, 'utf8');
            const trades = JSON.parse(data);
            console.log(`[DB] Loaded ${trades.length} persisted whale trades from disk`);
            return trades;
        }
    } catch (error) {
        console.error('[DB] Failed to load persisted whale trades:', error.message);
    }
    return [];
}

// Save patterns to disk
function savePatternsToDisk(patterns) {
    try {
        fs.writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2));
    } catch (error) {
        console.error('[DB] Failed to save patterns to disk:', error.message);
    }
}

// Save whale trades to disk
function saveWhaleTradesToDisk(trades) {
    try {
        fs.writeFileSync(WHALE_TRADES_FILE, JSON.stringify(trades, null, 2));
    } catch (error) {
        console.error('[DB] Failed to save whale trades to disk:', error.message);
    }
}

// In-memory store (used when DB not configured)
const store = {
    events: new Map(),
    predictions: new Map(),
    articles: new Map(),
    articlesByEventId: new Map(),  // Index for O(1) deduplication by eventId
    articlesBySlug: new Map(),     // Index for O(1) deduplication by slug
    signals: new Map(),
    backtestRuns: [],
    // New collections for insider trading detection
    walletProfiles: new Map(),       // address -> profile object
    tradeHistory: [],                // Array of trades (capped at 100k, FIFO)
    detectedPatterns: loadPersistedPatterns(),  // Load from disk on startup
    orderbookSnapshots: new Map(),   // tokenId -> circular buffer of snapshots
    whaleTrades: loadPersistedWhaleTrades()     // Load from disk on startup
};

// Constants
const TRADE_HISTORY_MAX = 100000;
const ORDERBOOK_SNAPSHOTS_MAX = 100;
const WHALE_TRADES_MAX = 10000;

// Slugify helper
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 100);
}

// Event operations
const events = {
    async upsert(event) {
        store.events.set(event.id, {
            ...event,
            updatedAt: new Date().toISOString()
        });
        return event;
    },

    async getById(id) {
        return store.events.get(id) || null;
    },

    async getBySlug(slug) {
        for (const event of store.events.values()) {
            if (event.slug === slug) return event;
        }
        return null;
    },

    async getAll({ limit = 50, category = null, resolved = false, minDaysUntilResolution = null, maxDaysUntilResolution = null } = {}) {
        let results = Array.from(store.events.values())
            .filter(e => e.resolved === resolved);

        if (category) {
            results = results.filter(e => e.category === category);
        }

        // Filter by resolution date range
        if (minDaysUntilResolution != null || maxDaysUntilResolution != null) {
            const now = Date.now();
            const minMs = (minDaysUntilResolution || 0) * 24 * 60 * 60 * 1000;
            const maxMs = (maxDaysUntilResolution || Infinity) * 24 * 60 * 60 * 1000;

            results = results.filter(e => {
                if (!e.endDate) return false;
                const msUntilResolution = new Date(e.endDate).getTime() - now;
                return msUntilResolution >= minMs && msUntilResolution <= maxMs;
            });
        }

        return results.slice(0, limit);
    },

    async getCategories() {
        const categories = new Map();
        for (const event of store.events.values()) {
            const cat = event.category || 'Other';
            categories.set(cat, (categories.get(cat) || 0) + 1);
        }
        return Array.from(categories.entries()).map(([name, count]) => ({ name, count }));
    }
};

// Prediction operations
const predictions = {
    async create(prediction) {
        const id = Date.now().toString();
        const record = {
            id,
            ...prediction,
            calculatedAt: new Date().toISOString()
        };
        store.predictions.set(id, record);
        return record;
    },

    async getByEventId(eventId) {
        for (const pred of store.predictions.values()) {
            if (pred.eventId === eventId) return pred;
        }
        return null;
    },

    async getLatestByEventId(eventId) {
        let latest = null;
        for (const pred of store.predictions.values()) {
            if (pred.eventId === eventId) {
                if (!latest || pred.calculatedAt > latest.calculatedAt) {
                    latest = pred;
                }
            }
        }
        return latest;
    }
};

// Article operations
const articles = {
    async create(article) {
        // Database-level deduplication: check if article for this event already exists
        if (article.eventId && store.articlesByEventId.has(article.eventId)) {
            return store.articlesByEventId.get(article.eventId);
        }

        const slug = article.slug || slugify(article.headline);

        // Deduplicate by slug (prevents duplicate articles with similar headlines)
        if (store.articlesBySlug.has(slug)) {
            return store.articlesBySlug.get(slug);
        }

        const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        const record = {
            id,
            ...article,
            slug,
            publishedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
        store.articles.set(id, record);

        // Add to eventId index for O(1) lookups
        if (article.eventId) {
            store.articlesByEventId.set(article.eventId, record);
        }
        // Add to slug index for O(1) lookups
        store.articlesBySlug.set(slug, record);

        return record;
    },

    async update(id, updates) {
        const existing = store.articles.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...updates };
        store.articles.set(id, updated);

        // Update the eventId index as well
        if (updated.eventId) {
            store.articlesByEventId.set(updated.eventId, updated);
        }
        // Update the slug index as well
        if (updated.slug) {
            store.articlesBySlug.set(updated.slug, updated);
        }
        return updated;
    },

    async getById(id) {
        return store.articles.get(id) || null;
    },

    async getBySlug(slug) {
        for (const article of store.articles.values()) {
            if (article.slug === slug) return article;
        }
        return null;
    },

    async getByEventId(eventId) {
        // O(1) lookup using the eventId index
        return store.articlesByEventId.get(eventId) || null;
    },

    async getAll({
        limit = 20,
        offset = 0,
        category = null,
        sort = 'publishedAt',
        minDaysUntilExpiry = null,
        maxDaysUntilExpiry = null
    } = {}) {
        let results = Array.from(store.articles.values());

        if (category) {
            results = results.filter(a => a.category === category);
        }

        // Filter by expiry date range
        if (minDaysUntilExpiry != null || maxDaysUntilExpiry != null) {
            const now = Date.now();
            const minMs = (minDaysUntilExpiry || 0) * 24 * 60 * 60 * 1000;
            const maxMs = (maxDaysUntilExpiry || Infinity) * 24 * 60 * 60 * 1000;

            results = results.filter(a => {
                if (!a.expiresAt) return false;
                const msUntilExpiry = new Date(a.expiresAt).getTime() - now;
                return msUntilExpiry >= minMs && msUntilExpiry <= maxMs;
            });
        }

        // Sort
        if (sort === 'probability') {
            results.sort((a, b) => (b.probability || 0) - (a.probability || 0));
        } else {
            results.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        }

        return results.slice(offset, offset + limit);
    },

    async getFeatured(limit = 5, minDaysUntilExpiry = null, maxDaysUntilExpiry = null) {
        let results = Array.from(store.articles.values());

        // Filter by expiry date range
        if (minDaysUntilExpiry != null || maxDaysUntilExpiry != null) {
            const now = Date.now();
            const minMs = (minDaysUntilExpiry || 0) * 24 * 60 * 60 * 1000;
            const maxMs = (maxDaysUntilExpiry || Infinity) * 24 * 60 * 60 * 1000;

            results = results.filter(a => {
                if (!a.expiresAt) return false;
                const msUntilExpiry = new Date(a.expiresAt).getTime() - now;
                return msUntilExpiry >= minMs && msUntilExpiry <= maxMs;
            });
        }

        return results
            .sort((a, b) => (b.probability || 0) - (a.probability || 0))
            .slice(0, limit);
    },

    async count(category = null) {
        if (!category) return store.articles.size;
        return Array.from(store.articles.values())
            .filter(a => a.category === category).length;
    },

    /**
     * Update probability for all articles linked to a given eventId
     * @param {string} eventId - The event ID to match
     * @param {number} probability - The new probability value
     * @returns {number} - Number of articles updated
     */
    async updateProbability(eventId, probability) {
        let updatedCount = 0;
        for (const [id, article] of store.articles.entries()) {
            if (article.eventId === eventId) {
                store.articles.set(id, {
                    ...article,
                    probability,
                    probabilityUpdatedAt: new Date().toISOString()
                });
                updatedCount++;
            }
        }
        return updatedCount;
    }
};

// Signal operations
const signals = {
    async create(signal) {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const record = {
            id,
            ...signal,
            detectedAt: new Date().toISOString()
        };
        store.signals.set(id, record);
        return record;
    },

    async getByEventId(eventId) {
        return Array.from(store.signals.values())
            .filter(s => s.eventId === eventId);
    }
};

// Backtest operations
const backtests = {
    async create(backtest) {
        const id = Date.now().toString();
        const record = {
            id,
            ...backtest,
            runAt: new Date().toISOString()
        };
        store.backtestRuns.push(record);
        return record;
    },

    async getById(id) {
        return store.backtestRuns.find(b => b.id === id) || null;
    },

    async getAll(limit = 10) {
        return store.backtestRuns.slice(-limit).reverse();
    }
};

// Wallet profile operations
const walletProfiles = {
    /**
     * Create or update a wallet profile
     * Schema: { address, firstTradeAt, lastTradeAt, totalTrades, totalVolume,
     *           resolvedPositions, wins, losses, winRate, avgProfit,
     *           avgTradeSize, maxTradeSize, riskScore, suspiciousFlags[] }
     */
    async upsert(address, profile) {
        const normalizedAddress = address.toLowerCase();
        const existing = store.walletProfiles.get(normalizedAddress);
        const record = {
            ...existing,
            ...profile,
            address: normalizedAddress,
            updatedAt: new Date().toISOString()
        };
        if (!existing) {
            record.createdAt = new Date().toISOString();
        }
        store.walletProfiles.set(normalizedAddress, record);
        return record;
    },

    /**
     * Get a wallet profile by address
     */
    async getByAddress(address) {
        return store.walletProfiles.get(address.toLowerCase()) || null;
    },

    /**
     * List wallet profiles with filters
     */
    async getAll({ limit = 50, minWinRate = null, minTrades = null } = {}) {
        let results = Array.from(store.walletProfiles.values());

        if (minWinRate !== null) {
            results = results.filter(p => (p.winRate || 0) >= minWinRate);
        }

        if (minTrades !== null) {
            results = results.filter(p => (p.totalTrades || 0) >= minTrades);
        }

        // Sort by total volume descending
        results.sort((a, b) => (b.totalVolume || 0) - (a.totalVolume || 0));

        return results.slice(0, limit);
    },

    /**
     * Get wallets with suspicious flags
     */
    async getSuspicious(limit = 50) {
        return Array.from(store.walletProfiles.values())
            .filter(p => p.suspiciousFlags && p.suspiciousFlags.length > 0)
            .sort((a, b) => (b.suspiciousFlags?.length || 0) - (a.suspiciousFlags?.length || 0))
            .slice(0, limit);
    }
};

// Trade history operations
const tradeHistory = {
    /**
     * Record a trade (auto-prune if exceeds 100k entries)
     */
    async record(trade) {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const record = {
            id,
            ...trade,
            recordedAt: new Date().toISOString()
        };

        store.tradeHistory.push(record);

        // Auto-prune: FIFO removal if exceeds max
        while (store.tradeHistory.length > TRADE_HISTORY_MAX) {
            store.tradeHistory.shift();
        }

        return record;
    },

    /**
     * Get trades by wallet address
     */
    async getByWallet(address, limit = 100) {
        const normalizedAddress = address.toLowerCase();
        return store.tradeHistory
            .filter(t => (t.maker?.toLowerCase() === normalizedAddress) ||
                        (t.taker?.toLowerCase() === normalizedAddress) ||
                        (t.address?.toLowerCase() === normalizedAddress))
            .slice(-limit)
            .reverse();
    },

    /**
     * Get trades by market/token ID
     */
    async getByMarket(tokenId, limit = 100) {
        return store.tradeHistory
            .filter(t => t.tokenId === tokenId || t.marketId === tokenId)
            .slice(-limit)
            .reverse();
    },

    /**
     * Get most recent trades
     */
    async getRecent(limit = 100) {
        return store.tradeHistory.slice(-limit).reverse();
    },

    /**
     * Get trades within a time range
     */
    async getInTimeRange(startTime, endTime) {
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();

        return store.tradeHistory.filter(t => {
            const tradeTime = new Date(t.timestamp || t.recordedAt).getTime();
            return tradeTime >= start && tradeTime <= end;
        });
    }
};

// Detected patterns operations
const detectedPatterns = {
    /**
     * Record a detected insider pattern
     */
    async record(pattern) {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const record = {
            id,
            ...pattern,
            detectedAt: new Date().toISOString()
        };
        store.detectedPatterns.push(record);

        // Persist to disk
        savePatternsToDisk(store.detectedPatterns);

        return record;
    },

    /**
     * Get patterns for a specific event
     */
    async getByEventId(eventId) {
        return store.detectedPatterns
            .filter(p => p.eventId === eventId)
            .reverse();
    },

    /**
     * Get recent patterns
     */
    async getRecent(limit = 50) {
        return store.detectedPatterns.slice(-limit).reverse();
    },

    /**
     * Get patterns by type
     */
    async getByType(type, limit = 50) {
        return store.detectedPatterns
            .filter(p => p.type === type)
            .slice(-limit)
            .reverse();
    },

    /**
     * Clear all patterns (useful for testing)
     */
    async clear() {
        store.detectedPatterns = [];
        savePatternsToDisk(store.detectedPatterns);
    },

    /**
     * Get total count of patterns
     */
    async count() {
        return store.detectedPatterns.length;
    }
};

// Orderbook snapshots operations
const orderbookSnapshots = {
    /**
     * Record a snapshot for a token (keeps last 100 per token)
     */
    async record(tokenId, snapshot) {
        if (!store.orderbookSnapshots.has(tokenId)) {
            store.orderbookSnapshots.set(tokenId, []);
        }

        const snapshots = store.orderbookSnapshots.get(tokenId);
        const record = {
            ...snapshot,
            tokenId,
            recordedAt: new Date().toISOString()
        };

        snapshots.push(record);

        // Keep only the last 100 snapshots (circular buffer behavior)
        while (snapshots.length > ORDERBOOK_SNAPSHOTS_MAX) {
            snapshots.shift();
        }

        return record;
    },

    /**
     * Get the most recent snapshot for a token
     */
    async getLatest(tokenId) {
        const snapshots = store.orderbookSnapshots.get(tokenId);
        if (!snapshots || snapshots.length === 0) {
            return null;
        }
        return snapshots[snapshots.length - 1];
    },

    /**
     * Get recent snapshots for a token
     */
    async getHistory(tokenId, count = 10) {
        const snapshots = store.orderbookSnapshots.get(tokenId);
        if (!snapshots || snapshots.length === 0) {
            return [];
        }
        return snapshots.slice(-count).reverse();
    }
};

// Whale trades operations
const whaleTrades = {
    /**
     * Record a whale trade detection
     * @param {Object} trade - Whale trade data from WhaleDetector
     */
    async record(trade) {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const record = {
            id,
            ...trade,
            recordedAt: new Date().toISOString()
        };

        store.whaleTrades.push(record);

        // Auto-prune: FIFO removal if exceeds max
        while (store.whaleTrades.length > WHALE_TRADES_MAX) {
            store.whaleTrades.shift();
        }

        // Persist to disk
        saveWhaleTradesToDisk(store.whaleTrades);

        return record;
    },

    /**
     * Get recent whale trades
     * @param {number} limit - Maximum number of trades to return
     */
    async getRecent(limit = 50) {
        return store.whaleTrades.slice(-limit).reverse();
    },

    /**
     * Get whale trades by asset ID
     * @param {string} assetId - Asset identifier
     * @param {number} limit - Maximum number of trades to return
     */
    async getByAsset(assetId, limit = 50) {
        return store.whaleTrades
            .filter(t => t.assetId === assetId)
            .slice(-limit)
            .reverse();
    },

    /**
     * Get whale trades within a time range
     * @param {Date|string|number} startTime - Start of time range
     * @param {Date|string|number} endTime - End of time range
     */
    async getInTimeRange(startTime, endTime) {
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();

        return store.whaleTrades.filter(t => {
            const tradeTime = new Date(t.timestamp || t.recordedAt).getTime();
            return tradeTime >= start && tradeTime <= end;
        });
    },

    /**
     * Get total count of whale trades
     */
    async count() {
        return store.whaleTrades.length;
    },

    /**
     * Clear all whale trades (useful for testing)
     */
    async clear() {
        store.whaleTrades = [];
        saveWhaleTradesToDisk(store.whaleTrades);
    }
};

module.exports = {
    events,
    predictions,
    articles,
    signals,
    backtests,
    // New collections for insider trading detection
    walletProfiles,
    tradeHistory,
    detectedPatterns,
    orderbookSnapshots,
    whaleTrades,
    // Utility
    slugify,
    // For testing/debugging
    _store: store
};
