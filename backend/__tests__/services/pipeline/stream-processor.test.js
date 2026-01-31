// Tests for Stream Processor

const EventEmitter = require('events');

// Mock the clobWebSocketClient
const mockClobClient = new EventEmitter();
mockClobClient.connect = jest.fn().mockResolvedValue();
mockClobClient.disconnect = jest.fn();
mockClobClient.subscribe = jest.fn();
mockClobClient.unsubscribe = jest.fn();

jest.mock('../../../services/polymarket/clob-websocket', () => ({
    clobWebSocketClient: mockClobClient,
    ClobWebSocketClient: jest.fn()
}));

// Mock walletTracker
const mockWalletTracker = {
    trackTrade: jest.fn().mockResolvedValue({}),
    getWalletProfile: jest.fn().mockResolvedValue({
        firstTradeAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        totalTrades: 100
    })
};

jest.mock('../../../services/wallet/tracker', () => ({
    walletTracker: mockWalletTracker
}));

// Mock liquidityTracker
const mockLiquidityTracker = {
    recordSnapshot: jest.fn().mockResolvedValue(),
    calculateLiquidityChange: jest.fn().mockResolvedValue(null),
    detectLiquidityDrop: jest.fn().mockResolvedValue(false)
};

jest.mock('../../../services/orderbook/liquidity-tracker', () => ({
    liquidityTracker: mockLiquidityTracker
}));

// Mock database
const mockDb = {
    tradeHistory: {
        record: jest.fn().mockResolvedValue({}),
        getByMarket: jest.fn().mockResolvedValue([])
    },
    detectedPatterns: {
        record: jest.fn().mockResolvedValue({})
    },
    events: {
        getAll: jest.fn().mockResolvedValue([])
    }
};

jest.mock('../../../db', () => mockDb);

// Mock config
jest.mock('../../../config', () => ({
    realtime: {
        enabled: true,
        reconnectAttempts: 3,
        reconnectDelayMs: 1000,
        heartbeatIntervalMs: 30000
    },
    signals: {
        freshWallet: { weight: 0.15, maxAgeDays: 7, maxTrades: 10, minTradeSize: 0.02 },
        liquidityImpact: { weight: 0.12, threshold: 0.02 },
        walletAccuracy: { weight: 0.18, minWinRate: 0.7, minResolvedPositions: 20 },
        timingPattern: { weight: 0.14, windowHours: 48, concentrationThreshold: 2 },
        sniperCluster: { weight: 0.16, windowMinutes: 5, minWallets: 3 }
    }
}));

// Mock signal processors
jest.mock('../../../services/signals/processors/fresh-wallet', () => ({
    freshWalletProcessor: {
        name: 'fresh-wallet',
        weight: 0.15,
        process: jest.fn().mockResolvedValue({ detected: false })
    }
}));

jest.mock('../../../services/signals/processors/liquidity-impact', () => ({
    liquidityImpactProcessor: {
        name: 'liquidity-impact',
        weight: 0.12,
        process: jest.fn().mockResolvedValue({ detected: false })
    }
}));

jest.mock('../../../services/signals/processors/wallet-accuracy', () => ({
    walletAccuracyProcessor: {
        name: 'wallet-accuracy',
        weight: 0.18,
        process: jest.fn().mockResolvedValue({ detected: false })
    }
}));

jest.mock('../../../services/signals/processors/timing-pattern', () => ({
    timingPatternProcessor: {
        name: 'timing-pattern',
        weight: 0.14,
        process: jest.fn().mockResolvedValue({ detected: false })
    }
}));

jest.mock('../../../services/signals/processors/sniper-cluster', () => ({
    sniperClusterProcessor: {
        name: 'sniper-cluster',
        weight: 0.16,
        process: jest.fn().mockResolvedValue({ detected: false })
    }
}));

const { StreamProcessor } = require('../../../services/pipeline/stream-processor');

