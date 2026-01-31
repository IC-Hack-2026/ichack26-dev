// Tests for Liquidity Impact Signal Processor

// Mock config
jest.mock('../../../../config', () => ({
    signals: {
        liquidityImpact: {
            weight: 0.12,
            threshold: 0.02 // 2%
        }
    }
}));

// Mock orderBookAnalyzer
const mockOrderBookAnalyzer = {
    calculateLiquidityImpact: jest.fn()
};

jest.mock('../../../../services/orderbook/analyzer', () => ({
    orderBookAnalyzer: mockOrderBookAnalyzer
}));

const { LiquidityImpactProcessor } = require('../../../../services/signals/processors/liquidity-impact');
const { standardOrderbook, thinOrderbook, deepOrderbook } = require('../../../fixtures/orderbooks');
const { standardMarket } = require('../../../fixtures/markets');

describe('LiquidityImpactProcessor', () => {
    let processor;

    beforeEach(() => {
        jest.clearAllMocks();
        processor = new LiquidityImpactProcessor();
    });

    describe('Detection logic', () => {
        test('detects trade consuming > 2% of order book', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 1000, side: 'BUY' };
            const orderbook = standardOrderbook;

            // Mock: trade has 3% impact
            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 3, // 3%
                levelsConsumed: 2,
                avgFillPrice: 0.62,
                slippage: 1.5
            });

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(true);
            expect(mockOrderBookAnalyzer.calculateLiquidityImpact).toHaveBeenCalledWith(
                1000,
                'BUY',
                orderbook
            );
        });

        test('does NOT detect small trades (< 2% impact)', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 100, side: 'BUY' };
            const orderbook = deepOrderbook;

            // Mock: trade has only 0.5% impact
            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 0.5,
                levelsConsumed: 1,
                avgFillPrice: 0.61,
                slippage: 0.2
            });

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(false);
        });

        test('returns not detected when trade is missing', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = null;
            const orderbook = standardOrderbook;

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(false);
        });

        test('returns not detected when orderbook is missing', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 1000, side: 'BUY' };
            const orderbook = null;

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(false);
        });
    });

    describe('Severity calculation', () => {
        test('returns HIGH severity for > 5% impact', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 5000, side: 'BUY' };
            const orderbook = thinOrderbook;

            // Mock: 6% impact
            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 6,
                levelsConsumed: 3,
                avgFillPrice: 0.65,
                slippage: 4
            });

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(true);
            expect(result.severity).toBe('HIGH');
        });

        test('returns MEDIUM severity for 2-5% impact', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 2000, side: 'BUY' };
            const orderbook = standardOrderbook;

            // Mock: 3.5% impact
            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 3.5,
                levelsConsumed: 2,
                avgFillPrice: 0.63,
                slippage: 2
            });

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(true);
            expect(result.severity).toBe('MEDIUM');
        });

        test('boundary test: exactly 5% is MEDIUM', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 3000, side: 'SELL' };
            const orderbook = standardOrderbook;

            // Mock: exactly 5% impact
            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 5,
                levelsConsumed: 2,
                avgFillPrice: 0.59,
                slippage: 2.5
            });

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(true);
            expect(result.severity).toBe('MEDIUM');
        });

        test('boundary test: 5.1% is HIGH', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 3500, side: 'SELL' };
            const orderbook = standardOrderbook;

            // Mock: 5.1% impact
            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 5.1,
                levelsConsumed: 3,
                avgFillPrice: 0.58,
                slippage: 3
            });

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(true);
            expect(result.severity).toBe('HIGH');
        });
    });

    describe('Confidence calculation', () => {
        test('confidence scales with impact (10% impact = 100% confidence)', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 8000, side: 'BUY' };
            const orderbook = thinOrderbook;

            // Mock: 10% impact
            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 10,
                levelsConsumed: 5,
                avgFillPrice: 0.70,
                slippage: 8
            });

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(true);
            expect(result.confidence).toBe(1);
        });

        test('confidence is proportional for smaller impacts', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 1500, side: 'BUY' };
            const orderbook = standardOrderbook;

            // Mock: 5% impact -> 50% confidence
            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 5,
                levelsConsumed: 2,
                avgFillPrice: 0.63,
                slippage: 2.5
            });

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(true);
            expect(result.confidence).toBeCloseTo(0.5, 1);
        });

        test('confidence capped at 1 for very large impacts', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 20000, side: 'BUY' };
            const orderbook = thinOrderbook;

            // Mock: 20% impact
            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 20,
                levelsConsumed: 5,
                avgFillPrice: 0.80,
                slippage: 15
            });

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(true);
            expect(result.confidence).toBe(1);
        });
    });

    describe('Slippage calculation', () => {
        test('metadata includes slippage from analyzer', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 2000, side: 'BUY' };
            const orderbook = standardOrderbook;

            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 4,
                levelsConsumed: 3,
                avgFillPrice: 0.64,
                slippage: 2.8
            });

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(true);
            expect(result.metadata.slippage).toBe(2.8);
            expect(result.metadata.avgFillPrice).toBe(0.64);
            expect(result.metadata.levelsConsumed).toBe(3);
        });
    });

    describe('Direction handling', () => {
        test('direction matches trade side', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const orderbook = standardOrderbook;

            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 3,
                levelsConsumed: 2,
                avgFillPrice: 0.62,
                slippage: 1.5
            });

            const resultBuy = await processor.process(event, market, { size: 1000, side: 'BUY' }, orderbook);
            expect(resultBuy.direction).toBe('BUY');

            const resultSell = await processor.process(event, market, { size: 1000, side: 'SELL' }, orderbook);
            expect(resultSell.direction).toBe('SELL');
        });
    });

    describe('Metadata', () => {
        test('includes all relevant metadata when detected', async () => {
            const event = { id: 'event-1' };
            const market = standardMarket;
            const trade = { size: 1500, side: 'BUY' };
            const orderbook = standardOrderbook;

            mockOrderBookAnalyzer.calculateLiquidityImpact.mockReturnValue({
                impactPercent: 3.5,
                levelsConsumed: 2,
                avgFillPrice: 0.63,
                slippage: 2
            });

            const result = await processor.process(event, market, trade, orderbook);

            expect(result.detected).toBe(true);
            expect(result.metadata).toEqual({
                impactPercent: 3.5,
                levelsConsumed: 2,
                avgFillPrice: 0.63,
                slippage: 2,
                tradeSize: 1500
            });
        });
    });
});
