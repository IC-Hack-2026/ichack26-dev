/**
 * Profile Builder - Builds and manages wallet profile objects
 *
 * Responsible for creating initial profiles and calculating risk scores
 * based on trading patterns and suspicious activity.
 */

const db = require('../../db');
const config = require('../../config');

class ProfileBuilder {
    /**
     * Build an initial profile object for a wallet address
     * @param {string} address - Wallet address
     * @returns {Object} Initial profile object
     */
    buildProfile(address) {
        const now = new Date().toISOString();

        return {
            address: address.toLowerCase(),
            firstTradeAt: now,
            lastTradeAt: now,
            totalTrades: 0,
            totalVolume: 0,
            resolvedPositions: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            avgProfit: 0,
            avgTradeSize: 0,
            maxTradeSize: 0,
            riskScore: 0,
            suspiciousFlags: []
        };
    }

    /**
     * Calculate risk score (0-100) based on trade patterns
     * Higher score = more suspicious activity
     *
     * Factors considered:
     * - High win rate with sufficient resolved positions
     * - Fresh wallet with large trades
     * - Average trade size relative to volume
     * - Presence of suspicious flags
     *
     * @param {Object} profile - Wallet profile object
     * @returns {number} Risk score 0-100
     */
    calculateRiskScore(profile) {
        let score = 0;

        // Factor 1: High win rate (up to 30 points)
        // Only significant if wallet has enough resolved positions
        const minPositions = config.signals.walletAccuracy.minResolvedPositions;
        const minWinRate = config.signals.walletAccuracy.minWinRate;

        if (profile.resolvedPositions >= minPositions) {
            if (profile.winRate >= 0.9) {
                score += 30; // Extremely high win rate
            } else if (profile.winRate >= minWinRate) {
                // Scale from 15-30 based on win rate above threshold
                const winRateAboveThreshold = (profile.winRate - minWinRate) / (0.9 - minWinRate);
                score += 15 + Math.floor(winRateAboveThreshold * 15);
            }
        }

        // Factor 2: Fresh wallet with large trades (up to 25 points)
        const maxAgeDays = config.signals.freshWallet.maxAgeDays;
        const maxTrades = config.signals.freshWallet.maxTrades;
        const minTradeSize = config.signals.freshWallet.minTradeSize;

        const walletAgeDays = this._getWalletAgeDays(profile);
        const isFresh = walletAgeDays < maxAgeDays || profile.totalTrades < maxTrades;

        if (isFresh && profile.avgTradeSize >= minTradeSize) {
            // Fresh wallet making large trades is suspicious
            const tradeSizeMultiplier = Math.min(profile.avgTradeSize / minTradeSize, 5);
            score += Math.floor(5 * tradeSizeMultiplier);
        }

        // Factor 3: Unusual trade size patterns (up to 20 points)
        // High max trade relative to average suggests strategic large bets
        if (profile.avgTradeSize > 0 && profile.maxTradeSize > 0) {
            const sizeRatio = profile.maxTradeSize / profile.avgTradeSize;
            if (sizeRatio > 10) {
                score += 20; // Very unusual - one huge trade among smaller ones
            } else if (sizeRatio > 5) {
                score += 10;
            } else if (sizeRatio > 3) {
                score += 5;
            }
        }

        // Factor 4: Suspicious flags (up to 25 points)
        // Each flag adds to the risk score
        const flagWeights = {
            'high_win_rate': 10,
            'fresh_wallet_large_trade': 8,
            'sniper_cluster_member': 8,
            'unusual_timing': 6,
            'liquidity_impact': 6,
            'coordinated_trading': 10,
            'rapid_position_close': 5
        };

        if (profile.suspiciousFlags && profile.suspiciousFlags.length > 0) {
            for (const flag of profile.suspiciousFlags) {
                const flagName = typeof flag === 'string' ? flag : flag.flag;
                score += flagWeights[flagName] || 3;
            }
        }

        // Cap at 100
        return Math.min(score, 100);
    }

    /**
     * Add a suspicious flag to a wallet's profile
     * @param {string} address - Wallet address
     * @param {string} flag - Flag type (e.g., 'high_win_rate', 'fresh_wallet_large_trade')
     * @param {Object} metadata - Optional metadata about the flag
     * @returns {Promise<Object>} Updated profile
     */
    async addSuspiciousFlag(address, flag, metadata = {}) {
        const normalizedAddress = address.toLowerCase();
        let profile = await db.walletProfiles.getByAddress(normalizedAddress);

        if (!profile) {
            profile = this.buildProfile(normalizedAddress);
        }

        // Initialize suspiciousFlags if needed
        if (!profile.suspiciousFlags) {
            profile.suspiciousFlags = [];
        }

        // Create flag entry with timestamp and metadata
        const flagEntry = {
            flag,
            addedAt: new Date().toISOString(),
            ...metadata
        };

        // Check if flag already exists (don't duplicate)
        const existingFlag = profile.suspiciousFlags.find(f => {
            const existingFlagName = typeof f === 'string' ? f : f.flag;
            return existingFlagName === flag;
        });

        if (!existingFlag) {
            profile.suspiciousFlags.push(flagEntry);

            // Recalculate risk score with new flag
            profile.riskScore = this.calculateRiskScore(profile);

            // Save updated profile
            await db.walletProfiles.upsert(normalizedAddress, profile);
        }

        return profile;
    }

    /**
     * Helper: Calculate wallet age in days
     * @param {Object} profile - Wallet profile
     * @returns {number} Age in days
     */
    _getWalletAgeDays(profile) {
        if (!profile.firstTradeAt) {
            return 0;
        }
        const firstTrade = new Date(profile.firstTradeAt);
        const now = new Date();
        const diffMs = now - firstTrade;
        return diffMs / (1000 * 60 * 60 * 24);
    }
}

// Export class and singleton instance
const profileBuilder = new ProfileBuilder();

module.exports = {
    ProfileBuilder,
    profileBuilder
};
