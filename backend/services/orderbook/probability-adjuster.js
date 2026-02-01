/**
 * ProbabilityAdjuster
 * Combines base Polymarket probability with whale trade signals.
 * Uses time decay to reduce the impact of older signals.
 */

const EventEmitter = require('events');

class ProbabilityAdjuster extends EventEmitter {
    /**
     * Create a new ProbabilityAdjuster instance
     * @param {Object} config - Configuration options
     */
    constructor(config = {}) {
        super();
        this.config = {
            whaleWeight: 0.15,           // Max adjustment from whale activity (15%)
            decayHalfLifeMs: 300000,     // 5 min half-life for signal decay
            maxSignalAge: 1800000,       // 30 min max age before signal is discarded
            ...config
        };
        this.whaleSignals = new Map(); // assetId -> { direction, strength, timestamp, trades }
    }

    /**
     * Record a whale trade and update the signal for that asset
     * @param {Object} whaleTrade - Whale trade detection result
     * @param {string} whaleTrade.assetId - Asset identifier
     * @param {string} whaleTrade.side - 'BUY' or 'SELL'
     * @param {number} whaleTrade.depthPercent - Percentage of book depth consumed
     * @param {number} whaleTrade.notional - Trade notional value
     */
    recordWhaleTrade(whaleTrade) {
        const { assetId, side, depthPercent, notional } = whaleTrade;

        // BUY = positive signal (towards YES/higher probability)
        // SELL = negative signal (towards NO/lower probability)
        const direction = side === 'BUY' ? 1 : -1;

        // Strength based on depth percent (capped at 1)
        // 20% of book depth = max strength
        const strength = Math.min(depthPercent / 20, 1);

        const existing = this.whaleSignals.get(assetId);
        const now = Date.now();

        if (existing) {
            // Decay the existing signal before adding new one
            const existingDecayed = this._applyDecay(existing);

            // Combine signals - weighted average with emphasis on newer signal
            const combinedDirection = (existingDecayed.direction * existingDecayed.strength * 0.5 +
                                       direction * strength) /
                                      (existingDecayed.strength * 0.5 + strength);

            const combinedStrength = Math.min(existingDecayed.strength * 0.5 + strength, 1);

            this.whaleSignals.set(assetId, {
                direction: combinedDirection,
                strength: combinedStrength,
                timestamp: now,
                trades: (existing.trades || 0) + 1,
                lastNotional: notional,
                totalNotional: (existing.totalNotional || 0) + notional,
                netDirection: combinedDirection > 0 ? 'BUY' : 'SELL'
            });
        } else {
            this.whaleSignals.set(assetId, {
                direction,
                strength,
                timestamp: now,
                trades: 1,
                lastNotional: notional,
                totalNotional: notional,
                netDirection: direction > 0 ? 'BUY' : 'SELL'
            });
        }
    }

    /**
     * Get the adjusted probability for an asset
     * @param {string} assetId - Asset identifier
     * @param {number} baseProbability - Base probability from Polymarket (0-1)
     * @returns {number} Adjusted probability (0.01-0.99)
     */
    getAdjustedProbability(assetId, baseProbability) {
        const signal = this.whaleSignals.get(assetId);

        if (!signal) {
            return baseProbability;
        }

        // Check if signal is too old
        const age = Date.now() - signal.timestamp;
        if (age > this.config.maxSignalAge) {
            this.whaleSignals.delete(assetId);
            return baseProbability;
        }

        // Apply time decay
        const decayFactor = Math.pow(0.5, age / this.config.decayHalfLifeMs);
        const effectiveStrength = signal.strength * decayFactor;

        // Calculate adjustment (bounded to prevent extreme swings)
        const adjustment = signal.direction * effectiveStrength * this.config.whaleWeight;

        // Clamp to [0.01, 0.99] to avoid certainty
        return Math.max(0.01, Math.min(0.99, baseProbability + adjustment));
    }

    /**
     * Get whale activity info for an asset (for API responses)
     * @param {string} assetId - Asset identifier
     * @returns {Object|null} Whale activity summary or null if no activity
     */
    getWhaleActivity(assetId) {
        const signal = this.whaleSignals.get(assetId);

        if (!signal) {
            return null;
        }

        // Check if signal is too old
        const age = Date.now() - signal.timestamp;
        if (age > this.config.maxSignalAge) {
            this.whaleSignals.delete(assetId);
            return null;
        }

        // Apply decay for current strength
        const decayFactor = Math.pow(0.5, age / this.config.decayHalfLifeMs);
        const effectiveStrength = signal.strength * decayFactor;

        return {
            recentTrades: signal.trades,
            netDirection: signal.netDirection,
            signalStrength: parseFloat(effectiveStrength.toFixed(3)),
            totalNotional: signal.totalNotional,
            lastTradeAt: signal.timestamp,
            ageMs: age
        };
    }

    /**
     * Get all active signals (for debugging/monitoring)
     * @returns {Array} Array of signal objects with asset IDs
     */
    getAllSignals() {
        const signals = [];
        const now = Date.now();

        for (const [assetId, signal] of this.whaleSignals) {
            const age = now - signal.timestamp;

            // Skip expired signals
            if (age > this.config.maxSignalAge) {
                continue;
            }

            const decayFactor = Math.pow(0.5, age / this.config.decayHalfLifeMs);

            signals.push({
                assetId,
                ...signal,
                effectiveStrength: signal.strength * decayFactor,
                ageMs: age
            });
        }

        return signals;
    }

    /**
     * Clean up expired signals
     * @returns {number} Number of signals removed
     */
    cleanup() {
        const now = Date.now();
        let removed = 0;

        for (const [assetId, signal] of this.whaleSignals) {
            if (now - signal.timestamp > this.config.maxSignalAge) {
                this.whaleSignals.delete(assetId);
                removed++;
            }
        }

        return removed;
    }

    /**
     * Update configuration
     * @param {Object} newConfig - New configuration values to merge
     */
    updateConfig(newConfig) {
        this.config = {
            ...this.config,
            ...newConfig
        };
    }

    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Apply decay to a signal based on its age
     * @private
     */
    _applyDecay(signal) {
        const age = Date.now() - signal.timestamp;
        const decayFactor = Math.pow(0.5, age / this.config.decayHalfLifeMs);

        return {
            ...signal,
            strength: signal.strength * decayFactor
        };
    }

    /**
     * Load whale signals from persisted history
     * Called on server startup to restore state from database
     * @param {Array} whaleTrades - Array of whale trade records from db.whaleTrades
     * @returns {number} Number of signals loaded
     */
    loadFromHistory(whaleTrades) {
        if (!Array.isArray(whaleTrades)) {
            return 0;
        }

        let loaded = 0;
        const now = Date.now();

        for (const trade of whaleTrades) {
            const tradeTime = typeof trade.timestamp === 'number'
                ? trade.timestamp
                : new Date(trade.recordedAt).getTime();
            const age = now - tradeTime;

            // Skip trades older than maxSignalAge
            if (age > this.config.maxSignalAge) {
                continue;
            }

            this.recordWhaleTrade({
                assetId: trade.assetId,
                side: trade.side,
                depthPercent: trade.depthPercent,
                notional: trade.notional
            });
            loaded++;
        }

        return loaded;
    }
}

// Singleton instance
const probabilityAdjuster = new ProbabilityAdjuster();

module.exports = {
    ProbabilityAdjuster,
    probabilityAdjuster
};
