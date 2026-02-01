/**
 * Asset Registry
 * Maps token IDs to their event metadata (title, outcome).
 * Singleton service used to provide human-readable context for order books and whale trades.
 */

class AssetRegistry {
    constructor() {
        this.assets = new Map(); // tokenId -> { eventId, eventTitle, outcome, outcomeIndex }
    }

    /**
     * Register a token ID with its event metadata
     * @param {string} tokenId - The CLOB token ID
     * @param {Object} metadata - The metadata to associate
     * @param {string} metadata.eventId - The event ID
     * @param {string} metadata.eventTitle - Human-readable event title/question
     * @param {string} metadata.outcome - The outcome this token represents (e.g., "Yes", "No")
     * @param {number} metadata.outcomeIndex - Index in the outcomes array (0 or 1)
     */
    register(tokenId, metadata) {
        if (!tokenId) {
            return;
        }
        this.assets.set(tokenId, {
            eventId: metadata.eventId || null,
            eventTitle: metadata.eventTitle || null,
            outcome: metadata.outcome || null,
            outcomeIndex: metadata.outcomeIndex ?? null
        });
    }

    /**
     * Get metadata for a token ID
     * @param {string} tokenId - The CLOB token ID
     * @returns {Object|null} The metadata or null if not registered
     */
    get(tokenId) {
        return this.assets.get(tokenId) || null;
    }

    /**
     * Check if a token ID is registered
     * @param {string} tokenId - The CLOB token ID
     * @returns {boolean}
     */
    has(tokenId) {
        return this.assets.has(tokenId);
    }

    /**
     * Get all registered assets
     * @returns {Array} Array of { tokenId, ...metadata }
     */
    getAll() {
        const result = [];
        for (const [tokenId, metadata] of this.assets) {
            result.push({ tokenId, ...metadata });
        }
        return result;
    }

    /**
     * Get count of registered assets
     * @returns {number}
     */
    size() {
        return this.assets.size;
    }

    /**
     * Clear all registered assets
     */
    clear() {
        this.assets.clear();
    }
}

// Singleton instance
const assetRegistry = new AssetRegistry();

module.exports = {
    AssetRegistry,
    assetRegistry
};
