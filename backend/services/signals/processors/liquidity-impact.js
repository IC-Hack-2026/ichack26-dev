// Liquidity Impact Signal Processor
// Detects trades that consume significant order book depth

const BaseProcessor = require('../base-processor');
const { orderBookAnalyzer } = require('../../orderbook/analyzer');
const config = require('../../../config');

class LiquidityImpactProcessor extends BaseProcessor {
    constructor() {
        const weight = config.signals.liquidityImpact.weight;
        super('liquidity-impact', weight);
        this.threshold = config.signals.liquidityImpact.threshold || 0.02; // Default 2%
    }

    async process(event, market, trade, orderbook) {
        if (!trade || !orderbook) {
            return { detected: false };
        }

        const impact = orderBookAnalyzer.calculateLiquidityImpact(
            trade.size,
            trade.side,
            orderbook
        );

        const impactPercent = impact.impactPercent / 100; // Convert to decimal for comparison

        // Check if impact exceeds threshold (2%)
        if (impactPercent > this.threshold) {
            // Calculate confidence: 10% impact = 100% confidence
            const confidence = Math.min(impactPercent / 0.10, 1);

            // Determine severity
            const severity = impactPercent > 0.05 ? 'HIGH' : 'MEDIUM';

            return {
                detected: true,
                confidence,
                direction: trade.side,
                severity,
                metadata: {
                    impactPercent: impact.impactPercent,
                    levelsConsumed: impact.levelsConsumed,
                    avgFillPrice: impact.avgFillPrice,
                    slippage: impact.slippage,
                    tradeSize: trade.size
                }
            };
        }

        return { detected: false };
    }
}

// Export class and singleton instance
const liquidityImpactProcessor = new LiquidityImpactProcessor();

module.exports = {
    LiquidityImpactProcessor,
    liquidityImpactProcessor
};
