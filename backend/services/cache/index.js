// In-memory cache with TTL support
// Can be replaced with Redis for production

const config = require('../../config');

class Cache {
    constructor() {
        this.store = new Map();
        this.timers = new Map();
    }

    set(key, value, ttl = config.cache.articleTTL) {
        // Clear existing timer
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }

        this.store.set(key, {
            value,
            createdAt: Date.now()
        });

        // Set expiration timer
        const timer = setTimeout(() => {
            this.delete(key);
        }, ttl);
        this.timers.set(key, timer);
    }

    get(key) {
        const item = this.store.get(key);
        return item ? item.value : null;
    }

    has(key) {
        return this.store.has(key);
    }

    delete(key) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
        return this.store.delete(key);
    }

    clear() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        this.store.clear();
    }

    // Get with callback for cache-aside pattern
    async getOrSet(key, fetchFn, ttl) {
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }

        const value = await fetchFn();
        if (value !== null && value !== undefined) {
            this.set(key, value, ttl);
        }
        return value;
    }

    size() {
        return this.store.size;
    }

    keys() {
        return Array.from(this.store.keys());
    }
}

// Singleton instance
const cache = new Cache();

module.exports = cache;
