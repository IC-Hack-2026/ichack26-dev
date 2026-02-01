/**
 * Tests for OrderBook class
 */

const { OrderBook } = require('../../../services/orderbook/order-book');

describe('OrderBook', () => {
    let orderBook;

    beforeEach(() => {
        orderBook = new OrderBook('test-asset-id');
    });

    describe('constructor', () => {
        test('initializes with correct asset ID', () => {
            expect(orderBook.assetId).toBe('test-asset-id');
        });

        test('starts uninitialized', () => {
            expect(orderBook.isInitialized()).toBe(false);
        });

        test('starts with empty bids and asks', () => {
            expect(orderBook.bids.size).toBe(0);
            expect(orderBook.asks.size).toBe(0);
        });
    });

    describe('initializeFromSnapshot', () => {
        test('initializes with bids and asks', () => {
            orderBook.initializeFromSnapshot({
                bids: [
                    { price: '0.60', size: '1000' },
                    { price: '0.59', size: '2000' }
                ],
                asks: [
                    { price: '0.61', size: '1000' },
                    { price: '0.62', size: '2000' }
                ],
                timestamp: '1704067200000',
                hash: 'abc123'
            });

            expect(orderBook.isInitialized()).toBe(true);
            expect(orderBook.bids.size).toBe(2);
            expect(orderBook.asks.size).toBe(2);
            expect(orderBook.hash).toBe('abc123');
        });

        test('handles empty snapshot', () => {
            orderBook.initializeFromSnapshot({
                bids: [],
                asks: []
            });

            expect(orderBook.isInitialized()).toBe(true);
            expect(orderBook.bids.size).toBe(0);
            expect(orderBook.asks.size).toBe(0);
        });

        test('handles bids-only snapshot', () => {
            orderBook.initializeFromSnapshot({
                bids: [{ price: '0.60', size: '1000' }],
                asks: []
            });

            expect(orderBook.bids.size).toBe(1);
            expect(orderBook.asks.size).toBe(0);
        });

        test('handles asks-only snapshot', () => {
            orderBook.initializeFromSnapshot({
                bids: [],
                asks: [{ price: '0.61', size: '1000' }]
            });

            expect(orderBook.bids.size).toBe(0);
            expect(orderBook.asks.size).toBe(1);
        });

        test('sorts bids descending (highest first)', () => {
            orderBook.initializeFromSnapshot({
                bids: [
                    { price: '0.58', size: '1000' },
                    { price: '0.60', size: '1000' },
                    { price: '0.59', size: '1000' }
                ],
                asks: []
            });

            expect(orderBook.sortedBidPrices).toEqual([0.60, 0.59, 0.58]);
        });

        test('sorts asks ascending (lowest first)', () => {
            orderBook.initializeFromSnapshot({
                bids: [],
                asks: [
                    { price: '0.63', size: '1000' },
                    { price: '0.61', size: '1000' },
                    { price: '0.62', size: '1000' }
                ]
            });

            expect(orderBook.sortedAskPrices).toEqual([0.61, 0.62, 0.63]);
        });

        test('clears existing data on re-initialization', () => {
            orderBook.initializeFromSnapshot({
                bids: [{ price: '0.60', size: '1000' }],
                asks: [{ price: '0.61', size: '1000' }]
            });

            orderBook.initializeFromSnapshot({
                bids: [{ price: '0.55', size: '500' }],
                asks: []
            });

            expect(orderBook.bids.size).toBe(1);
            expect(orderBook.asks.size).toBe(0);
            expect(orderBook.getBestBid().price).toBe(0.55);
        });

        test('handles array format [price, size]', () => {
            orderBook.initializeFromSnapshot({
                bids: [['0.60', '1000'], ['0.59', '2000']],
                asks: [['0.61', '1000']]
            });

            expect(orderBook.bids.size).toBe(2);
            expect(orderBook.asks.size).toBe(1);
        });

        test('filters out zero-size levels', () => {
            orderBook.initializeFromSnapshot({
                bids: [
                    { price: '0.60', size: '1000' },
                    { price: '0.59', size: '0' }
                ],
                asks: [{ price: '0.61', size: '1000' }]
            });

            expect(orderBook.bids.size).toBe(1);
        });
    });

    describe('applyPriceChange', () => {
        beforeEach(() => {
            orderBook.initializeFromSnapshot({
                bids: [
                    { price: '0.60', size: '1000' },
                    { price: '0.59', size: '2000' }
                ],
                asks: [
                    { price: '0.61', size: '1000' },
                    { price: '0.62', size: '2000' }
                ]
            });
        });

        test('adds new bid level', () => {
            orderBook.applyPriceChange({ price: '0.595', size: '500', side: 'BUY' });

            expect(orderBook.bids.size).toBe(3);
            expect(orderBook.bids.get(0.595)).toBe(500);
            expect(orderBook.sortedBidPrices).toEqual([0.60, 0.595, 0.59]);
        });

        test('adds new ask level', () => {
            orderBook.applyPriceChange({ price: '0.615', size: '500', side: 'SELL' });

            expect(orderBook.asks.size).toBe(3);
            expect(orderBook.asks.get(0.615)).toBe(500);
            expect(orderBook.sortedAskPrices).toEqual([0.61, 0.615, 0.62]);
        });

        test('updates existing bid level', () => {
            orderBook.applyPriceChange({ price: '0.60', size: '1500', side: 'BUY' });

            expect(orderBook.bids.size).toBe(2);
            expect(orderBook.bids.get(0.60)).toBe(1500);
        });

        test('updates existing ask level', () => {
            orderBook.applyPriceChange({ price: '0.61', size: '1500', side: 'SELL' });

            expect(orderBook.asks.size).toBe(2);
            expect(orderBook.asks.get(0.61)).toBe(1500);
        });

        test('removes bid level when size is 0', () => {
            orderBook.applyPriceChange({ price: '0.60', size: '0', side: 'BUY' });

            expect(orderBook.bids.size).toBe(1);
            expect(orderBook.bids.has(0.60)).toBe(false);
            expect(orderBook.sortedBidPrices).toEqual([0.59]);
        });

        test('removes ask level when size is 0', () => {
            orderBook.applyPriceChange({ price: '0.61', size: '0', side: 'SELL' });

            expect(orderBook.asks.size).toBe(1);
            expect(orderBook.asks.has(0.61)).toBe(false);
            expect(orderBook.sortedAskPrices).toEqual([0.62]);
        });

        test('handles numeric size', () => {
            orderBook.applyPriceChange({ price: '0.60', size: 1500, side: 'BUY' });

            expect(orderBook.bids.get(0.60)).toBe(1500);
        });

        test('ignores invalid price', () => {
            const bidCount = orderBook.bids.size;
            orderBook.applyPriceChange({ price: null, size: '500', side: 'BUY' });

            expect(orderBook.bids.size).toBe(bidCount);
        });
    });

    describe('applyPriceChanges (batch)', () => {
        beforeEach(() => {
            orderBook.initializeFromSnapshot({
                bids: [{ price: '0.60', size: '1000' }],
                asks: [{ price: '0.61', size: '1000' }]
            });
        });

        test('applies multiple changes', () => {
            orderBook.applyPriceChanges([
                { price: '0.59', size: '500', side: 'BUY' },
                { price: '0.62', size: '500', side: 'SELL' },
                { price: '0.60', size: '0', side: 'BUY' }
            ]);

            expect(orderBook.bids.size).toBe(1);
            expect(orderBook.bids.has(0.59)).toBe(true);
            expect(orderBook.bids.has(0.60)).toBe(false);
            expect(orderBook.asks.size).toBe(2);
        });

        test('handles empty array', () => {
            orderBook.applyPriceChanges([]);

            expect(orderBook.bids.size).toBe(1);
            expect(orderBook.asks.size).toBe(1);
        });

        test('handles non-array input gracefully', () => {
            orderBook.applyPriceChanges(null);
            orderBook.applyPriceChanges(undefined);

            expect(orderBook.bids.size).toBe(1);
        });
    });

    describe('getBestBid', () => {
        test('returns highest bid', () => {
            orderBook.initializeFromSnapshot({
                bids: [
                    { price: '0.58', size: '1000' },
                    { price: '0.60', size: '500' },
                    { price: '0.59', size: '2000' }
                ],
                asks: []
            });

            const bestBid = orderBook.getBestBid();
            expect(bestBid.price).toBe(0.60);
            expect(bestBid.size).toBe(500);
        });

        test('returns null when no bids', () => {
            orderBook.initializeFromSnapshot({ bids: [], asks: [] });

            expect(orderBook.getBestBid()).toBeNull();
        });
    });

    describe('getBestAsk', () => {
        test('returns lowest ask', () => {
            orderBook.initializeFromSnapshot({
                bids: [],
                asks: [
                    { price: '0.63', size: '1000' },
                    { price: '0.61', size: '500' },
                    { price: '0.62', size: '2000' }
                ]
            });

            const bestAsk = orderBook.getBestAsk();
            expect(bestAsk.price).toBe(0.61);
            expect(bestAsk.size).toBe(500);
        });

        test('returns null when no asks', () => {
            orderBook.initializeFromSnapshot({ bids: [], asks: [] });

            expect(orderBook.getBestAsk()).toBeNull();
        });
    });

    describe('getSpread', () => {
        test('calculates spread correctly', () => {
            orderBook.initializeFromSnapshot({
                bids: [{ price: '0.60', size: '1000' }],
                asks: [{ price: '0.62', size: '1000' }]
            });

            const spread = orderBook.getSpread();
            expect(spread.spread).toBeCloseTo(0.02);
            expect(spread.midPrice).toBeCloseTo(0.61);
            expect(spread.spreadPercent).toBeCloseTo((0.02 / 0.61) * 100);
        });

        test('returns zeros for empty book', () => {
            orderBook.initializeFromSnapshot({ bids: [], asks: [] });

            const spread = orderBook.getSpread();
            expect(spread.spread).toBe(0);
            expect(spread.spreadPercent).toBe(0);
            expect(spread.midPrice).toBe(0);
        });

        test('returns midPrice as bestAsk when no bids', () => {
            orderBook.initializeFromSnapshot({
                bids: [],
                asks: [{ price: '0.61', size: '1000' }]
            });

            const spread = orderBook.getSpread();
            expect(spread.midPrice).toBe(0.61);
        });

        test('returns midPrice as bestBid when no asks', () => {
            orderBook.initializeFromSnapshot({
                bids: [{ price: '0.60', size: '1000' }],
                asks: []
            });

            const spread = orderBook.getSpread();
            expect(spread.midPrice).toBe(0.60);
        });
    });

    describe('getDepth', () => {
        beforeEach(() => {
            orderBook.initializeFromSnapshot({
                bids: [
                    { price: '0.60', size: '1000' },
                    { price: '0.59', size: '2000' },
                    { price: '0.58', size: '3000' }
                ],
                asks: [
                    { price: '0.61', size: '1000' },
                    { price: '0.62', size: '2000' }
                ]
            });
        });

        test('returns top N levels', () => {
            const depth = orderBook.getDepth(2);

            expect(depth.bids.length).toBe(2);
            expect(depth.asks.length).toBe(2);
            expect(depth.bids[0].price).toBe(0.60);
            expect(depth.bids[1].price).toBe(0.59);
        });

        test('returns all levels when N exceeds available', () => {
            const depth = orderBook.getDepth(10);

            expect(depth.bids.length).toBe(3);
            expect(depth.asks.length).toBe(2);
        });

        test('returns empty arrays for empty book', () => {
            orderBook.initializeFromSnapshot({ bids: [], asks: [] });
            const depth = orderBook.getDepth(5);

            expect(depth.bids).toEqual([]);
            expect(depth.asks).toEqual([]);
        });
    });

    describe('getFullBook', () => {
        test('returns all levels with metadata', () => {
            orderBook.initializeFromSnapshot({
                bids: [
                    { price: '0.60', size: '1000' },
                    { price: '0.59', size: '2000' }
                ],
                asks: [{ price: '0.61', size: '1000' }],
                timestamp: '1704067200000',
                hash: 'abc123'
            });

            const book = orderBook.getFullBook();

            expect(book.bids.length).toBe(2);
            expect(book.asks.length).toBe(1);
            expect(book.hash).toBe('abc123');
        });
    });

    describe('getImbalance', () => {
        test('returns positive value when more bids than asks', () => {
            orderBook.initializeFromSnapshot({
                bids: [{ price: '0.60', size: '2000' }],
                asks: [{ price: '0.61', size: '1000' }]
            });

            const imbalance = orderBook.getImbalance();
            expect(imbalance).toBeCloseTo(1 / 3); // (2000-1000) / 3000
        });

        test('returns negative value when more asks than bids', () => {
            orderBook.initializeFromSnapshot({
                bids: [{ price: '0.60', size: '1000' }],
                asks: [{ price: '0.61', size: '2000' }]
            });

            const imbalance = orderBook.getImbalance();
            expect(imbalance).toBeCloseTo(-1 / 3);
        });

        test('returns 0 when balanced', () => {
            orderBook.initializeFromSnapshot({
                bids: [{ price: '0.60', size: '1000' }],
                asks: [{ price: '0.61', size: '1000' }]
            });

            expect(orderBook.getImbalance()).toBe(0);
        });

        test('returns 0 for empty book', () => {
            orderBook.initializeFromSnapshot({ bids: [], asks: [] });

            expect(orderBook.getImbalance()).toBe(0);
        });
    });

    describe('getStats', () => {
        test('returns comprehensive stats', () => {
            orderBook.initializeFromSnapshot({
                bids: [
                    { price: '0.60', size: '1000' },
                    { price: '0.59', size: '2000' }
                ],
                asks: [{ price: '0.61', size: '1000' }]
            });

            const stats = orderBook.getStats();

            expect(stats.assetId).toBe('test-asset-id');
            expect(stats.initialized).toBe(true);
            expect(stats.bidLevels).toBe(2);
            expect(stats.askLevels).toBe(1);
            expect(stats.bidTotal).toBe(3000);
            expect(stats.askTotal).toBe(1000);
            expect(stats.midPrice).toBeCloseTo(0.605);
        });
    });

    describe('price precision handling', () => {
        test('handles string prices', () => {
            orderBook.initializeFromSnapshot({
                bids: [{ price: '0.12345', size: '1000' }],
                asks: []
            });

            expect(orderBook.bids.get(0.12345)).toBe(1000);
        });

        test('handles numeric prices in updates', () => {
            orderBook.initializeFromSnapshot({ bids: [], asks: [] });
            orderBook.applyPriceChange({ price: 0.60, size: '1000', side: 'BUY' });

            expect(orderBook.bids.size).toBe(1);
        });
    });

    describe('sorted array maintenance', () => {
        test('maintains bid order after multiple insertions', () => {
            orderBook.initializeFromSnapshot({ bids: [], asks: [] });

            orderBook.applyPriceChange({ price: '0.50', size: '100', side: 'BUY' });
            orderBook.applyPriceChange({ price: '0.60', size: '100', side: 'BUY' });
            orderBook.applyPriceChange({ price: '0.55', size: '100', side: 'BUY' });
            orderBook.applyPriceChange({ price: '0.58', size: '100', side: 'BUY' });

            expect(orderBook.sortedBidPrices).toEqual([0.60, 0.58, 0.55, 0.50]);
        });

        test('maintains ask order after multiple insertions', () => {
            orderBook.initializeFromSnapshot({ bids: [], asks: [] });

            orderBook.applyPriceChange({ price: '0.70', size: '100', side: 'SELL' });
            orderBook.applyPriceChange({ price: '0.61', size: '100', side: 'SELL' });
            orderBook.applyPriceChange({ price: '0.65', size: '100', side: 'SELL' });
            orderBook.applyPriceChange({ price: '0.63', size: '100', side: 'SELL' });

            expect(orderBook.sortedAskPrices).toEqual([0.61, 0.63, 0.65, 0.70]);
        });
    });
});
