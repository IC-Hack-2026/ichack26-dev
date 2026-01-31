// Funding Analyzer
// Detects potentially connected wallets by analyzing funding patterns

const db = require('../../db');

// Constants for analysis
const SHORT_TIME_WINDOW_MS = 60 * 60 * 1000; // 1 hour - wallets funded within this window are suspicious
const MEDIUM_TIME_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_CLUSTER_CONFIDENCE = 0.5;
const SAME_SOURCE_WEIGHT = 0.4;
const SIMILAR_TIMING_WEIGHT = 0.3;
const SIMILAR_TRADES_WEIGHT = 0.2;
const ROUND_TRIP_WEIGHT = 0.1;

class FundingAnalyzer {
    constructor() {
        // In-memory store for funding events (lightweight tracking)
        this.fundingEvents = new Map(); // address -> [{ source, amount, timestamp }]
        this.sourceToWallets = new Map(); // source address -> [{ address, timestamp, amount }]
    }

    /**
     * Analyze a wallet's funding source and pattern
     * @param {string} address - Wallet address to analyze
     * @returns {Promise<Object>} Funding analysis result
     */
    async analyzeWalletFunding(address) {
        const normalizedAddress = address.toLowerCase();

        // Get wallet profile from DB
        const profile = await db.walletProfiles.getByAddress(normalizedAddress);

        // Get funding events for this wallet
        const fundingHistory = this.fundingEvents.get(normalizedAddress) || [];

        // Determine primary funding source
        const fundingSource = this._determinePrimaryFundingSource(fundingHistory);

        // Calculate funding age (time since first funding)
        const fundingAge = this._calculateFundingAge(fundingHistory);

        // Find connected wallets (same funding source, similar patterns)
        const connectedWallets = await this._findConnectedWallets(normalizedAddress, fundingSource);

        // Determine if this wallet shows suspicious funding patterns
        const isSuspicious = this._checkSuspiciousPatterns(
            fundingHistory,
            connectedWallets,
            profile
        );

        return {
            fundingSource,
            fundingAge,
            connectedWallets,
            isSuspicious
        };
    }

    /**
     * Detect clusters of potentially connected wallets
     * @param {string[]} addresses - Array of wallet addresses to analyze
     * @returns {Promise<Array>} Array of detected clusters
     */
    async detectConnectedWallets(addresses) {
        const normalizedAddresses = addresses.map(a => a.toLowerCase());
        const clusters = [];
        const processed = new Set();

        for (const address of normalizedAddresses) {
            if (processed.has(address)) continue;

            const cluster = await this._buildCluster(address, normalizedAddresses, processed);

            if (cluster.addresses.length > 1) {
                clusters.push({
                    cluster: cluster.addresses,
                    confidence: cluster.confidence,
                    reason: cluster.reasons.join('; ')
                });
            }
        }

        return clusters;
    }

    /**
     * Get all wallets potentially connected to a given wallet
     * @param {string} address - Wallet address
     * @returns {Promise<Object>} Cluster information
     */
    async getWalletCluster(address) {
        const normalizedAddress = address.toLowerCase();

        // Start with analyzing this wallet's funding
        const analysis = await this.analyzeWalletFunding(normalizedAddress);

        // Build the full cluster
        const allConnected = new Set(analysis.connectedWallets);
        const toProcess = [...analysis.connectedWallets];

        // Expand cluster (limited depth to avoid infinite loops)
        let depth = 0;
        const maxDepth = 3;

        while (toProcess.length > 0 && depth < maxDepth) {
            const current = toProcess.shift();
            if (current === normalizedAddress) continue;

            const connectedAnalysis = await this.analyzeWalletFunding(current);
            for (const connected of connectedAnalysis.connectedWallets) {
                if (!allConnected.has(connected) && connected !== normalizedAddress) {
                    allConnected.add(connected);
                    toProcess.push(connected);
                }
            }
            depth++;
        }

        // Calculate total volume across cluster
        let totalVolume = 0;
        const mainProfile = await db.walletProfiles.getByAddress(normalizedAddress);
        totalVolume += mainProfile?.totalVolume || 0;

        for (const connectedAddr of allConnected) {
            const profile = await db.walletProfiles.getByAddress(connectedAddr);
            totalVolume += profile?.totalVolume || 0;
        }

        // Calculate cluster confidence based on connection signals
        const clusterConfidence = this._calculateClusterConfidence(
            normalizedAddress,
            Array.from(allConnected)
        );

        return {
            mainWallet: normalizedAddress,
            connected: Array.from(allConnected),
            totalVolume,
            clusterConfidence
        };
    }

