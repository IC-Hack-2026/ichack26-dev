// Wallet Accuracy Signal Processor
// Detects wallets with statistically improbable win rates

const BaseProcessor = require('../base-processor');
const { walletTracker } = require('../../wallet/tracker');
const config = require('../../../config');

class WalletAccuracyProcessor extends BaseProcessor {
    constructor() {
        super('wallet-accuracy', config.signals.walletAccuracy.weight);

        // Load thresholds from config
        this.minWinRate = config.signals.walletAccuracy.minWinRate;
        this.minResolvedPositions = config.signals.walletAccuracy.minResolvedPositions;
    }

    /**
     * Process a trade event to detect wallets with statistically improbable win rates
     *
     * @param {Object} event - The event being processed
     * @param {Object} market - Market data
     * @param {Object} trade - Trade data with address and side
     * @returns {Promise<Object>} Signal result
     */
    async process(event, market, trade) {
        // Get wallet address from trade
        const address = (trade.maker || trade.taker || trade.address || '').toLowerCase();

        if (!address) {
            return { detected: false };
        }

        // Get wallet accuracy statistics
        const accuracy = await walletTracker.getWalletAccuracy(address);
        const { winRate, resolvedPositions, wins, losses } = accuracy;

        // Check if conditions are met for detection
        if (winRate > this.minWinRate && resolvedPositions >= this.minResolvedPositions) {
            // Calculate z-score for statistical significance
            // Expected win rate assuming random = 0.5
            const expectedWinRate = 0.5;
            const standardError = Math.sqrt((expectedWinRate * (1 - expectedWinRate)) / resolvedPositions);
            const zScore = (winRate - expectedWinRate) / standardError;

            // Calculate confidence (z=3 is very significant, so normalize to that)
            const confidence = Math.min(zScore / 3, 1);

            // Determine severity
            const severity = (winRate > 0.85 || zScore > 3) ? 'HIGH' : 'MEDIUM';

            return {
                detected: true,
                confidence,
                direction: trade.side,
                severity,
                metadata: {
                    winRate,
                    resolvedPositions,
                    wins,
                    losses,
                    zScore,
                    address: trade.address
                }
            };
        }

        return { detected: false };
    }
}

// Export class and singleton instance
const walletAccuracyProcessor = new WalletAccuracyProcessor();

module.exports = {
    WalletAccuracyProcessor,
    walletAccuracyProcessor
};
