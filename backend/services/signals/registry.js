// Signal Processor Registry
// Manages all signal processors and runs them against events

const VolumeSpikeProcessor = require('./processors/volume-spike');
const ProbabilityExtremeProcessor = require('./processors/probability-extreme');
const HighLiquidityProcessor = require('./processors/high-liquidity');
const { FreshWalletProcessor } = require('./processors/fresh-wallet');
const { LiquidityImpactProcessor } = require('./processors/liquidity-impact');
const { WalletAccuracyProcessor } = require('./processors/wallet-accuracy');
const { TimingPatternProcessor } = require('./processors/timing-pattern');
const { SniperClusterProcessor } = require('./processors/sniper-cluster');
const db = require('../../db');

class SignalRegistry {
    constructor() {
        this.processors = [];
        this.registerDefaultProcessors();
    }

    registerDefaultProcessors() {
        // Batch processing processors (market-level analysis)
        this.register(new VolumeSpikeProcessor());
        this.register(new ProbabilityExtremeProcessor());
        this.register(new HighLiquidityProcessor());

        // Real-time trade processors (trade-level analysis)
        this.register(new FreshWalletProcessor());
        this.register(new LiquidityImpactProcessor());
        this.register(new WalletAccuracyProcessor());

        // Market timing processors (requires market data)
        this.register(new TimingPatternProcessor());
        this.register(new SniperClusterProcessor());
    }

    register(processor) {
        this.processors.push(processor);
    }

    // Process an event through batch-compatible signal processors
    // Note: Real-time processors (fresh-wallet, wallet-accuracy, liquidity-impact) require trade data
    // and should be processed via processRealTimeTrade instead
    async processEvent(event, market) {
        const signals = [];

        // Only run batch-compatible processors (those that don't require trade data)
        const batchProcessorNames = ['volume-spike', 'probability-extreme', 'high-liquidity', 'timing-pattern', 'sniper-cluster'];

        for (const processor of this.processors) {
            // Skip processors that require trade data
            if (!batchProcessorNames.includes(processor.name)) {
                continue;
            }

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

    /**
     * Get list of processors that support real-time trade processing
     * These processors need trade data to function
     *
     * @returns {Array} Array of processor instances that support real-time processing
     */
    getRealtimeProcessors() {
        const realtimeProcessorNames = [
            'fresh-wallet',
            'liquidity-impact',
            'wallet-accuracy',
            'timing-pattern',
            'sniper-cluster'
        ];

        return this.processors.filter(p => realtimeProcessorNames.includes(p.name));
    }

    /**
     * Process a real-time trade through all applicable signal processors
     *
     * @param {Object} event - The event object
     * @param {Object} market - Market data including liquidity, endDate, tokenId
     * @param {Object} trade - Trade data with address, size, side
     * @param {Object} orderbook - Current orderbook state for liquidity impact analysis
     * @returns {Promise<Array>} Array of detected signals
     */
    async processRealTimeTrade(event, market, trade, orderbook) {
        const signals = [];

        // Trade-data processors: fresh-wallet, liquidity-impact, wallet-accuracy
        const tradeProcessorNames = ['fresh-wallet', 'liquidity-impact', 'wallet-accuracy'];

        // Market-data processors: timing-pattern, sniper-cluster
        const marketProcessorNames = ['timing-pattern', 'sniper-cluster'];

        for (const processor of this.processors) {
            try {
                let result;

                if (tradeProcessorNames.includes(processor.name)) {
                    // These processors need trade data
                    result = await processor.process(event, market, trade, orderbook);
                } else if (marketProcessorNames.includes(processor.name)) {
                    // These processors work with market data
                    result = await processor.process(event, market);
                } else {
                    // Skip batch-only processors in real-time mode
                    continue;
                }

                if (result.detected) {
                    const signal = {
                        eventId: event.id,
                        signalType: processor.name,
                        severity: result.severity || 'LOW',
                        confidence: result.confidence,
                        direction: result.direction,
                        weight: processor.weight,
                        adjustment: processor.calculateAdjustment(result),
                        metadata: result.metadata,
                        tradeId: trade.id || trade.transactionHash || null,
                        detectedAt: new Date().toISOString()
                    };

                    signals.push(signal);

                    // Save to database
                    await db.signals.create(signal);
                }
            } catch (error) {
                console.error(`Error in real-time processor ${processor.name}:`, error.message);
            }
        }

        return signals;
    }
}

// Singleton instance
const registry = new SignalRegistry();

module.exports = registry;
