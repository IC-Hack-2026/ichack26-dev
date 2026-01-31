// Signal Processor Registry
// Manages all signal processors and runs them against events

const VolumeSpikeProcessor = require('./processors/volume-spike');
const ProbabilityExtremeProcessor = require('./processors/probability-extreme');
const HighLiquidityProcessor = require('./processors/high-liquidity');
const db = require('../../db');

class SignalRegistry {
    constructor() {
        this.processors = [];
        this.registerDefaultProcessors();
    }

    registerDefaultProcessors() {
        this.register(new VolumeSpikeProcessor());
        this.register(new ProbabilityExtremeProcessor());
        this.register(new HighLiquidityProcessor());
    }

    register(processor) {
        this.processors.push(processor);
    }

    // Process an event through all signal processors
    async processEvent(event, market) {
        const signals = [];

        for (const processor of this.processors) {
            try {
                const result = await processor.process(event, market);

                if (result.detected) {
                    const signal = {
                        eventId: event.id,
                        signalType: processor.name,
                        severity: result.severity || 'LOW',
                        confidence: result.confidence,
                        direction: result.direction,
                        weight: processor.weight,
                        adjustment: processor.calculateAdjustment(result),
                        metadata: result.metadata
                    };

                    signals.push(signal);

                    // Save to database
                    await db.signals.create(signal);
                }
            } catch (error) {
                console.error(`Error in processor ${processor.name}:`, error.message);
            }
        }

        return signals;
    }

    // Get summary of all detected signals for an event
    async getSignalsSummary(eventId) {
        const signals = await db.signals.getByEventId(eventId);

        return {
            count: signals.length,
            signals: signals.map(s => ({
                type: s.signalType,
                severity: s.severity,
                confidence: s.confidence,
                direction: s.direction
            })),
            totalAdjustment: signals.reduce((sum, s) => sum + (s.adjustment || 0), 0)
        };
    }

    getProcessorNames() {
        return this.processors.map(p => p.name);
    }
}

// Singleton instance
const registry = new SignalRegistry();

module.exports = registry;
