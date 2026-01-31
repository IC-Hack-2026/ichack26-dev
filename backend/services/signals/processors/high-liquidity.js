// High Liquidity Signal Processor
// Markets with high liquidity tend to have more accurate prices

const BaseProcessor = require('../base-processor');

class HighLiquidityProcessor extends BaseProcessor {
    constructor() {
        super('high-liquidity', 0.03);
    }

    async process(event, market) {
        const liquidity = market.liquidity || 0;

        // High liquidity threshold: $100k+
        if (liquidity > 100000) {
            const confidence = Math.min((liquidity - 100000) / 400000, 1); // Scale to 500k
            const probability = market.probability || 0.5;
            const direction = probability > 0.5 ? 'YES' : 'NO';

            return {
                detected: true,
                confidence,
                direction,
                severity: liquidity > 500000 ? 'HIGH' : 'MEDIUM',
                metadata: {
                    liquidity,
                    liquidityTier: liquidity > 500000 ? 'very-high' : 'high'
                }
            };
        }

        return { detected: false, confidence: 0, direction: null, metadata: {} };
    }
}

module.exports = HighLiquidityProcessor;
