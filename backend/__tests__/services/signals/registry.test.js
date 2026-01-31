// Tests for Signal Processor Registry

// Mock all processor modules
jest.mock('../../../services/signals/processors/volume-spike', () => {
    return jest.fn().mockImplementation(() => ({
        name: 'volume-spike',
        weight: 0.08,
        process: jest.fn().mockResolvedValue({ detected: false }),
        calculateAdjustment: jest.fn().mockReturnValue(0)
    }));
});

jest.mock('../../../services/signals/processors/probability-extreme', () => {
    return jest.fn().mockImplementation(() => ({
        name: 'probability-extreme',
        weight: 0.05,
        process: jest.fn().mockResolvedValue({ detected: false }),
        calculateAdjustment: jest.fn().mockReturnValue(0)
    }));
});

jest.mock('../../../services/signals/processors/high-liquidity', () => {
    return jest.fn().mockImplementation(() => ({
        name: 'high-liquidity',
        weight: 0.03,
        process: jest.fn().mockResolvedValue({ detected: false }),
        calculateAdjustment: jest.fn().mockReturnValue(0)
    }));
});

const mockFreshWalletProcessor = {
    name: 'fresh-wallet',
    weight: 0.15,
    process: jest.fn().mockResolvedValue({ detected: false }),
    calculateAdjustment: jest.fn().mockReturnValue(0)
};

jest.mock('../../../services/signals/processors/fresh-wallet', () => ({
    FreshWalletProcessor: jest.fn().mockImplementation(() => mockFreshWalletProcessor),
    freshWalletProcessor: mockFreshWalletProcessor
}));

const mockLiquidityImpactProcessor = {
    name: 'liquidity-impact',
    weight: 0.12,
    process: jest.fn().mockResolvedValue({ detected: false }),
    calculateAdjustment: jest.fn().mockReturnValue(0)
};

jest.mock('../../../services/signals/processors/liquidity-impact', () => ({
    LiquidityImpactProcessor: jest.fn().mockImplementation(() => mockLiquidityImpactProcessor),
    liquidityImpactProcessor: mockLiquidityImpactProcessor
}));

const mockWalletAccuracyProcessor = {
    name: 'wallet-accuracy',
    weight: 0.18,
    process: jest.fn().mockResolvedValue({ detected: false }),
    calculateAdjustment: jest.fn().mockReturnValue(0)
};

jest.mock('../../../services/signals/processors/wallet-accuracy', () => ({
    WalletAccuracyProcessor: jest.fn().mockImplementation(() => mockWalletAccuracyProcessor),
    walletAccuracyProcessor: mockWalletAccuracyProcessor
}));

const mockTimingPatternProcessor = {
    name: 'timing-pattern',
    weight: 0.14,
    process: jest.fn().mockResolvedValue({ detected: false }),
    calculateAdjustment: jest.fn().mockReturnValue(0)
};

jest.mock('../../../services/signals/processors/timing-pattern', () => ({
    TimingPatternProcessor: jest.fn().mockImplementation(() => mockTimingPatternProcessor),
    timingPatternProcessor: mockTimingPatternProcessor
}));

const mockSniperClusterProcessor = {
    name: 'sniper-cluster',
    weight: 0.16,
    process: jest.fn().mockResolvedValue({ detected: false }),
    calculateAdjustment: jest.fn().mockReturnValue(0)
};

jest.mock('../../../services/signals/processors/sniper-cluster', () => ({
    SniperClusterProcessor: jest.fn().mockImplementation(() => mockSniperClusterProcessor),
    sniperClusterProcessor: mockSniperClusterProcessor
}));

// Mock database
const mockDb = {
    signals: {
        create: jest.fn().mockResolvedValue({}),
        getByEventId: jest.fn().mockResolvedValue([])
    }
};

jest.mock('../../../db', () => mockDb);

// Clear the module cache to get fresh registry
beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
});

