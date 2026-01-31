// Tests for Timing Pattern Signal Processor

// Mock config
jest.mock('../../../../config/index.js', () => ({
    signals: {
        timingPattern: {
            weight: 0.14,
            windowHours: 48, // Detection window before resolution
            concentrationThreshold: 2 // Ratio of recent to baseline activity
        }
    }
}));

// Mock database
const mockDb = {
    tradeHistory: {
        getByMarket: jest.fn()
    }
};

jest.mock('../../../../db/index.js', () => mockDb);

const { TimingPatternProcessor } = require('../../../../services/signals/processors/timing-pattern');
const { nearResolutionMarket, farResolutionMarket, noEndDateMarket, resolutionDateMarket } = require('../../../fixtures/markets');
const { createConcentratedTrades } = require('../../../fixtures/trades');

describe('TimingPatternProcessor', () => {
    let processor;

    beforeEach(() => {
        jest.clearAllMocks();
        processor = new TimingPatternProcessor();
    });

    describe('Detection logic', () => {
        test('detects concentrated trading before market resolution', async () => {
            const event = { id: 'event-1' };
            // Market resolving in 12 hours (within 48-hour window)
            const market = {
                tokenId: 'token-timing-001',
                endDate: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
            };

            // Create concentrated trades: 20 in last 6h, 5 in previous 18h
            // Rate ratio: (20/6) / (5/18) = 3.33/0.28 = ~12
            const now = Date.now();
            const trades = [];

            // 20 trades in last 6 hours
            for (let i = 0; i < 20; i++) {
                trades.push({
                    tokenId: 'token-timing-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - i * 15 * 60 * 1000).toISOString()
                });
            }

            // 5 trades in previous 18 hours
            for (let i = 0; i < 5; i++) {
                trades.push({
                    tokenId: 'token-timing-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - 6 * 60 * 60 * 1000 - i * 3 * 60 * 60 * 1000).toISOString()
                });
            }

            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
            expect(result.metadata.concentrationRatio).toBeGreaterThan(2);
        });

        test('does NOT detect when market is far from resolution', async () => {
            const event = { id: 'event-1' };
            // Market resolving in 30 days (outside 48-hour window)
            const market = {
                tokenId: 'token-far-001',
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            };

            const now = Date.now();
            const trades = [];
            for (let i = 0; i < 20; i++) {
                trades.push({
                    tokenId: 'token-far-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - i * 15 * 60 * 1000).toISOString()
                });
            }

            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(false);
        });

        test('returns not detected when market has no endDate or resolutionDate', async () => {
            const event = { id: 'event-1' };
            const market = {
                tokenId: 'token-no-end-001'
                // No endDate or resolutionDate
            };

            mockDb.tradeHistory.getByMarket.mockResolvedValue([]);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(false);
        });

        test('uses resolutionDate if endDate is missing', async () => {
            const event = { id: 'event-1' };
            const market = {
                tokenId: 'token-resolution-001',
                resolutionDate: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
            };

            const now = Date.now();
            const trades = [];
            for (let i = 0; i < 20; i++) {
                trades.push({
                    tokenId: 'token-resolution-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - i * 15 * 60 * 1000).toISOString()
                });
            }
            for (let i = 0; i < 2; i++) {
                trades.push({
                    tokenId: 'token-resolution-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - 6 * 60 * 60 * 1000 - i * 3 * 60 * 60 * 1000).toISOString()
                });
            }

            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
        });
    });

    describe('Concentration ratio calculation', () => {
        test('calculates concentration ratio correctly', async () => {
            const event = { id: 'event-1' };
            const market = {
                tokenId: 'token-calc-001',
                endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            };

            const now = Date.now();
            const trades = [];

            // 12 trades in last 6 hours -> rate = 12/6 = 2 per hour
            for (let i = 0; i < 12; i++) {
                trades.push({
                    tokenId: 'token-calc-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - i * 30 * 60 * 1000).toISOString()
                });
            }

            // 9 trades in previous 18 hours -> rate = 9/18 = 0.5 per hour
            for (let i = 0; i < 9; i++) {
                trades.push({
                    tokenId: 'token-calc-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - 6 * 60 * 60 * 1000 - i * 2 * 60 * 60 * 1000).toISOString()
                });
            }

            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);

            const result = await processor.process(event, market);

            // Expected ratio approximately 4 (slight variation due to timing)
            expect(result.detected).toBe(true);
            expect(result.metadata.concentrationRatio).toBeGreaterThan(3);
            expect(result.metadata.concentrationRatio).toBeLessThan(6);
            expect(result.metadata.tradesLast6h).toBeGreaterThanOrEqual(10);
            expect(result.metadata.tradesPrev18h).toBeGreaterThanOrEqual(7);
        });

        test('handles zero previous trades (avoids division by zero)', async () => {
            const event = { id: 'event-1' };
            const market = {
                tokenId: 'token-zero-001',
                endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            };

            const now = Date.now();
            const trades = [];

            // 10 trades in last 6 hours, 0 in previous 18 hours
            for (let i = 0; i < 10; i++) {
                trades.push({
                    tokenId: 'token-zero-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - i * 30 * 60 * 1000).toISOString()
                });
            }

            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);

            const result = await processor.process(event, market);

            // Should handle gracefully - ratio is Infinity which is > threshold
            expect(result.detected).toBe(true);
            expect(result.metadata.concentrationRatio).toBe(Infinity);
        });
    });

    describe('Severity calculation', () => {
        test('returns HIGH severity for ratio > 4', async () => {
            const event = { id: 'event-1' };
            const market = {
                tokenId: 'token-high-001',
                endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            };

            const now = Date.now();
            const trades = [];

            // Create ratio > 4: 24 trades in 6h (4/hr), 9 in 18h (0.5/hr) -> ratio = 8
            for (let i = 0; i < 24; i++) {
                trades.push({
                    tokenId: 'token-high-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - i * 15 * 60 * 1000).toISOString()
                });
            }
            for (let i = 0; i < 9; i++) {
                trades.push({
                    tokenId: 'token-high-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - 6 * 60 * 60 * 1000 - i * 2 * 60 * 60 * 1000).toISOString()
                });
            }

            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
            expect(result.severity).toBe('HIGH');
            expect(result.metadata.concentrationRatio).toBeGreaterThan(4);
        });

        test('returns MEDIUM severity for ratio 2-4', async () => {
            const event = { id: 'event-1' };
            const market = {
                tokenId: 'token-medium-001',
                endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            };

            const now = Date.now();
            const trades = [];

            // Create ratio ~3: 18 trades in 6h (3/hr), 18 in 18h (1/hr) -> ratio = 3
            for (let i = 0; i < 18; i++) {
                trades.push({
                    tokenId: 'token-medium-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - i * 20 * 60 * 1000).toISOString()
                });
            }
            for (let i = 0; i < 18; i++) {
                trades.push({
                    tokenId: 'token-medium-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - 6 * 60 * 60 * 1000 - i * 60 * 60 * 1000).toISOString()
                });
            }

            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
            expect(result.severity).toBe('MEDIUM');
        });
    });

    describe('Dominant direction identification', () => {
        test('identifies dominant trading direction as YES', async () => {
            const event = { id: 'event-1' };
            const market = {
                tokenId: 'token-yes-001',
                endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            };

            const now = Date.now();
            const trades = [];

            // 15 YES trades, 5 NO trades in last 6 hours
            for (let i = 0; i < 15; i++) {
                trades.push({
                    tokenId: 'token-yes-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - i * 20 * 60 * 1000).toISOString()
                });
            }
            for (let i = 0; i < 5; i++) {
                trades.push({
                    tokenId: 'token-yes-001',
                    side: 'NO',
                    size: 100,
                    timestamp: new Date(now - i * 60 * 60 * 1000).toISOString()
                });
            }
            // Baseline trades
            for (let i = 0; i < 3; i++) {
                trades.push({
                    tokenId: 'token-yes-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - 7 * 60 * 60 * 1000 - i * 3 * 60 * 60 * 1000).toISOString()
                });
            }

            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
            expect(result.direction).toBe('YES');
            expect(result.metadata.dominantSide).toBe('YES');
        });

        test('identifies dominant trading direction as NO', async () => {
            const event = { id: 'event-1' };
            const market = {
                tokenId: 'token-no-001',
                endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            };

            const now = Date.now();
            const trades = [];

            // 5 YES trades, 15 NO trades in last 6 hours
            for (let i = 0; i < 5; i++) {
                trades.push({
                    tokenId: 'token-no-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - i * 60 * 60 * 1000).toISOString()
                });
            }
            for (let i = 0; i < 15; i++) {
                trades.push({
                    tokenId: 'token-no-001',
                    side: 'NO',
                    size: 100,
                    timestamp: new Date(now - i * 20 * 60 * 1000).toISOString()
                });
            }
            // Baseline trades
            for (let i = 0; i < 3; i++) {
                trades.push({
                    tokenId: 'token-no-001',
                    side: 'NO',
                    size: 100,
                    timestamp: new Date(now - 7 * 60 * 60 * 1000 - i * 3 * 60 * 60 * 1000).toISOString()
                });
            }

            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
            expect(result.direction).toBe('NO');
            expect(result.metadata.dominantSide).toBe('NO');
        });

        test('considers volume when determining dominant side', async () => {
            const event = { id: 'event-1' };
            const market = {
                tokenId: 'token-vol-001',
                endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            };

            const now = Date.now();
            const trades = [];

            // 10 YES trades at 50 each = 500 volume
            for (let i = 0; i < 10; i++) {
                trades.push({
                    tokenId: 'token-vol-001',
                    side: 'YES',
                    size: 50,
                    timestamp: new Date(now - i * 30 * 60 * 1000).toISOString()
                });
            }
            // 5 NO trades at 200 each = 1000 volume
            for (let i = 0; i < 5; i++) {
                trades.push({
                    tokenId: 'token-vol-001',
                    side: 'NO',
                    size: 200,
                    timestamp: new Date(now - i * 60 * 60 * 1000).toISOString()
                });
            }
            // Baseline
            for (let i = 0; i < 2; i++) {
                trades.push({
                    tokenId: 'token-vol-001',
                    side: 'YES',
                    size: 50,
                    timestamp: new Date(now - 7 * 60 * 60 * 1000 - i * 3 * 60 * 60 * 1000).toISOString()
                });
            }

            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
            // NO has higher volume even though fewer trades
            expect(result.direction).toBe('NO');
        });
    });

    describe('Method signature', () => {
        test('process takes only (event, market) parameters - fetches trades from DB', async () => {
            const event = { id: 'event-1' };
            const market = {
                tokenId: 'token-sig-001',
                endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            };

            mockDb.tradeHistory.getByMarket.mockResolvedValue([]);

            await processor.process(event, market);

            expect(mockDb.tradeHistory.getByMarket).toHaveBeenCalledWith('token-sig-001');
        });
    });

    describe('Metadata', () => {
        test('includes hoursToResolution in metadata', async () => {
            const event = { id: 'event-1' };
            const hoursUntilEnd = 36;
            const market = {
                tokenId: 'token-hours-001',
                endDate: new Date(Date.now() + hoursUntilEnd * 60 * 60 * 1000).toISOString()
            };

            const now = Date.now();
            const trades = [];
            for (let i = 0; i < 20; i++) {
                trades.push({
                    tokenId: 'token-hours-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - i * 15 * 60 * 1000).toISOString()
                });
            }
            for (let i = 0; i < 3; i++) {
                trades.push({
                    tokenId: 'token-hours-001',
                    side: 'YES',
                    size: 100,
                    timestamp: new Date(now - 7 * 60 * 60 * 1000 - i * 3 * 60 * 60 * 1000).toISOString()
                });
            }

            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
            expect(result.metadata).toHaveProperty('hoursToResolution');
            expect(result.metadata.hoursToResolution).toBeCloseTo(hoursUntilEnd, 0);
        });
    });
});