describe('StreamProcessor', () => {
    let processor;

    beforeEach(() => {
        jest.clearAllMocks();
        processor = new StreamProcessor();
    });

    afterEach(() => {
        processor.stop();
    });

    describe('Trade data normalization', () => {
        test('normalizes asset_id to tokenId', () => {
            const rawTrade = {
                asset_id: 'token-from-asset-id',
                price: 0.65,
                size: 100
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.tokenId).toBe('token-from-asset-id');
        });

        test('normalizes assetId to tokenId', () => {
            const rawTrade = {
                assetId: 'token-from-assetId',
                price: 0.65,
                size: 100
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.tokenId).toBe('token-from-assetId');
        });

        test('normalizes market to tokenId', () => {
            const rawTrade = {
                market: 'token-from-market',
                price: 0.65,
                size: 100
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.tokenId).toBe('token-from-market');
        });

        test('normalizes last_price to price', () => {
            const rawTrade = {
                tokenId: 'token-123',
                last_price: '0.72',
                size: 100
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.price).toBe(0.72);
        });

        test('normalizes amount to size', () => {
            const rawTrade = {
                tokenId: 'token-123',
                price: 0.65,
                amount: 250
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.size).toBe(250);
        });

        test('normalizes quantity to size', () => {
            const rawTrade = {
                tokenId: 'token-123',
                price: 0.65,
                quantity: 300
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.size).toBe(300);
        });

        test('normalizes is_buy boolean to side BUY', () => {
            const rawTrade = {
                tokenId: 'token-123',
                price: 0.65,
                size: 100,
                is_buy: true
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.side).toBe('BUY');
        });

        test('normalizes is_buy false to side SELL', () => {
            const rawTrade = {
                tokenId: 'token-123',
                price: 0.65,
                size: 100,
                is_buy: false
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.side).toBe('SELL');
        });

        test('normalizes isBuy boolean to side', () => {
            const rawTrade = {
                tokenId: 'token-123',
                price: 0.65,
                size: 100,
                isBuy: true
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.side).toBe('BUY');
        });

        test('normalizes wallet addresses to lowercase', () => {
            const rawTrade = {
                tokenId: 'token-123',
                price: 0.65,
                size: 100,
                maker: '0xABC123DEF456',
                taker: '0xGHI789JKL012'
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.maker).toBe('0xabc123def456');
            expect(normalized.taker).toBe('0xghi789jkl012');
        });

        test('normalizes maker_address to maker', () => {
            const rawTrade = {
                tokenId: 'token-123',
                price: 0.65,
                size: 100,
                maker_address: '0xMAKER_ADDRESS'
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.maker).toBe('0xmaker_address');
        });

        test('normalizes taker_address to taker', () => {
            const rawTrade = {
                tokenId: 'token-123',
                price: 0.65,
                size: 100,
                taker_address: '0xTAKER_ADDRESS'
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.taker).toBe('0xtaker_address');
        });

        test('generates ID if not present', () => {
            const rawTrade = {
                tokenId: 'token-123',
                price: 0.65,
                size: 100
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.id).toBeDefined();
            expect(normalized.id).toMatch(/^trade_\d+_[a-z0-9]+$/);
        });

        test('uses trade_id if present', () => {
            const rawTrade = {
                trade_id: 'my-trade-id',
                tokenId: 'token-123',
                price: 0.65,
                size: 100
            };

            const normalized = processor._normalizeTradeData(rawTrade);

            expect(normalized.id).toBe('my-trade-id');
        });
    });

    describe('Event routing', () => {
        test('routes last_trade_price events to processTrade', async () => {
            const processTradesSpy = jest.spyOn(processor, 'processTrade');

            // Setup handlers
            processor._setupEventHandlers();

            // Emit a trade event
            const tradeData = {
                event_type: 'last_trade_price',
                asset_id: 'token-123',
                price: 0.70,
                size: 500
            };

            mockClobClient.emit('last_trade_price', tradeData);

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(processTradesSpy).toHaveBeenCalledWith(tradeData);
        });

        test('routes book events to processOrderBookUpdate', async () => {
            const processOrderBookSpy = jest.spyOn(processor, 'processOrderBookUpdate');

            // Setup handlers
            processor._setupEventHandlers();

            // Emit a book event
            const bookData = {
                event_type: 'book',
                asset_id: 'token-456',
                bids: [[0.5, 100]],
                asks: [[0.6, 100]]
            };

            mockClobClient.emit('book', bookData);

            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(processOrderBookSpy).toHaveBeenCalledWith('token-456', bookData);
        });

        test('emits signal event when processor detects anomaly', async () => {
            const signalHandler = jest.fn();
            processor.on('signal', signalHandler);

            // Mock fresh-wallet processor to detect something
            const freshWalletProcessor = require('../../../services/signals/processors/fresh-wallet').freshWalletProcessor;
            freshWalletProcessor.process.mockResolvedValueOnce({
                detected: true,
                confidence: 0.8,
                direction: 'YES',
                severity: 'HIGH',
                metadata: { walletAge: 1, tradeSize: 500 }
            });

            // Process a trade
            await processor.processTrade({
                asset_id: 'token-123',
                price: 0.65,
                size: 500,
                maker: '0xfreshwallet'
            });

            expect(signalHandler).toHaveBeenCalled();
            const emittedSignal = signalHandler.mock.calls[0][0];
            expect(emittedSignal.signal.detected).toBe(true);
            expect(emittedSignal.signal.processorName).toBe('fresh-wallet');
        });

        test('emits trade event when processing trade', async () => {
            const tradeHandler = jest.fn();
            processor.on('trade', tradeHandler);

            await processor.processTrade({
                asset_id: 'token-123',
                price: 0.65,
                size: 500,
                maker: '0xtrader'
            });

            expect(tradeHandler).toHaveBeenCalled();
            expect(tradeHandler.mock.calls[0][0].tokenId).toBe('token-123');
        });
    });

    describe('Status tracking', () => {
        test('getStatus returns correct status', () => {
            const status = processor.getStatus();

            expect(status).toHaveProperty('running', false);
            expect(status).toHaveProperty('subscriptionCount', 0);
            expect(status).toHaveProperty('processedTrades', 0);
            expect(status).toHaveProperty('detectedSignals', 0);
            expect(status).toHaveProperty('processors');
            expect(status.processors.length).toBeGreaterThan(0);
        });

        test('processedTrades counter increments on trade processing', async () => {
            expect(processor.processedTrades).toBe(0);

            await processor.processTrade({
                asset_id: 'token-123',
                price: 0.65,
                size: 500,
                maker: '0xtrader'
            });

            expect(processor.processedTrades).toBe(1);
        });

        test('detectedSignals counter increments on detection', async () => {
            expect(processor.detectedSignals).toBe(0);

            // Mock processor to detect
            const freshWalletProcessor = require('../../../services/signals/processors/fresh-wallet').freshWalletProcessor;
            freshWalletProcessor.process.mockResolvedValueOnce({
                detected: true,
                confidence: 0.8,
                direction: 'YES',
                severity: 'HIGH',
                metadata: {}
            });

            await processor.processTrade({
                asset_id: 'token-123',
                price: 0.65,
                size: 500,
                maker: '0xfreshwallet'
            });

            expect(processor.detectedSignals).toBe(1);
        });
    });

    describe('Market subscription', () => {
        test('subscribeToMarket calls WebSocket subscribe', () => {
            processor.subscribeToMarket('token-123');

            expect(mockClobClient.subscribe).toHaveBeenCalledWith(
                'token-123',
                ['book', 'price_change', 'last_trade_price']
            );
        });

        test('subscribeToMarket tracks subscription', () => {
            processor.subscribeToMarket('token-123');

            expect(processor.subscriptions.has('token-123')).toBe(true);
        });

        test('unsubscribeFromMarket calls WebSocket unsubscribe', () => {
            processor.subscriptions.set('token-123', { events: ['book'] });

            processor.unsubscribeFromMarket('token-123');

            expect(mockClobClient.unsubscribe).toHaveBeenCalledWith('token-123');
        });

        test('unsubscribeFromMarket removes tracking', () => {
            processor.subscriptions.set('token-123', { events: ['book'] });

            processor.unsubscribeFromMarket('token-123');

            expect(processor.subscriptions.has('token-123')).toBe(false);
        });
    });
});
