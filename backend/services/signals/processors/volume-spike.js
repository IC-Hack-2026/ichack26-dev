// Volume Spike Signal Processor
// Detects unusual increases in trading volume

const BaseProcessor = require('../base-processor');

class VolumeSpikeProcessor extends BaseProcessor {
    constructor() {
        super('volume-spike', 0.08);
    }

    async process(event, market) {
        // Check for significant volume relative to liquidity
        const volume24hr = market.volume24hr || 0;
        const liquidity = market.liquidity || 0;

        if (liquidity === 0) {
            return { detected: false, confidence: 0, direction: null, metadata: {} };
        }

        // Volume/liquidity ratio - high ratio suggests unusual activity
        const volumeRatio = volume24hr / liquidity;

        // Detect spike if volume is >50% of liquidity
        if (volumeRatio > 0.5) {
            const confidence = Math.min(volumeRatio / 2, 1); // Cap at 1
            const probability = market.probability || 0.5;

            // If probability is moving toward extremes, signal is in that direction
            const direction = probability > 0.5 ? 'YES' : 'NO';

            return {
                detected: true,
                confidence,
                direction,
                severity: confidence > 0.7 ? 'HIGH' : 'MEDIUM',
                metadata: {
                    volume24hr,
                    liquidity,
                    volumeRatio: volumeRatio.toFixed(2),
                    currentProbability: probability
                }
            };
        }

        return { detected: false, confidence: 0, direction: null, metadata: {} };
    }
}

module.exports = VolumeSpikeProcessor;
