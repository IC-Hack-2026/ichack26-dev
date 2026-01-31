// Probability Extreme Signal Processor
// Detects when probability is at extreme levels, suggesting high confidence

const BaseProcessor = require('../base-processor');

class ProbabilityExtremeProcessor extends BaseProcessor {
    constructor() {
        super('probability-extreme', 0.05);
    }

    async process(event, market) {
        const probability = market.probability;

        if (probability === null || probability === undefined) {
            return { detected: false, confidence: 0, direction: null, metadata: {} };
        }

        // Check for extreme probabilities (>90% or <10%)
        if (probability > 0.9 || probability < 0.1) {
            const isHigh = probability > 0.5;
            const extremity = isHigh ? probability : (1 - probability);
            const confidence = (extremity - 0.9) * 10; // 0.9 -> 0, 1.0 -> 1

            return {
                detected: true,
                confidence: Math.min(confidence, 1),
                direction: isHigh ? 'YES' : 'NO',
                severity: probability > 0.95 || probability < 0.05 ? 'HIGH' : 'MEDIUM',
                metadata: {
                    probability,
                    extremity: extremity.toFixed(3)
                }
            };
        }

        return { detected: false, confidence: 0, direction: null, metadata: {} };
    }
}

module.exports = ProbabilityExtremeProcessor;
