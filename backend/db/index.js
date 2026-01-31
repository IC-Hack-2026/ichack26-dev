// Database layer with in-memory fallback
// Can be replaced with PostgreSQL for production

const config = require('../config');

// In-memory store (used when DB not configured)
const store = {
    events: new Map(),
    predictions: new Map(),
    articles: new Map(),
    signals: new Map(),
    backtestRuns: [],
    // New collections for insider trading detection
    walletProfiles: new Map(),       // address -> profile object
    tradeHistory: [],                // Array of trades (capped at 100k, FIFO)
    detectedPatterns: [],            // Array of detected insider patterns
    orderbookSnapshots: new Map()    // tokenId -> circular buffer of snapshots
};

// Constants
const TRADE_HISTORY_MAX = 100000;
const ORDERBOOK_SNAPSHOTS_MAX = 100;

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

    async getAll({ limit = 50, category = null, resolved = false } = {}) {
        let results = Array.from(store.events.values())
            .filter(e => e.resolved === resolved);

        if (category) {
            results = results.filter(e => e.category === category);
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
        const id = Date.now().toString();
        const slug = article.slug || slugify(article.headline);
        const record = {
            id,
            ...article,
            slug,
            publishedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };
        store.articles.set(id, record);
        return record;
    },

    async update(id, updates) {
        const existing = store.articles.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...updates };
        store.articles.set(id, updated);
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
        for (const article of store.articles.values()) {
            if (article.eventId === eventId) return article;
        }
        return null;
    },

    async getAll({
        limit = 20,
        offset = 0,
        category = null,
        sort = 'publishedAt'
    } = {}) {
        let results = Array.from(store.articles.values());

        if (category) {
            results = results.filter(a => a.category === category);
        }

        // Sort
        if (sort === 'probability') {
            results.sort((a, b) => (b.probability || 0) - (a.probability || 0));
        } else {
            results.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        }

        return results.slice(offset, offset + limit);
    },

    async getFeatured(limit = 5) {
        return Array.from(store.articles.values())
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
    // Utility
    slugify,
    // For testing/debugging
    _store: store
};