    /**
     * Record a funding event for a wallet
     * @param {string} address - Wallet that received funds
     * @param {string} source - Source address of funds
     * @param {number} amount - Amount received
     * @param {Date|string} timestamp - When the funding occurred
     */
    recordFundingEvent(address, source, amount, timestamp) {
        const normalizedAddress = address.toLowerCase();
        const normalizedSource = source.toLowerCase();
        const ts = new Date(timestamp).getTime();

        // Record in address's funding history
        if (!this.fundingEvents.has(normalizedAddress)) {
            this.fundingEvents.set(normalizedAddress, []);
        }
        this.fundingEvents.get(normalizedAddress).push({
            source: normalizedSource,
            amount,
            timestamp: ts
        });

        // Record in source's distribution map
        if (!this.sourceToWallets.has(normalizedSource)) {
            this.sourceToWallets.set(normalizedSource, []);
        }
        this.sourceToWallets.get(normalizedSource).push({
            address: normalizedAddress,
            amount,
            timestamp: ts
        });
    }

    // ========== Private Helper Methods ==========

    /**
     * Determine the primary funding source for a wallet
     */
    _determinePrimaryFundingSource(fundingHistory) {
        if (fundingHistory.length === 0) return null;

        // Find most common source or largest single source
        const sourceAmounts = new Map();

        for (const event of fundingHistory) {
            const current = sourceAmounts.get(event.source) || 0;
            sourceAmounts.set(event.source, current + event.amount);
        }

        let primarySource = null;
        let maxAmount = 0;

        for (const [source, amount] of sourceAmounts) {
            if (amount > maxAmount) {
                maxAmount = amount;
                primarySource = source;
            }
        }

        return primarySource;
    }

    /**
     * Calculate how long ago the wallet was first funded
     */
    _calculateFundingAge(fundingHistory) {
        if (fundingHistory.length === 0) return null;

        const firstFunding = Math.min(...fundingHistory.map(e => e.timestamp));
        const ageMs = Date.now() - firstFunding;

        return {
            ms: ageMs,
            days: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
            firstFundingDate: new Date(firstFunding).toISOString()
        };
    }

    /**
     * Find wallets connected to this one via funding patterns
     */
    async _findConnectedWallets(address, fundingSource) {
        const connected = new Set();

        if (fundingSource) {
            // Find other wallets funded by the same source
            const siblingWallets = this.sourceToWallets.get(fundingSource) || [];

            for (const sibling of siblingWallets) {
                if (sibling.address !== address) {
                    connected.add(sibling.address);
                }
            }
        }

        // Check for similar trade patterns
        const similarTraders = await this._findWalletsWithSimilarTrades(address);
        for (const trader of similarTraders) {
            connected.add(trader);
        }

        // Check for round-trip transactions
        const roundTripPartners = this._findRoundTripPartners(address);
        for (const partner of roundTripPartners) {
            connected.add(partner);
        }

        return Array.from(connected);
    }

