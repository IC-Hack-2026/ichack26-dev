// Tests for Sniper Cluster Signal Processor

// Mock config
jest.mock('../../../../config/index', () => ({
    signals: {
        sniperCluster: {
            weight: 0.16,
            windowMinutes: 5,
            minWallets: 3
        }
    }
}));

// Mock database
const mockDb = {
    tradeHistory: {
        getByMarket: jest.fn()
    }
};

jest.mock('../../../../db/index', () => mockDb);

// Mock fundingAnalyzer
const mockFundingAnalyzer = {
    detectConnectedWallets: jest.fn()
};

jest.mock('../../../../services/wallet/funding-analyzer', () => ({
    fundingAnalyzer: mockFundingAnalyzer
}));

const { SniperClusterProcessor } = require('../../../../services/signals/processors/sniper-cluster');
const { createCoordinatedTrades, createSpreadOutTrades, createMixedDirectionTrades } = require('../../../fixtures/trades');
const { standardMarket } = require('../../../fixtures/markets');

describe('SniperClusterProcessor', () => {
    let processor;

    beforeEach(() => {
        jest.clearAllMocks();
        processor = new SniperClusterProcessor();
    });

    describe('Detection logic', () => {
        test('detects 3+ wallets trading same direction within 5 minutes', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-cluster-001' };

            // Create trades from 3 wallets, all YES, within 2 minutes
            const baseTime = Date.now();
            mockDb.tradeHistory.getByMarket.mockResolvedValue([
                { maker: '0xwallet1', side: 'YES', timestamp: new Date(baseTime).toISOString(), size: 100 },
                { maker: '0xwallet2', side: 'YES', timestamp: new Date(baseTime + 60000).toISOString(), size: 150 },
                { maker: '0xwallet3', side: 'YES', timestamp: new Date(baseTime + 120000).toISOString(), size: 200 }
            ]);

            mockFundingAnalyzer.detectConnectedWallets.mockResolvedValue([]);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
            expect(result.metadata.clusterSize).toBe(3);
            expect(result.metadata.direction).toBe('YES');
        });

        test('does NOT trigger with < 3 wallets', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-few-001' };

            const baseTime = Date.now();
            mockDb.tradeHistory.getByMarket.mockResolvedValue([
                { maker: '0xwallet1', side: 'YES', timestamp: new Date(baseTime).toISOString(), size: 100 },
                { maker: '0xwallet2', side: 'YES', timestamp: new Date(baseTime + 60000).toISOString(), size: 150 }
            ]);

            mockFundingAnalyzer.detectConnectedWallets.mockResolvedValue([]);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(false);
        });

        test('does NOT trigger if trades span > 5 minutes', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-spread-001' };

            // Trades spread over 10+ minutes (beyond 5-minute window)
            const baseTime = Date.now();
            mockDb.tradeHistory.getByMarket.mockResolvedValue([
                { maker: '0xwallet1', side: 'YES', timestamp: new Date(baseTime).toISOString(), size: 100 },
                { maker: '0xwallet2', side: 'YES', timestamp: new Date(baseTime + 6 * 60 * 1000).toISOString(), size: 150 },
                { maker: '0xwallet3', side: 'YES', timestamp: new Date(baseTime + 12 * 60 * 1000).toISOString(), size: 200 }
            ]);

            mockFundingAnalyzer.detectConnectedWallets.mockResolvedValue([]);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(false);
        });

        test('does NOT trigger if wallets trade opposite directions', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-mixed-001' };

            const baseTime = Date.now();
            mockDb.tradeHistory.getByMarket.mockResolvedValue([
                { maker: '0xwallet1', side: 'YES', timestamp: new Date(baseTime).toISOString(), size: 100 },
                { maker: '0xwallet2', side: 'NO', timestamp: new Date(baseTime + 60000).toISOString(), size: 150 },
                { maker: '0xwallet3', side: 'YES', timestamp: new Date(baseTime + 120000).toISOString(), size: 200 }
            ]);

            mockFundingAnalyzer.detectConnectedWallets.mockResolvedValue([]);

            const result = await processor.process(event, market);

            // Should not detect because only 2 wallets are YES direction in the window
            expect(result.detected).toBe(false);
        });

        test('returns not detected when no trades exist', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-empty-001' };

            mockDb.tradeHistory.getByMarket.mockResolvedValue([]);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(false);
        });

        test('returns not detected when trades is null', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-null-001' };

            mockDb.tradeHistory.getByMarket.mockResolvedValue(null);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(false);
        });
    });

    describe('Severity calculation', () => {
        test('returns HIGH severity for >= 5 wallets', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-large-001' };

            const baseTime = Date.now();
            mockDb.tradeHistory.getByMarket.mockResolvedValue([
                { maker: '0xwallet1', side: 'YES', timestamp: new Date(baseTime).toISOString(), size: 100 },
                { maker: '0xwallet2', side: 'YES', timestamp: new Date(baseTime + 30000).toISOString(), size: 100 },
                { maker: '0xwallet3', side: 'YES', timestamp: new Date(baseTime + 60000).toISOString(), size: 100 },
                { maker: '0xwallet4', side: 'YES', timestamp: new Date(baseTime + 90000).toISOString(), size: 100 },
                { maker: '0xwallet5', side: 'YES', timestamp: new Date(baseTime + 120000).toISOString(), size: 100 }
            ]);

            mockFundingAnalyzer.detectConnectedWallets.mockResolvedValue([]);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
            expect(result.severity).toBe('HIGH');
            expect(result.metadata.clusterSize).toBe(5);
        });

        test('returns MEDIUM severity for 3-4 wallets', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-medium-001' };

            const baseTime = Date.now();
            mockDb.tradeHistory.getByMarket.mockResolvedValue([
                { maker: '0xwallet1', side: 'NO', timestamp: new Date(baseTime).toISOString(), size: 100 },
                { maker: '0xwallet2', side: 'NO', timestamp: new Date(baseTime + 60000).toISOString(), size: 150 },
                { maker: '0xwallet3', side: 'NO', timestamp: new Date(baseTime + 120000).toISOString(), size: 200 },
                { maker: '0xwallet4', side: 'NO', timestamp: new Date(baseTime + 180000).toISOString(), size: 100 }
            ]);

            mockFundingAnalyzer.detectConnectedWallets.mockResolvedValue([]);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
            expect(result.severity).toBe('MEDIUM');
            expect(result.metadata.clusterSize).toBe(4);
        });
    });

    describe('Confidence calculation', () => {
        test('confidence scales with cluster size', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-conf-001' };

            // 3 wallets
            const baseTime = Date.now();
            mockDb.tradeHistory.getByMarket.mockResolvedValueOnce([
                { maker: '0xwallet1', side: 'YES', timestamp: new Date(baseTime).toISOString(), size: 100 },
                { maker: '0xwallet2', side: 'YES', timestamp: new Date(baseTime + 60000).toISOString(), size: 100 },
                { maker: '0xwallet3', side: 'YES', timestamp: new Date(baseTime + 120000).toISOString(), size: 100 }
            ]);
            mockFundingAnalyzer.detectConnectedWallets.mockResolvedValue([]);

            const result3 = await processor.process(event, market);
            const conf3 = result3.confidence;

            // 6 wallets
            mockDb.tradeHistory.getByMarket.mockResolvedValueOnce([
                { maker: '0xwallet1', side: 'YES', timestamp: new Date(baseTime).toISOString(), size: 100 },
                { maker: '0xwallet2', side: 'YES', timestamp: new Date(baseTime + 30000).toISOString(), size: 100 },
                { maker: '0xwallet3', side: 'YES', timestamp: new Date(baseTime + 60000).toISOString(), size: 100 },
                { maker: '0xwallet4', side: 'YES', timestamp: new Date(baseTime + 90000).toISOString(), size: 100 },
                { maker: '0xwallet5', side: 'YES', timestamp: new Date(baseTime + 120000).toISOString(), size: 100 },
                { maker: '0xwallet6', side: 'YES', timestamp: new Date(baseTime + 150000).toISOString(), size: 100 }
            ]);

            const result6 = await processor.process(event, market);
            const conf6 = result6.confidence;

            expect(conf6).toBeGreaterThan(conf3);
        });

        test('confidence capped at 1', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-cap-001' };

            // 15 wallets
            const baseTime = Date.now();
            const trades = [];
            for (let i = 0; i < 15; i++) {
                trades.push({
                    maker: `0xwallet${i}`,
                    side: 'YES',
                    timestamp: new Date(baseTime + i * 10000).toISOString(),
                    size: 100
                });
            }
            mockDb.tradeHistory.getByMarket.mockResolvedValue(trades);
            mockFundingAnalyzer.detectConnectedWallets.mockResolvedValue([]);

            const result = await processor.process(event, market);

            expect(result.confidence).toBeLessThanOrEqual(1);
        });
    });

    describe('Funding connection analysis', () => {
        test('considers funding connections in confidence', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-fund-001' };

            const baseTime = Date.now();
            mockDb.tradeHistory.getByMarket.mockResolvedValue([
                { maker: '0xwallet1', side: 'YES', timestamp: new Date(baseTime).toISOString(), size: 100 },
                { maker: '0xwallet2', side: 'YES', timestamp: new Date(baseTime + 60000).toISOString(), size: 150 },
                { maker: '0xwallet3', side: 'YES', timestamp: new Date(baseTime + 120000).toISOString(), size: 200 }
            ]);

            // Mock: wallets are connected via funding
            mockFundingAnalyzer.detectConnectedWallets.mockResolvedValue([
                { cluster: ['0xwallet1', '0xwallet2'], confidence: 0.8, reason: 'same_funding_source' }
            ]);

            const result = await processor.process(event, market);

            expect(result.detected).toBe(true);
            expect(mockFundingAnalyzer.detectConnectedWallets).toHaveBeenCalled();
        });

        test('continues if funding analysis fails', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-err-001' };

            const baseTime = Date.now();
            mockDb.tradeHistory.getByMarket.mockResolvedValue([
                { maker: '0xwallet1', side: 'YES', timestamp: new Date(baseTime).toISOString(), size: 100 },
                { maker: '0xwallet2', side: 'YES', timestamp: new Date(baseTime + 60000).toISOString(), size: 150 },
                { maker: '0xwallet3', side: 'YES', timestamp: new Date(baseTime + 120000).toISOString(), size: 200 }
            ]);

            // Mock: funding analysis throws error
            mockFundingAnalyzer.detectConnectedWallets.mockRejectedValue(new Error('Funding analysis failed'));

            const result = await processor.process(event, market);

            // Should still detect based on timing alone
            expect(result.detected).toBe(true);
        });
    });

    describe('Method signature', () => {
        test('process takes only (event, market) parameters - fetches trades from DB', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-sig-001' };

            mockDb.tradeHistory.getByMarket.mockResolvedValue([]);

            await processor.process(event, market);

            // Verify it fetched trades from DB rather than expecting them as parameters
            expect(mockDb.tradeHistory.getByMarket).toHaveBeenCalledWith('token-sig-001');
        });
    });

    describe('Metadata', () => {
        test('includes correct metadata when detected', async () => {
            const event = { id: 'event-1' };
            const market = { tokenId: 'token-meta-001' };

            const baseTime = Date.now();
            mockDb.tradeHistory.getByMarket.mockResolvedValue([
                { maker: '0xwallet1', side: 'YES', timestamp: new Date(baseTime).toISOString(), size: 100 },
                { maker: '0xwallet2', side: 'YES', timestamp: new Date(baseTime + 60000).toISOString(), size: 150 },
                { maker: '0xwallet3', side: 'YES', timestamp: new Date(baseTime + 120000).toISOString(), size: 200 }
            ]);

            mockFundingAnalyzer.detectConnectedWallets.mockResolvedValue([]);

            const result = await processor.process(event, market);

            expect(result.metadata).toHaveProperty('clusterSize', 3);
            expect(result.metadata).toHaveProperty('wallets');
            expect(result.metadata.wallets).toHaveLength(3);
            expect(result.metadata).toHaveProperty('totalVolume', 450);
            expect(result.metadata).toHaveProperty('direction', 'YES');
        });
    });
});
