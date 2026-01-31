// Sniper Cluster Signal Processor
// Detects coordinated trading activity from multiple wallets

const BaseProcessor = require('../base-processor');
const db = require('../../../db/index');
const { fundingAnalyzer } = require('../../wallet/funding-analyzer');
const config = require('../../../config/index');

class SniperClusterProcessor extends BaseProcessor {
    constructor() {
        super('sniper-cluster', config.signals.sniperCluster.weight);

        // Load thresholds from config
        this.windowMinutes = config.signals.sniperCluster.windowMinutes;
        this.minWallets = config.signals.sniperCluster.minWallets;
    }

    /**
     * Process market data to detect coordinated trading activity
     *
     * @param {Object} event - The event being processed
     * @param {Object} market - Market data with tokenId
     * @returns {Promise<Object>} Signal result
     */
    async process(event, market) {
        // Get recent trades for this market
        const trades = await db.tradeHistory.getByMarket(market.tokenId);

        if (!trades || trades.length === 0) {
            return { detected: false, confidence: 0, direction: null, metadata: {} };
        }

        // Detect timing clusters in the trades
        const clusters = await this.detectTimingClusters(trades);

        if (clusters.length === 0) {
            return { detected: false, confidence: 0, direction: null, metadata: {} };
        }

        // Find the largest/most confident cluster
        const largestCluster = clusters.reduce((best, current) => {
            const currentScore = current.wallets.length * current.confidence;
            const bestScore = best.wallets.length * best.confidence;
            return currentScore > bestScore ? current : best;
        }, clusters[0]);

        const clusterSize = largestCluster.wallets.length;
        const confidence = Math.min(clusterSize / 10, 1);
        const severity = clusterSize >= 5 ? 'HIGH' : 'MEDIUM';

        return {
            detected: true,
            confidence,
            direction: largestCluster.direction,
            severity,
            metadata: {
                clusterSize,
                wallets: largestCluster.wallets,
                windowMs: this.windowMinutes * 60 * 1000,
                totalVolume: largestCluster.volume,
                direction: largestCluster.direction
            }
        };
    }

    /**
     * Detect timing clusters in trades - groups of wallets trading same direction in short windows
     *
     * @param {Array} trades - Array of trade records
     * @returns {Promise<Array>} Array of detected clusters
     */
    async detectTimingClusters(trades) {
        const windowMs = this.windowMinutes * 60 * 1000;
        const clusters = [];

        // Sort trades by timestamp
        const sortedTrades = [...trades].sort((a, b) => {
            const timeA = new Date(a.timestamp || a.recordedAt).getTime();
            const timeB = new Date(b.timestamp || b.recordedAt).getTime();
            return timeA - timeB;
        });

        if (sortedTrades.length === 0) {
            return clusters;
        }

        // Group trades by time windows
        const windows = [];
        let currentWindow = {
            startTime: new Date(sortedTrades[0].timestamp || sortedTrades[0].recordedAt).getTime(),
            trades: []
        };

        for (const trade of sortedTrades) {
            const tradeTime = new Date(trade.timestamp || trade.recordedAt).getTime();

            if (tradeTime - currentWindow.startTime <= windowMs) {
                currentWindow.trades.push(trade);
            } else {
                if (currentWindow.trades.length > 0) {
                    windows.push(currentWindow);
                }
                currentWindow = {
                    startTime: tradeTime,
                    trades: [trade]
                };
            }
        }

        // Add the last window
        if (currentWindow.trades.length > 0) {
            windows.push(currentWindow);
        }

        // Within each window, group by direction and find clusters
        for (const window of windows) {
            const yesTraders = new Map(); // address -> { volume, trades }
            const noTraders = new Map();

            for (const trade of window.trades) {
                const address = (trade.maker || trade.taker || trade.address || '').toLowerCase();
                if (!address) continue;

                const direction = trade.side || trade.direction || 'UNKNOWN';
                const volume = trade.size || trade.amount || trade.volume || 0;

                const traderMap = direction === 'YES' ? yesTraders : (direction === 'NO' ? noTraders : null);

                if (traderMap) {
                    if (!traderMap.has(address)) {
                        traderMap.set(address, { volume: 0, trades: [] });
                    }
                    const traderData = traderMap.get(address);
                    traderData.volume += volume;
                    traderData.trades.push(trade);
                }
            }

            // Check YES direction cluster
            if (yesTraders.size >= this.minWallets) {
                const cluster = await this.buildCluster(yesTraders, 'YES', window);
                if (cluster) {
                    clusters.push(cluster);
                }
            }

            // Check NO direction cluster
            if (noTraders.size >= this.minWallets) {
                const cluster = await this.buildCluster(noTraders, 'NO', window);
                if (cluster) {
                    clusters.push(cluster);
                }
            }
        }

        return clusters;
    }

    /**
     * Build a cluster object with connection analysis
     *
     * @param {Map} traderMap - Map of address -> { volume, trades }
     * @param {string} direction - 'YES' or 'NO'
     * @param {Object} window - Time window object
     * @returns {Promise<Object|null>} Cluster object or null
     */
    async buildCluster(traderMap, direction, window) {
        const wallets = Array.from(traderMap.keys());

        if (wallets.length < this.minWallets) {
            return null;
        }

        // Calculate total volume
        let totalVolume = 0;
        for (const [, data] of traderMap) {
            totalVolume += data.volume;
        }

        // Get trade times for start/end calculation
        let startTime = Infinity;
        let endTime = -Infinity;

        for (const [, data] of traderMap) {
            for (const trade of data.trades) {
                const tradeTime = new Date(trade.timestamp || trade.recordedAt).getTime();
                startTime = Math.min(startTime, tradeTime);
                endTime = Math.max(endTime, tradeTime);
            }
        }

        // Check for additional connection signals using fundingAnalyzer
        let connectionConfidence = 0;
        try {
            const connectedClusters = await fundingAnalyzer.detectConnectedWallets(wallets);
            if (connectedClusters.length > 0) {
                // Average confidence across detected clusters
                const avgConfidence = connectedClusters.reduce((sum, c) => sum + c.confidence, 0) / connectedClusters.length;
                connectionConfidence = avgConfidence;
            }
        } catch (error) {
            // If funding analysis fails, continue without it
            connectionConfidence = 0;
        }

        // Base confidence on cluster size + funding connections
        const sizeConfidence = Math.min(wallets.length / 10, 0.7);
        const confidence = Math.min(sizeConfidence + (connectionConfidence * 0.3), 1);

        return {
            wallets,
            direction,
            volume: totalVolume,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            confidence
        };
    }
}

// Export class and singleton instance
const sniperClusterProcessor = new SniperClusterProcessor();

module.exports = {
    SniperClusterProcessor,
    sniperClusterProcessor
};