    /**
     * Find wallets with similar trading patterns
     */
    async _findWalletsWithSimilarTrades(address) {
        const similar = [];

        // Get trades for this wallet
        const trades = await db.tradeHistory.getByWallet(address, 50);
        if (trades.length === 0) return similar;

        // Extract markets and timing patterns
        const markets = new Set(trades.map(t => t.tokenId || t.marketId));
        const tradeTimes = trades.map(t => new Date(t.timestamp || t.recordedAt).getTime());

        // Get all wallet profiles to compare
        const allProfiles = await db.walletProfiles.getAll({ limit: 100 });

        for (const profile of allProfiles) {
            if (profile.address === address) continue;

            const otherTrades = await db.tradeHistory.getByWallet(profile.address, 50);
            if (otherTrades.length === 0) continue;

            // Check market overlap
            const otherMarkets = new Set(otherTrades.map(t => t.tokenId || t.marketId));
            const marketOverlap = [...markets].filter(m => otherMarkets.has(m)).length;

            if (marketOverlap < 2) continue; // Need at least 2 common markets

            // Check timing overlap
            const otherTimes = otherTrades.map(t => new Date(t.timestamp || t.recordedAt).getTime());
            const timingScore = this._calculateTimingOverlap(tradeTimes, otherTimes);

            if (timingScore > 0.5) {
                similar.push(profile.address);
            }
        }

        return similar;
    }

    /**
     * Calculate timing overlap between two sets of trade times
     */
    _calculateTimingOverlap(times1, times2) {
        if (times1.length === 0 || times2.length === 0) return 0;

        let closeMatches = 0;

        for (const t1 of times1) {
            for (const t2 of times2) {
                if (Math.abs(t1 - t2) < SHORT_TIME_WINDOW_MS) {
                    closeMatches++;
                    break;
                }
            }
        }

        return closeMatches / times1.length;
    }

    /**
     * Find wallets that have round-trip transactions with this wallet
     */
    _findRoundTripPartners(address) {
        const partners = [];
        const funding = this.fundingEvents.get(address) || [];

        // Check if this wallet both funded and was funded by another wallet
        for (const event of funding) {
            const sourceFunding = this.fundingEvents.get(event.source) || [];
            const funded = sourceFunding.some(e => e.source === address);

            if (funded) {
                partners.push(event.source);
            }
        }

        return partners;
    }

    /**
     * Check for suspicious funding patterns
     */
    _checkSuspiciousPatterns(fundingHistory, connectedWallets, profile) {
        const flags = [];

        // Flag 1: Multiple wallets funded from same source in short time window
        if (connectedWallets.length >= 3) {
            flags.push('multiple_connected_wallets');
        }

        // Flag 2: Wallet is very new but already trading
        const age = this._calculateFundingAge(fundingHistory);
        if (age && age.days < 7 && profile?.totalTrades > 10) {
            flags.push('new_wallet_high_activity');
        }

        // Flag 3: Same source funded many wallets recently
        if (fundingHistory.length > 0) {
            const source = fundingHistory[0].source;
            const sourcedWallets = this.sourceToWallets.get(source) || [];
            const recentFundings = sourcedWallets.filter(
                w => Date.now() - w.timestamp < MEDIUM_TIME_WINDOW_MS
            );
            if (recentFundings.length >= 5) {
                flags.push('source_funding_many_wallets');
            }
        }

        // Flag 4: Round-trip transactions detected
        const roundTripPartners = this._findRoundTripPartners(
            fundingHistory.length > 0 ? fundingHistory[0].source : null
        );
        if (roundTripPartners.length > 0) {
            flags.push('round_trip_detected');
        }

        return flags.length > 0;
    }

