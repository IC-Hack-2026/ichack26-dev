// Tests for Fresh Wallet Signal Processor

// Mock config before requiring the processor
jest.mock('../../../../config/index', () => ({
    signals: {
        freshWallet: {
            weight: 0.15,
            maxAgeDays: 7,
            maxTrades: 10,
            minTradeSize: 0.02 // 2% of liquidity
        }
    }
}));

// Mock walletTracker
const mockWalletTracker = {
    getWalletProfile: jest.fn()
};

jest.mock('../../../../services/wallet/tracker', () => ({
    walletTracker: mockWalletTracker
}));

const { FreshWalletProcessor, freshWalletProcessor } = require('../../../../services/signals/processors/fresh-wallet');
const { freshWalletProfile, veryFreshWalletProfile, establishedWalletProfile } = require('../../../fixtures/wallets');
const { standardMarket, lowLiquidityMarket, zeroLiquidityMarket } = require('../../../fixtures/markets');

describe('FreshWalletProcessor', () => {
    let processor;

    beforeEach(() => {
        jest.clearAllMocks();
        processor = new FreshWalletProcessor();
    });

    describe('Detection logic', () => {
        test('detects new wallet (< 7 days) making large trade (> 2% liquidity)', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 }; // 2% = 200
            const trade = { maker: '0xfresh', size: 500, side: 'YES' }; // 5% of liquidity

            // Mock: wallet is 1 day old with 2 trades
            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 2
            });

            const result = await processor.process(event, market, trade);

            expect(result.detected).toBe(true);
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.direction).toBe('YES');
        });

        test('does NOT detect established wallet making large trade', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xestablished', size: 500, side: 'YES' };

            // Mock: wallet is 30 days old with 150 trades
            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 150
            });

            const result = await processor.process(event, market, trade);

            expect(result.detected).toBe(false);
        });

        test('does NOT detect new wallet making small trade', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 }; // 2% = 200
            const trade = { maker: '0xfresh', size: 50, side: 'YES' }; // 0.5% of liquidity

            // Mock: wallet is 1 day old
            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 2
            });

            const result = await processor.process(event, market, trade);

            expect(result.detected).toBe(false);
        });

        test('detects wallet with few trades even if older than maxAgeDays', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xfew', size: 500, side: 'YES' };

            // Mock: wallet is 10 days old but only has 5 trades
            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 5 // Under maxTrades threshold
            });

            const result = await processor.process(event, market, trade);

            expect(result.detected).toBe(true);
        });

        test('returns not detected for zero liquidity market', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 0 };
            const trade = { maker: '0xfresh', size: 500, side: 'YES' };

            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 2
            });

            const result = await processor.process(event, market, trade);

            expect(result.detected).toBe(false);
        });

        test('returns not detected when no wallet address provided', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { size: 500, side: 'YES' }; // No address

            const result = await processor.process(event, market, trade);

            expect(result.detected).toBe(false);
        });
    });

    describe('Severity calculation', () => {
        test('returns HIGH severity for very new wallet (< 1 day) + very large trade (> 10% liquidity)', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xverynew', size: 1200, side: 'YES' }; // 12% of liquidity

            // Mock: wallet is 6 hours old with 1 trade
            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
                totalTrades: 1
            });

            const result = await processor.process(event, market, trade);

            expect(result.detected).toBe(true);
            expect(result.severity).toBe('HIGH');
        });

        test('returns MEDIUM severity for moderately fresh wallet', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xmodfresh', size: 300, side: 'YES' }; // 3% of liquidity

            // Mock: wallet is 3 days old with 5 trades
            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 5
            });

            const result = await processor.process(event, market, trade);

            expect(result.detected).toBe(true);
            expect(result.severity).toBe('MEDIUM');
        });
    });

    describe('Confidence calculation', () => {
        test('confidence is weighted 60% freshness + 40% size', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xtest', size: 500, side: 'YES' }; // 5% of liquidity

            // Mock: wallet is 1 day old with 2 trades
            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 2
            });

            const result = await processor.process(event, market, trade);

            expect(result.detected).toBe(true);
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
        });

        test('higher confidence for very new wallet', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xtest', size: 500, side: 'YES' };

            // Very new wallet (2 hours)
            mockWalletTracker.getWalletProfile.mockResolvedValueOnce({
                firstTradeAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                totalTrades: 1
            });

            const resultVeryNew = await processor.process(event, market, trade);

            // Moderately new wallet (5 days)
            mockWalletTracker.getWalletProfile.mockResolvedValueOnce({
                firstTradeAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 8
            });

            const resultModNew = await processor.process(event, market, trade);

            expect(resultVeryNew.confidence).toBeGreaterThan(resultModNew.confidence);
        });

        test('higher confidence for larger trades', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };

            // Same wallet profile for both
            const walletProfile = {
                firstTradeAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 5
            };

            // Large trade (8%)
            mockWalletTracker.getWalletProfile.mockResolvedValueOnce(walletProfile);
            const resultLarge = await processor.process(event, market, { maker: '0xtest', size: 800, side: 'YES' });

            // Smaller trade (3%)
            mockWalletTracker.getWalletProfile.mockResolvedValueOnce(walletProfile);
            const resultSmall = await processor.process(event, market, { maker: '0xtest', size: 300, side: 'YES' });

            expect(resultLarge.confidence).toBeGreaterThan(resultSmall.confidence);
        });
    });

    describe('Address extraction', () => {
        test('extracts address from trade.maker', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xfrommaker', size: 500, side: 'YES' };

            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 2
            });

            await processor.process(event, market, trade);

            expect(mockWalletTracker.getWalletProfile).toHaveBeenCalledWith('0xfrommaker');
        });

        test('extracts address from trade.taker when maker is missing', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { taker: '0xfromtaker', size: 500, side: 'YES' };

            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 2
            });

            await processor.process(event, market, trade);

            expect(mockWalletTracker.getWalletProfile).toHaveBeenCalledWith('0xfromtaker');
        });

        test('extracts address from trade.address as fallback', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { address: '0xfromaddress', size: 500, side: 'YES' };

            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 2
            });

            await processor.process(event, market, trade);

            expect(mockWalletTracker.getWalletProfile).toHaveBeenCalledWith('0xfromaddress');
        });

        test('normalizes address to lowercase', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xABC123DEF', size: 500, side: 'YES' };

            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 2
            });

            await processor.process(event, market, trade);

            expect(mockWalletTracker.getWalletProfile).toHaveBeenCalledWith('0xabc123def');
        });
    });

    describe('Trade size calculation', () => {
        test('uses trade.size when available', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xtest', size: 500, side: 'YES' };

            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 2
            });

            const result = await processor.process(event, market, trade);

            expect(result.metadata.tradeSize).toBe(500);
        });

        test('uses trade.amount as fallback', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xtest', amount: 600, side: 'YES' };

            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 2
            });

            const result = await processor.process(event, market, trade);

            expect(result.metadata.tradeSize).toBe(600);
        });

        test('calculates from price * quantity if available', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xtest', price: 0.5, quantity: 1000, side: 'YES' };

            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 2
            });

            const result = await processor.process(event, market, trade);

            expect(result.metadata.tradeSize).toBe(500); // 0.5 * 1000
        });
    });

    describe('Metadata', () => {
        test('includes correct metadata when detected', async () => {
            const event = { id: 'event-1' };
            const market = { liquidity: 10000 };
            const trade = { maker: '0xmetadata', size: 500, side: 'YES' };

            mockWalletTracker.getWalletProfile.mockResolvedValue({
                firstTradeAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                totalTrades: 3
            });

            const result = await processor.process(event, market, trade);

            expect(result.detected).toBe(true);
            expect(result.metadata).toHaveProperty('walletAge');
            expect(result.metadata).toHaveProperty('totalTrades', 3);
            expect(result.metadata).toHaveProperty('tradeSize', 500);
            expect(result.metadata).toHaveProperty('liquidityPercent');
            expect(result.metadata).toHaveProperty('address', '0xmetadata');
        });
    });
});
