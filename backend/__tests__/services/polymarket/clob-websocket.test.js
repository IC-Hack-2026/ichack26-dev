// Tests for Polymarket CLOB WebSocket Client

const EventEmitter = require('events');

// Mock the 'ws' module before requiring the client
const mockWsInstance = {
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1 // WebSocket.OPEN
};

jest.mock('ws', () => {
    return jest.fn().mockImplementation(() => mockWsInstance);
});

// Mock the config
jest.mock('../../../config', () => ({
    polymarket: {
        wsUrl: 'wss://test-ws.polymarket.com/ws/market'
    },
    realtime: {
        reconnectAttempts: 3,
        heartbeatIntervalMs: 30000,
        reconnectDelayMs: 1000
    }
}));

const { ClobWebSocketClient } = require('../../../services/polymarket/clob-websocket');

describe('ClobWebSocketClient', () => {
    let client;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        mockWsInstance.send.mockClear();
        mockWsInstance.close.mockClear();

        // Create new client instance
        client = new ClobWebSocketClient();
    });

    afterEach(() => {
        if (client) {
            client.disconnect();
        }
    });

    describe('Subscription format', () => {
        test('_resubscribeAll sends correct { assets_ids, type: "market" } format', async () => {
            // Setup subscriptions
            client.subscriptions.set('token123', new Set(['book']));
            client.subscriptions.set('token456', new Set(['price_change']));

            // Simulate connected state
            client.ws = mockWsInstance;
            client.isConnected = true;

            // Call resubscribe
            client._resubscribeAll();

            // Verify the message format
            expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
            const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
            expect(sentMessage).toHaveProperty('assets_ids');
            expect(sentMessage).toHaveProperty('type', 'market');
            expect(sentMessage.assets_ids).toContain('token123');
            expect(sentMessage.assets_ids).toContain('token456');
        });

        test('_sendSubscriptions sends correct { assets_ids, operation: "subscribe" } format', () => {
            // Simulate connected state
            client.ws = mockWsInstance;
            client.isConnected = true;

            // Call sendSubscriptions
            client._sendSubscriptions('token789', ['book', 'price_change']);

            // Verify the message format
            expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
            const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
            expect(sentMessage).toEqual({
                assets_ids: ['token789'],
                operation: 'subscribe'
            });
        });

        test('unsubscribe sends correct { assets_ids, operation: "unsubscribe" } format', () => {
            // Setup subscription first
            client.subscriptions.set('token999', new Set(['book']));

            // Simulate connected state
            client.ws = mockWsInstance;
            client.isConnected = true;

            // Call unsubscribe
            client.unsubscribe('token999');

            // Verify the message format
            expect(mockWsInstance.send).toHaveBeenCalledTimes(1);
            const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0]);
            expect(sentMessage).toEqual({
                assets_ids: ['token999'],
                operation: 'unsubscribe'
            });

            // Verify subscription was removed
            expect(client.subscriptions.has('token999')).toBe(false);
        });

        test('_resubscribeAll does nothing if no subscriptions', () => {
            client.ws = mockWsInstance;
            client.isConnected = true;

            client._resubscribeAll();

            expect(mockWsInstance.send).not.toHaveBeenCalled();
        });
    });

    describe('Event emission', () => {
        test('emits "book" event for book messages with event_type field', () => {
            const handler = jest.fn();
            client.on('book', handler);

            const bookData = {
                event_type: 'book',
                asset_id: 'token123',
                bids: [[0.5, 100]],
                asks: [[0.6, 100]]
            };

            client._handleMessage({ data: JSON.stringify(bookData) });

            expect(handler).toHaveBeenCalledWith(bookData);
        });

        test('emits "book" event for book messages with type field', () => {
            const handler = jest.fn();
            client.on('book', handler);

            const bookData = {
                type: 'book',
                asset_id: 'token123',
                bids: [[0.5, 100]],
                asks: [[0.6, 100]]
            };

            client._handleMessage({ data: JSON.stringify(bookData) });

            expect(handler).toHaveBeenCalledWith(bookData);
        });

        test('emits "price_change" event for price_change messages', () => {
            const handler = jest.fn();
            client.on('price_change', handler);

            const priceData = {
                event_type: 'price_change',
                asset_id: 'token123',
                price: 0.65,
                change_percent: 5.5
            };

            client._handleMessage({ data: JSON.stringify(priceData) });

            expect(handler).toHaveBeenCalledWith(priceData);
        });

        test('emits "last_trade_price" event for trade messages', () => {
            const handler = jest.fn();
            client.on('last_trade_price', handler);

            const tradeData = {
                event_type: 'last_trade_price',
                asset_id: 'token123',
                price: 0.70,
                size: 500
            };

            client._handleMessage({ data: JSON.stringify(tradeData) });

            expect(handler).toHaveBeenCalledWith(tradeData);
        });

        test('emits "tick_size_change" event for tick size messages', () => {
            const handler = jest.fn();
            client.on('tick_size_change', handler);

            const tickData = {
                event_type: 'tick_size_change',
                asset_id: 'token123',
                tick_size: 0.01
            };

            client._handleMessage({ data: JSON.stringify(tickData) });

            expect(handler).toHaveBeenCalledWith(tickData);
        });

        test('emits "message" event for unknown message types', () => {
            const handler = jest.fn();
            client.on('message', handler);

            const unknownData = {
                event_type: 'unknown_type',
                data: 'some data'
            };

            client._handleMessage({ data: JSON.stringify(unknownData) });

            expect(handler).toHaveBeenCalledWith(unknownData);
        });
    });

    describe('Error handling', () => {
        test('silently ignores non-JSON messages like "INVALID OPERATION"', () => {
            const errorHandler = jest.fn();
            client.on('error', errorHandler);

            // This should not throw or emit error
            client._handleMessage({ data: 'INVALID OPERATION' });

            expect(errorHandler).not.toHaveBeenCalled();
        });

        test('silently ignores plain text messages', () => {
            const errorHandler = jest.fn();
            client.on('error', errorHandler);

            client._handleMessage({ data: 'Connected successfully' });
            client._handleMessage({ data: 'PONG' });
            client._handleMessage({ data: 'ERROR: rate limited' });

            expect(errorHandler).not.toHaveBeenCalled();
        });

        test('emits error for malformed JSON that looks like JSON', () => {
            const errorHandler = jest.fn();
            client.on('error', errorHandler);

            // This looks like JSON but is malformed
            client._handleMessage({ data: '{invalid json' });

            expect(errorHandler).toHaveBeenCalled();
            expect(errorHandler.mock.calls[0][0].message).toContain('Failed to parse');
        });

        test('emits error for malformed JSON arrays', () => {
            const errorHandler = jest.fn();
            client.on('error', errorHandler);

            client._handleMessage({ data: '[invalid array' });

            expect(errorHandler).toHaveBeenCalled();
        });
    });

    describe('Subscription management', () => {
        test('subscribe stores subscription before connecting', () => {
            client.subscribe('token111', ['book', 'price_change']);

            expect(client.subscriptions.has('token111')).toBe(true);
            expect(client.subscriptions.get('token111')).toContain('book');
            expect(client.subscriptions.get('token111')).toContain('price_change');
        });

        test('subscribe validates event types', () => {
            expect(() => {
                client.subscribe('token111', ['invalid_event']);
            }).toThrow('Invalid events');
        });

        test('subscribe requires assetId', () => {
            expect(() => {
                client.subscribe('', ['book']);
            }).toThrow('assetId is required');
        });

        test('unsubscribe requires assetId', () => {
            expect(() => {
                client.unsubscribe('');
            }).toThrow('assetId is required');
        });

        test('getSubscriptions returns current subscriptions', () => {
            client.subscribe('token111', ['book']);
            client.subscribe('token222', ['price_change', 'last_trade_price']);

            const subs = client.getSubscriptions();

            expect(subs['token111']).toContain('book');
            expect(subs['token222']).toContain('price_change');
            expect(subs['token222']).toContain('last_trade_price');
        });
    });

    describe('Connection state', () => {
        test('isConnectedStatus returns correct state', () => {
            expect(client.isConnectedStatus()).toBe(false);

            client.isConnected = true;
            expect(client.isConnectedStatus()).toBe(true);
        });

        test('disconnect sets isConnected to false', () => {
            client.ws = mockWsInstance;
            client.isConnected = true;

            client.disconnect();

            expect(client.isConnected).toBe(false);
            expect(mockWsInstance.close).toHaveBeenCalled();
        });

        test('disconnect emits disconnected event', () => {
            const handler = jest.fn();
            client.on('disconnected', handler);

            client.ws = mockWsInstance;
            client.isConnected = true;

            client.disconnect();

            expect(handler).toHaveBeenCalled();
        });
    });
});
