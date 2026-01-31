// Database layer with in-memory fallback
// Can be replaced with PostgreSQL for production

const config = require('../config');

// In-memory store (used when DB not configured)
const store = {
    events: new Map(),
    predictions: new Map(),
    articles: new Map(),
    signals: new Map(),
    backtestRuns: []
};

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

module.exports = {
    events,
    predictions,
    articles,
    signals,
    backtests,
    // Utility
    slugify,
    // For testing/debugging
    _store: store
};