    /**
     * Build a cluster of connected wallets
     */
    async _buildCluster(startAddress, allAddresses, processed) {
        const clusterAddresses = [startAddress];
        const reasons = [];
        let totalConfidence = 0;
        let connectionCount = 0;

        processed.add(startAddress);

        const startFunding = this.fundingEvents.get(startAddress) || [];
        const startSource = this._determinePrimaryFundingSource(startFunding);
        const startTrades = await db.tradeHistory.getByWallet(startAddress, 50);

        for (const address of allAddresses) {
            if (processed.has(address)) continue;

            let confidence = 0;
            const connectionReasons = [];

            // Check same funding source
            const funding = this.fundingEvents.get(address) || [];
            const source = this._determinePrimaryFundingSource(funding);

            if (startSource && source === startSource) {
                confidence += SAME_SOURCE_WEIGHT;
                connectionReasons.push('same_funding_source');

                // Check if funded within short time window
                const startTimes = startFunding.filter(f => f.source === startSource).map(f => f.timestamp);
                const addressTimes = funding.filter(f => f.source === source).map(f => f.timestamp);

                for (const t1 of startTimes) {
                    for (const t2 of addressTimes) {
                        if (Math.abs(t1 - t2) < SHORT_TIME_WINDOW_MS) {
                            confidence += SIMILAR_TIMING_WEIGHT;
                            connectionReasons.push('funded_within_1hr');
                            break;
                        }
                    }
                }
            }

            // Check similar trade patterns
            const trades = await db.tradeHistory.getByWallet(address, 50);
            if (startTrades.length > 0 && trades.length > 0) {
                const startMarkets = new Set(startTrades.map(t => t.tokenId || t.marketId));
                const markets = new Set(trades.map(t => t.tokenId || t.marketId));
                const overlap = [...startMarkets].filter(m => markets.has(m)).length;

                if (overlap >= 2) {
                    confidence += SIMILAR_TRADES_WEIGHT * (overlap / startMarkets.size);
                    connectionReasons.push(`${overlap}_common_markets`);
                }
            }

            // Check round-trip transactions
            const isRoundTrip = this._checkRoundTrip(startAddress, address);
            if (isRoundTrip) {
                confidence += ROUND_TRIP_WEIGHT;
                connectionReasons.push('round_trip_transactions');
            }

            if (confidence >= MIN_CLUSTER_CONFIDENCE) {
                clusterAddresses.push(address);
                processed.add(address);
                totalConfidence += confidence;
                connectionCount++;
                reasons.push(...connectionReasons);
            }
        }

        return {
            addresses: clusterAddresses,
            confidence: connectionCount > 0 ? totalConfidence / connectionCount : 0,
            reasons: [...new Set(reasons)]
        };
    }

    /**
     * Check if two wallets have round-trip transactions
     */
    _checkRoundTrip(address1, address2) {
        const funding1 = this.fundingEvents.get(address1) || [];
        const funding2 = this.fundingEvents.get(address2) || [];

        const addr1FundedBy2 = funding1.some(e => e.source === address2);
        const addr2FundedBy1 = funding2.some(e => e.source === address1);

        return addr1FundedBy2 && addr2FundedBy1;
    }

    /**
     * Calculate overall confidence for a wallet cluster
     */
    _calculateClusterConfidence(mainWallet, connectedWallets) {
        if (connectedWallets.length === 0) return 0;

        let totalSignals = 0;
        let maxPossibleSignals = connectedWallets.length * 4; // 4 types of signals

        const mainFunding = this.fundingEvents.get(mainWallet) || [];
        const mainSource = this._determinePrimaryFundingSource(mainFunding);

        for (const connected of connectedWallets) {
            const funding = this.fundingEvents.get(connected) || [];
            const source = this._determinePrimaryFundingSource(funding);

            // Same source signal
            if (mainSource && source === mainSource) {
                totalSignals++;
            }

            // Timing signal
            const mainTimes = mainFunding.map(f => f.timestamp);
            const connectedTimes = funding.map(f => f.timestamp);
            if (this._calculateTimingOverlap(mainTimes, connectedTimes) > 0.3) {
                totalSignals++;
            }

            // Round-trip signal
            if (this._checkRoundTrip(mainWallet, connected)) {
                totalSignals++;
            }
        }

        return Math.min(totalSignals / maxPossibleSignals, 1);
    }
}

// Create singleton instance
const fundingAnalyzer = new FundingAnalyzer();

module.exports = {
    FundingAnalyzer,
    fundingAnalyzer
};
