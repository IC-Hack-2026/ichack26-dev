/**
 * Tests for OrderBookManager class
 */

const { OrderBookManager } = require('../../../services/orderbook/order-book-manager');
const { bookSnapshot, priceChangeMessages } = require('../../fixtures/orderbooks');

describe('OrderBookManager', () => {
    let manager;

    beforeEach(() => {
        manager = new OrderBookManager();
    });

    describe('getOrderBook', () => {
        test('creates new order book if not exists', () => {
            const orderBook = manager.getOrderBook('asset-1');

            expect(orderBook).toBeDefined();
            expect(orderBook.assetId).toBe('asset-1');
        });

        test('returns existing order book', () => {
            const orderBook1 = manager.getOrderBook('asset-1');
            const orderBook2 = manager.getOrderBook('asset-1');

            expect(orderBook1).toBe(orderBook2);
        });

        test('creates separate order books for different assets', () => {
            const orderBook1 = manager.getOrderBook('asset-1');
            const orderBook2 = manager.getOrderBook('asset-2');

            expect(orderBook1).not.toBe(orderBook2);
            expect(orderBook1.assetId).toBe('asset-1');
            expect(orderBook2.assetId).toBe('asset-2');
        });
    });

    describe('hasOrderBook', () => {
        test('returns false for non-existent order book', () => {
            expect(manager.hasOrderBook('asset-1')).toBe(false);
        });

        test('returns true after order book created', () => {
            manager.getOrderBook('asset-1');

            expect(manager.hasOrderBook('asset-1')).toBe(true);
        });
    });

    describe('removeOrderBook', () => {
        test('removes existing order book', () => {
            manager.getOrderBook('asset-1');

            const result = manager.removeOrderBook('asset-1');

            expect(result).toBe(true);
            expect(manager.hasOrderBook('asset-1')).toBe(false);
        });

        test('returns false for non-existent order book', () => {
            const result = manager.removeOrderBook('asset-1');

            expect(result).toBe(false);
        });
    });

    describe('clearAll', () => {
        test('removes all order books', () => {
            manager.getOrderBook('asset-1');
            manager.getOrderBook('asset-2');
            manager.getOrderBook('asset-3');

            manager.clearAll();

            expect(manager.hasOrderBook('asset-1')).toBe(false);
            expect(manager.hasOrderBook('asset-2')).toBe(false);
            expect(manager.hasOrderBook('asset-3')).toBe(false);
        });
    });

    describe('handleBookSnapshot', () => {
        test('initializes order book from snapshot', () => {
            manager.handleBookSnapshot({
                asset_id: 'asset-1',
                bids: [{ price: '0.60', size: '1000' }],
                asks: [{ price: '0.61', size: '1000' }],
                timestamp: '1704067200000',
                hash: 'abc123'
            });

            const orderBook = manager.getOrderBook('asset-1');
            expect(orderBook.isInitialized()).toBe(true);
            expect(orderBook.bids.size).toBe(1);
            expect(orderBook.asks.size).toBe(1);
        });

        test('handles assetId field name', () => {
            manager.handleBookSnapshot({
                assetId: 'asset-1',
                bids: [{ price: '0.60', size: '1000' }],
                asks: []
            });

            expect(manager.getOrderBook('asset-1').isInitialized()).toBe(true);
        });

        test('handles market field name', () => {
            manager.handleBookSnapshot({
                market: 'asset-1',
                bids: [{ price: '0.60', size: '1000' }],
                asks: []
            });

            expect(manager.getOrderBook('asset-1').isInitialized()).toBe(true);
        });

        test('handles token_id field name', () => {
            manager.handleBookSnapshot({
                token_id: 'asset-1',
                bids: [{ price: '0.60', size: '1000' }],
                asks: []
            });

            expect(manager.getOrderBook('asset-1').isInitialized()).toBe(true);
        });

        test('emits initialized event on first snapshot', () => {
            const listener = jest.fn();
            manager.on('initialized', listener);

            manager.handleBookSnapshot({
                asset_id: 'asset-1',
                bids: [],
                asks: []
            });

            expect(listener).toHaveBeenCalledWith('asset-1');
        });

        test('does not emit initialized on subsequent snapshots', () => {
            const listener = jest.fn();
            manager.on('initialized', listener);

            manager.handleBookSnapshot({
                asset_id: 'asset-1',
                bids: [],
                asks: []
            });
            manager.handleBookSnapshot({
                asset_id: 'asset-1',
                bids: [{ price: '0.60', size: '1000' }],
                asks: []
            });

            expect(listener).toHaveBeenCalledTimes(1);
        });

        test('emits updated event', () => {
            const listener = jest.fn();
            manager.on('updated', listener);

            manager.handleBookSnapshot({
                asset_id: 'asset-1',
                bids: [],
                asks: []
            });

            expect(listener).toHaveBeenCalled();
            expect(listener.mock.calls[0][0]).toBe('asset-1');
        });

        test('skips snapshot without asset_id', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            manager.handleBookSnapshot({
                bids: [],
                asks: []
            });

            expect(manager.orderBooks.size).toBe(0);
            expect(warnSpy).toHaveBeenCalled();

            warnSpy.mockRestore();
        });

        test('uses fixture data correctly', () => {
            manager.handleBookSnapshot(bookSnapshot);

            const orderBook = manager.getOrderBook(bookSnapshot.asset_id);
            expect(orderBook.isInitialized()).toBe(true);
            expect(orderBook.bids.size).toBe(bookSnapshot.bids.length);
            expect(orderBook.asks.size).toBe(bookSnapshot.asks.length);
        });
    });

    describe('handlePriceChange', () => {
        beforeEach(() => {
            // Initialize order book first
            manager.handleBookSnapshot({
                asset_id: 'asset-1',
                bids: [{ price: '0.60', size: '1000' }],
                asks: [{ price: '0.61', size: '1000' }]
            });
        });

        test('applies single price change', () => {
            manager.handlePriceChange({
                asset_id: 'asset-1',
                price: '0.59',
                size: '500',
                side: 'BUY'
            });

            const orderBook = manager.getOrderBook('asset-1');
            expect(orderBook.bids.size).toBe(2);
            expect(orderBook.bids.get(0.59)).toBe(500);
        });

        test('applies array of price changes', () => {
            manager.handlePriceChange([
                { asset_id: 'asset-1', price: '0.59', size: '500', side: 'BUY' },
                { asset_id: 'asset-1', price: '0.62', size: '500', side: 'SELL' }
            ]);

            const orderBook = manager.getOrderBook('asset-1');
            expect(orderBook.bids.size).toBe(2);
            expect(orderBook.asks.size).toBe(2);
        });

        test('removes level when size is 0', () => {
            manager.handlePriceChange({
                asset_id: 'asset-1',
                price: '0.60',
                size: '0',
                side: 'BUY'
            });

            const orderBook = manager.getOrderBook('asset-1');
            expect(orderBook.bids.size).toBe(0);
        });

        test('skips changes for uninitialized order books', () => {
            manager.handlePriceChange({
                asset_id: 'new-asset',
                price: '0.50',
                size: '1000',
                side: 'BUY'
            });

            const orderBook = manager.getOrderBook('new-asset');
            expect(orderBook.bids.size).toBe(0);
        });

        test('emits updated event after price change', () => {
            const listener = jest.fn();
            manager.on('updated', listener);
            listener.mockClear(); // Clear calls from initialization

            manager.handlePriceChange({
                asset_id: 'asset-1',
                price: '0.59',
                size: '500',
                side: 'BUY'
            });

            expect(listener).toHaveBeenCalledWith('asset-1', expect.any(Object));
        });

        test('handles mixed assets in array', () => {
            manager.handleBookSnapshot({
                asset_id: 'asset-2',
                bids: [{ price: '0.50', size: '1000' }],
                asks: []
            });

            manager.handlePriceChange([
                { asset_id: 'asset-1', price: '0.59', size: '500', side: 'BUY' },
                { asset_id: 'asset-2', price: '0.49', size: '500', side: 'BUY' }
            ]);

            expect(manager.getOrderBook('asset-1').bids.size).toBe(2);
            expect(manager.getOrderBook('asset-2').bids.size).toBe(2);
        });

        test('handles different asset ID field names', () => {
            manager.handlePriceChange({ assetId: 'asset-1', price: '0.59', size: '500', side: 'BUY' });
            expect(manager.getOrderBook('asset-1').bids.size).toBe(2);
        });

        test('skips changes without asset_id', () => {
            const orderBook = manager.getOrderBook('asset-1');
            const bidCount = orderBook.bids.size;

            manager.handlePriceChange([
                { price: '0.59', size: '500', side: 'BUY' } // missing asset_id
            ]);

            expect(orderBook.bids.size).toBe(bidCount);
        });

        test('uses fixture data correctly', () => {
            // Re-initialize with fixture snapshot
            manager.handleBookSnapshot(bookSnapshot);

            // Apply fixture price changes
            manager.handlePriceChange(priceChangeMessages);

            const orderBook = manager.getOrderBook(bookSnapshot.asset_id);
            expect(orderBook.isInitialized()).toBe(true);
        });
    });

    describe('getStatus', () => {
        test('returns empty status when no order books', () => {
            const status = manager.getStatus();

            expect(status.totalOrderBooks).toBe(0);
            expect(status.initializedCount).toBe(0);
            expect(status.orderBooks).toEqual([]);
        });

        test('returns status with initialized order books', () => {
            manager.handleBookSnapshot({
                asset_id: 'asset-1',
                bids: [{ price: '0.60', size: '1000' }],
                asks: [{ price: '0.61', size: '2000' }]
            });
            manager.handleBookSnapshot({
                asset_id: 'asset-2',
                bids: [{ price: '0.50', size: '500' }],
                asks: []
            });

            const status = manager.getStatus();

            expect(status.totalOrderBooks).toBe(2);
            expect(status.initializedCount).toBe(2);
            expect(status.totalBidLevels).toBe(2);
            expect(status.totalAskLevels).toBe(1);
            expect(status.orderBooks.length).toBe(2);
        });

        test('counts uninitialized order books correctly', () => {
            manager.getOrderBook('asset-1'); // Created but not initialized
            manager.handleBookSnapshot({
                asset_id: 'asset-2',
                bids: [],
                asks: []
            });

            const status = manager.getStatus();

            expect(status.totalOrderBooks).toBe(2);
            expect(status.initializedCount).toBe(1);
        });
    });
});