describe('SignalRegistry', () => {
    let registry;

    beforeEach(() => {
        // Re-require to get fresh instance
        jest.isolateModules(() => {
            registry = require('../../../services/signals/registry');
        });
    });

    describe('Processor registration', () => {
        test('registers all default processors', () => {
            const processorNames = registry.getProcessorNames();

            expect(processorNames).toContain('volume-spike');
            expect(processorNames).toContain('probability-extreme');
            expect(processorNames).toContain('high-liquidity');
            expect(processorNames).toContain('fresh-wallet');
            expect(processorNames).toContain('liquidity-impact');
            expect(processorNames).toContain('wallet-accuracy');
            expect(processorNames).toContain('timing-pattern');
            expect(processorNames).toContain('sniper-cluster');
        });

        test('register adds new processor', () => {
            const customProcessor = {
                name: 'custom-processor',
                weight: 0.1,
                process: jest.fn(),
                calculateAdjustment: jest.fn()
            };

            registry.register(customProcessor);

            expect(registry.getProcessorNames()).toContain('custom-processor');
        });
    });

    describe('processRealTimeTrade', () => {
        test('runs all realtime processors', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-123', liquidity: 10000 };
            const trade = { maker: '0xtest', size: 500, side: 'BUY' };
            const orderbook = { bids: [], asks: [] };

            await registry.processRealTimeTrade(event, market, trade, orderbook);

            // Trade processors should be called with all 4 params
            expect(mockFreshWalletProcessor.process).toHaveBeenCalled();
            expect(mockLiquidityImpactProcessor.process).toHaveBeenCalled();
            expect(mockWalletAccuracyProcessor.process).toHaveBeenCalled();

            // Market processors should be called with 2 params
            expect(mockTimingPatternProcessor.process).toHaveBeenCalled();
            expect(mockSniperClusterProcessor.process).toHaveBeenCalled();
        });

        test('passes (event, market, trade, orderbook) to trade processors', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-123', liquidity: 10000, endDate: new Date().toISOString() };
            const trade = { maker: '0xtest', size: 500, side: 'BUY' };
            const orderbook = { bids: [[0.5, 100]], asks: [[0.6, 100]] };

            await registry.processRealTimeTrade(event, market, trade, orderbook);

            // fresh-wallet gets (event, market, trade, orderbook)
            expect(mockFreshWalletProcessor.process).toHaveBeenCalledWith(event, market, trade, orderbook);

            // liquidity-impact gets (event, market, trade, orderbook)
            expect(mockLiquidityImpactProcessor.process).toHaveBeenCalledWith(event, market, trade, orderbook);

            // wallet-accuracy gets (event, market, trade, orderbook)
            expect(mockWalletAccuracyProcessor.process).toHaveBeenCalledWith(event, market, trade, orderbook);
        });

        test('passes only (event, market) to market processors', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-123', liquidity: 10000, endDate: new Date().toISOString() };
            const trade = { maker: '0xtest', size: 500, side: 'BUY' };
            const orderbook = { bids: [[0.5, 100]], asks: [[0.6, 100]] };

            await registry.processRealTimeTrade(event, market, trade, orderbook);

            // timing-pattern gets (event, market) only
            expect(mockTimingPatternProcessor.process).toHaveBeenCalledWith(event, market);

            // sniper-cluster gets (event, market) only
            expect(mockSniperClusterProcessor.process).toHaveBeenCalledWith(event, market);
        });

        test('aggregates results from all processors', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-123', liquidity: 10000 };
            const trade = { maker: '0xtest', size: 500, side: 'BUY' };
            const orderbook = { bids: [], asks: [] };

            // Mock: fresh-wallet detects
            mockFreshWalletProcessor.process.mockResolvedValueOnce({
                detected: true,
                confidence: 0.8,
                direction: 'YES',
                severity: 'HIGH',
                metadata: {}
            });
            mockFreshWalletProcessor.calculateAdjustment.mockReturnValueOnce(0.12);

            // Mock: timing-pattern detects
            mockTimingPatternProcessor.process.mockResolvedValueOnce({
                detected: true,
                confidence: 0.6,
                direction: 'YES',
                severity: 'MEDIUM',
                metadata: {}
            });
            mockTimingPatternProcessor.calculateAdjustment.mockReturnValueOnce(0.08);

            const signals = await registry.processRealTimeTrade(event, market, trade, orderbook);

            expect(signals).toHaveLength(2);
            expect(signals[0].signalType).toBe('fresh-wallet');
            expect(signals[1].signalType).toBe('timing-pattern');
        });

        test('skips processors that throw errors (graceful degradation)', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-123', liquidity: 10000 };
            const trade = { maker: '0xtest', size: 500, side: 'BUY' };
            const orderbook = { bids: [], asks: [] };

            // Mock: fresh-wallet throws error
            mockFreshWalletProcessor.process.mockRejectedValueOnce(new Error('Processor error'));

            // Mock: liquidity-impact detects
            mockLiquidityImpactProcessor.process.mockResolvedValueOnce({
                detected: true,
                confidence: 0.7,
                direction: 'BUY',
                severity: 'MEDIUM',
                metadata: {}
            });
            mockLiquidityImpactProcessor.calculateAdjustment.mockReturnValueOnce(0.08);

            // Should not throw
            const signals = await registry.processRealTimeTrade(event, market, trade, orderbook);

            // Should still have signal from liquidity-impact
            expect(signals.some(s => s.signalType === 'liquidity-impact')).toBe(true);
        });

        test('saves detected signals to database', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-123', liquidity: 10000 };
            const trade = { id: 'trade-123', maker: '0xtest', size: 500, side: 'BUY' };
            const orderbook = { bids: [], asks: [] };

            mockFreshWalletProcessor.process.mockResolvedValueOnce({
                detected: true,
                confidence: 0.8,
                direction: 'YES',
                severity: 'HIGH',
                metadata: { walletAge: 1 }
            });
            mockFreshWalletProcessor.calculateAdjustment.mockReturnValueOnce(0.12);

            await registry.processRealTimeTrade(event, market, trade, orderbook);

            expect(mockDb.signals.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventId: 'event-1',
                    signalType: 'fresh-wallet',
                    severity: 'HIGH',
                    confidence: 0.8,
                    tradeId: 'trade-123'
                })
            );
        });
    });

    describe('processEvent (batch processing)', () => {
        test('only runs batch-compatible processors', async () => {
            const event = { id: 'event-1' };
            const market = { probability: 0.95, liquidity: 200000, volume24hr: 150000 };

            await registry.processEvent(event, market);

            // Trade processors should NOT be called in batch mode
            // Note: batch mode only runs processors that don't require trade data
            // Fresh-wallet, liquidity-impact, wallet-accuracy need trade data
            expect(mockFreshWalletProcessor.process).not.toHaveBeenCalled();
            expect(mockLiquidityImpactProcessor.process).not.toHaveBeenCalled();
            expect(mockWalletAccuracyProcessor.process).not.toHaveBeenCalled();
        });
    });

    describe('getRealtimeProcessors', () => {
        test('returns processors that support real-time trade processing', () => {
            const realtimeProcessors = registry.getRealtimeProcessors();
            const names = realtimeProcessors.map(p => p.name);

            expect(names).toContain('fresh-wallet');
            expect(names).toContain('liquidity-impact');
            expect(names).toContain('wallet-accuracy');
            expect(names).toContain('timing-pattern');
            expect(names).toContain('sniper-cluster');

            // Batch-only processors should not be included
            expect(names).not.toContain('volume-spike');
            expect(names).not.toContain('probability-extreme');
            expect(names).not.toContain('high-liquidity');
        });
    });

    describe('getSignalsSummary', () => {
        test('returns summary of signals for an event', async () => {
            mockDb.signals.getByEventId.mockResolvedValue([
                { signalType: 'fresh-wallet', severity: 'HIGH', confidence: 0.8, direction: 'YES', adjustment: 0.12 },
                { signalType: 'timing-pattern', severity: 'MEDIUM', confidence: 0.6, direction: 'YES', adjustment: 0.08 }
            ]);

            const summary = await registry.getSignalsSummary('event-1');

            expect(summary.count).toBe(2);
            expect(summary.signals).toHaveLength(2);
            expect(summary.totalAdjustment).toBe(0.2);
        });

        test('returns empty summary when no signals', async () => {
            mockDb.signals.getByEventId.mockResolvedValue([]);

            const summary = await registry.getSignalsSummary('event-1');

            expect(summary.count).toBe(0);
            expect(summary.signals).toHaveLength(0);
            expect(summary.totalAdjustment).toBe(0);
        });
    });
});
