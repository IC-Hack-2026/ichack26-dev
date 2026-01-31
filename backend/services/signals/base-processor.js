// Base class for signal processors
// Each processor detects a specific type of unusual trading activity

class BaseProcessor {
    constructor(name, weight = 0.1) {
        this.name = name;
        this.weight = weight; // Default weight for probability adjustment
    }

    // Override this method in subclasses
    // Should return: { detected: boolean, confidence: number (0-1), direction: 'YES'|'NO'|null, metadata: {} }
    async process(event, market) {
        throw new Error('process() must be implemented by subclass');
    }

    // Calculate the probability adjustment from this signal
    calculateAdjustment(signal) {
        if (!signal.detected) return 0;

        const directionMultiplier = signal.direction === 'YES' ? 1 : (signal.direction === 'NO' ? -1 : 0);
        return signal.confidence * this.weight * directionMultiplier;
    }

    // Helper: determine if a value is an outlier (>2 std dev from mean)
    isOutlier(value, mean, stdDev) {
        return Math.abs(value - mean) > 2 * stdDev;
    }

    // Helper: calculate percentage change
    percentChange(oldVal, newVal) {
        if (oldVal === 0) return newVal > 0 ? 100 : 0;
        return ((newVal - oldVal) / oldVal) * 100;
    }
}

module.exports = BaseProcessor;
