/**
 * Stream Processor
 * Real-time orchestration component that ties together WebSocket events,
 * signal processors, wallet tracking, and liquidity monitoring.
 */

const EventEmitter = require('events');
const { clobWebSocketClient } = require('../polymarket/clob-websocket');
const { walletTracker } = require('../wallet/tracker');
const { liquidityTracker } = require('../orderbook/liquidity-tracker');
const { orderBookManager } = require('../orderbook/order-book-manager');
const db = require('../../db');
const config = require('../../config');

// Import all signal processors
const { freshWalletProcessor } = require('../signals/processors/fresh-wallet');
const { liquidityImpactProcessor } = require('../signals/processors/liquidity-impact');
const { walletAccuracyProcessor } = require('../signals/processors/wallet-accuracy');
const { timingPatternProcessor } = require('../signals/processors/timing-pattern');
const { sniperClusterProcessor } = require('../signals/processors/sniper-cluster');

/**
 * StreamProcessor orchestrates real-time data processing for insider trading detection.
 * It connects to the Polymarket WebSocket, processes trades and orderbook updates,
 * and runs signal processors to detect suspicious patterns.
 */
class StreamProcessor extends EventEmitter {
    constructor() {
        super();

        // Initialize state
        this.running = false;
        this.subscriptions = new Map(); // tokenId -> subscription info
        this.processors = [
            freshWalletProcessor,
            liquidityImpactProcessor,
            walletAccuracyProcessor,
            timingPatternProcessor,
            sniperClusterProcessor
        ];

        // Statistics
        this.processedTrades = 0;
        this.detectedSignals = 0;
        this.startTime = null;

        // Load config
        this.realtimeConfig = config.realtime;
    }

    /**
     * Start the stream processor
     * Connects to WebSocket and sets up event handlers
     * @returns {Promise<void>}
     */
    async start() {
        // Return early if realtime is not enabled
        if (!this.realtimeConfig.enabled) {
            console.log('StreamProcessor: Realtime processing is disabled in config');
            return;
        }

        if (this.running) {
            console.log('StreamProcessor: Already running');
            return;
        }

        try {
            // Set up event handlers first so we catch any errors during connect
            this._setupEventHandlers();

            // Connect to WebSocket
            await clobWebSocketClient.connect();

            // Subscribe to active markets
            await this._subscribeToActiveMarkets();

            // Update state
            this.running = true;
            this.startTime = Date.now();

            this.emit('started');
            console.log('StreamProcessor: Started successfully');
        } catch (error) {
            // Log but don't throw - allow server to continue without real-time features
            console.error('StreamProcessor: Failed to start -', error.message || error);
            this.emit('error', error);
            // Don't throw - server should continue running without real-time
        }
    }

    /**
     * Stop the stream processor
     * Disconnects WebSocket and clears subscriptions
     */
    stop() {
        if (!this.running) {
            return;
        }

        // Disconnect WebSocket
        clobWebSocketClient.disconnect();

        // Clear subscriptions
        this.subscriptions.clear();

        // Update state
        this.running = false;

        this.emit('stopped');
        console.log('StreamProcessor: Stopped');
    }

    /**
     * Subscribe to a specific market
     * @param {string} tokenId - The market/token ID to subscribe to
     */
    subscribeToMarket(tokenId) {
        if (!tokenId) {
            throw new Error('tokenId is required');
        }

        // Subscribe via WebSocket client
        clobWebSocketClient.subscribe(tokenId, ['book', 'price_change', 'last_trade_price']);

        // Track subscription
        this.subscriptions.set(tokenId, {
            subscribedAt: new Date().toISOString(),
            events: ['book', 'price_change', 'last_trade_price']
        });

        console.log(`StreamProcessor: Subscribed to market ${tokenId}`);
    }

    /**
     * Unsubscribe from a specific market
     * @param {string} tokenId - The market/token ID to unsubscribe from
     */
    unsubscribeFromMarket(tokenId) {
        if (!tokenId) {
            throw new Error('tokenId is required');
        }

        // Unsubscribe via WebSocket client
        clobWebSocketClient.unsubscribe(tokenId);

        // Remove from subscriptions
        this.subscriptions.delete(tokenId);

        console.log(`StreamProcessor: Unsubscribed from market ${tokenId}`);
    }

    /**
     * Process a trade event
     * Records trade, tracks wallet, runs signal processors
     * @param {Object} tradeData - Trade data from WebSocket
     */
    async processTrade(tradeData) {
        try {
            // Extract trade info
            const trade = this._normalizeTradeData(tradeData);

            // Record trade in database
            await db.tradeHistory.record(trade);

            // Track wallet activity (returns null if no wallet address)
            await walletTracker.trackTrade(trade);

            // Emit trade event
            this.emit('trade', trade);

            // Get market info for signal processing
            const market = await this._getMarketInfo(trade.tokenId);
            const event = await this._getEventInfo(trade.tokenId);

            // Run all signal processors against the trade
            for (const processor of this.processors) {
                try {
                    const signal = await processor.process(event, market, trade);

                    if (signal.detected) {
                        this.detectedSignals++;

                        // Emit signal event
                        this.emit('signal', {
                            signal: {
                                ...signal,
                                processorName: processor.name,
                                weight: processor.weight
                            },
                            trade,
                            market
                        });

                        // Record detected pattern in database
                        await db.detectedPatterns.record({
                            type: processor.name,
                            eventId: event?.id || trade.tokenId,
                            tokenId: trade.tokenId,
                            confidence: signal.confidence,
                            direction: signal.direction,
                            severity: signal.severity,
                            metadata: signal.metadata,
                            tradeId: trade.id
                        });
                    }
                } catch (processorError) {
                    console.error(`StreamProcessor: Error in processor ${processor.name}:`, processorError.message);
                }
            }

            this.processedTrades++;
        } catch (error) {
            this.emit('error', error);
            console.error('StreamProcessor: Error processing trade:', error.message);
        }
    }

    /**
     * Process an orderbook update
     * Records snapshot and detects liquidity changes
     * @param {string} tokenId - The market/token ID
     * @param {Object} orderbook - Orderbook data with bids and asks
     */
    async processOrderBookUpdate(tokenId, orderbook) {
        try {
            // Record snapshot
            await liquidityTracker.recordSnapshot(tokenId, orderbook);

            // Detect liquidity changes
            const liquidityChange = await liquidityTracker.calculateLiquidityChange(tokenId);

            if (liquidityChange) {
                // Check for significant liquidity drop (potential insider preparation)
                const significantDrop = await liquidityTracker.detectLiquidityDrop(tokenId);

                if (significantDrop) {
                    // Get market and event info
                    const market = await this._getMarketInfo(tokenId);
                    const event = await this._getEventInfo(tokenId);

                    // Run liquidity-related signal processor
                    const signal = await liquidityImpactProcessor.process(
                        event,
                        market,
                        { tokenId, size: Math.abs(liquidityChange.totalChange), side: liquidityChange.totalChange < 0 ? 'SELL' : 'BUY' },
                        orderbook
                    );

                    if (signal.detected) {
                        this.detectedSignals++;

                        this.emit('signal', {
                            signal: {
                                ...signal,
                                processorName: 'liquidity-change',
                                weight: liquidityImpactProcessor.weight
                            },
                            trade: null,
                            market,
                            liquidityChange
                        });

                        await db.detectedPatterns.record({
                            type: 'liquidity-change',
                            eventId: event?.id || tokenId,
                            tokenId,
                            confidence: signal.confidence,
                            direction: signal.direction,
                            severity: signal.severity,
                            metadata: {
                                ...signal.metadata,
                                liquidityChange
                            }
                        });
                    }
                }
            }
        } catch (error) {
            this.emit('error', error);
            console.error('StreamProcessor: Error processing orderbook update:', error.message);
        }
    }

    /**
     * Get current processor status
     * @returns {Object} Status information
     */
    getStatus() {
        const uptime = this.startTime ? Date.now() - this.startTime : 0;

        return {
            running: this.running,
            subscriptionCount: this.subscriptions.size,
            processedTrades: this.processedTrades,
            detectedSignals: this.detectedSignals,
            uptime,
            uptimeFormatted: this._formatUptime(uptime),
            processors: this.processors.map(p => ({
                name: p.name,
                weight: p.weight
            })),
            realtimeEnabled: this.realtimeConfig.enabled,
            orderBooks: orderBookManager.getStatus()
        };
    }

    /**
     * Set up WebSocket event handlers
     * @private
     */
    _setupEventHandlers() {
        // Handle trade events
        clobWebSocketClient.on('last_trade_price', async (data) => {
            await this.processTrade(data);
        });

        // Handle orderbook updates
        clobWebSocketClient.on('book', async (data) => {
            // Update in-memory order book
            orderBookManager.handleBookSnapshot(data);

            const tokenId = data.asset_id || data.assetId || data.market;
            if (tokenId) {
                await this.processOrderBookUpdate(tokenId, data);
            }
        });

        // Handle price changes (can indicate significant activity)
        clobWebSocketClient.on('price_change', async (data) => {
            // Update in-memory order book with incremental changes
            orderBookManager.handlePriceChange(data);

            // Price changes are informational, may trigger analysis
            // Handle both single object and array formats
            const changes = Array.isArray(data) ? data : [data];
            for (const change of changes) {
                const tokenId = change.asset_id || change.assetId || change.market;
                if (tokenId && Math.abs(change.change_percent || change.changePercent || 0) > 5) {
                    // Significant price change - log for monitoring
                    console.log(`StreamProcessor: Significant price change on ${tokenId}: ${change.change_percent || change.changePercent}%`);
                }
            }
        });

        // Handle WebSocket errors
        clobWebSocketClient.on('error', (error) => {
            this.emit('error', error);
        });

        // Handle disconnection
        clobWebSocketClient.on('disconnected', () => {
            console.log('StreamProcessor: WebSocket disconnected');
            // Clear order books on disconnect (will be re-initialized on reconnect)
            orderBookManager.clearAll();
        });

        // Handle reconnection
        clobWebSocketClient.on('connected', () => {
            console.log('StreamProcessor: WebSocket reconnected');
        });
    }

    /**
     * Subscribe to active markets
     * @private
     */
    async _subscribeToActiveMarkets() {
        try {
            // Get active events from database
            const activeEvents = await db.events.getAll({ limit: 100, resolved: false });

            // If no events in DB, fetch top markets from Polymarket API
            if (activeEvents.length === 0) {
                const polymarket = require('../polymarket/client');
                const markets = await polymarket.fetchMarkets({ limit: 100 });

                for (const market of markets) {
                    await this._subscribeToMarketTokens(market.rawData?.clobTokenIds, market.id);
                }
                console.log(`StreamProcessor: Auto-subscribed to ${this.subscriptions.size} markets from API`);
                return;
            }

            // Subscribe to events from database
            for (const event of activeEvents) {
                // Extract clobTokenIds from rawData (where sync stores it)
                await this._subscribeToMarketTokens(event.rawData?.clobTokenIds, event.id);
            }

            console.log(`StreamProcessor: Subscribed to ${this.subscriptions.size} markets from DB`);
        } catch (error) {
            console.error('StreamProcessor: Error subscribing to active markets:', error.message);
        }
    }

    /**
     * Helper to subscribe to market tokens and optionally generate article
     * @param {string|Array} clobTokenIds - Token IDs (may be JSON string or array)
     * @param {string} eventId - Event ID for article generation
     * @private
     */
    async _subscribeToMarketTokens(clobTokenIds, eventId) {
        // Parse if it's a JSON string
        if (typeof clobTokenIds === 'string') {
            try {
                clobTokenIds = JSON.parse(clobTokenIds);
            } catch {
                return;
            }
        }

        if (!Array.isArray(clobTokenIds)) {
            return;
        }

        for (const tokenId of clobTokenIds) {
            // Only subscribe if not already subscribed
            if (!this.subscriptions.has(tokenId)) {
                this.subscribeToMarket(tokenId);
            }
        }

        // Generate article for this event if it doesn't exist
        if (eventId) {
            await this._ensureArticleExists(eventId);
        }
    }

    /**
     * Ensure an article exists for a given event
     * @param {string} eventId - Event ID
     * @private
     */
    async _ensureArticleExists(eventId) {
        try {
            const existingArticle = await db.articles.getByEventId(eventId);
            if (existingArticle) {
                return; // Article already exists
            }

            const event = await db.events.getById(eventId);
            if (!event) {
                return; // Event not found
            }

            const articleGenerator = require('../article/generator');
            const prediction = await db.predictions.getLatestByEventId(eventId);
            await articleGenerator.createArticle(event, prediction);
            console.log(`StreamProcessor: Generated article for event ${eventId}`);
        } catch (error) {
            console.error(`StreamProcessor: Failed to generate article for event ${eventId}:`, error.message);
        }
    }

    /**
     * Normalize trade data from different WebSocket message formats
     * @param {Object} data - Raw trade data
     * @returns {Object} Normalized trade object
     * @private
     */
    _normalizeTradeData(data) {
        return {
            id: data.id || data.trade_id || `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            tokenId: data.asset_id || data.assetId || data.market || data.token_id || data.tokenId,
            price: parseFloat(data.price || data.last_price || data.lastPrice || 0),
            size: parseFloat(data.size || data.amount || data.quantity || 0),
            side: data.side || (data.is_buy || data.isBuy ? 'BUY' : 'SELL'),
            maker: (data.maker || data.maker_address || '').toLowerCase(),
            taker: (data.taker || data.taker_address || '').toLowerCase(),
            timestamp: data.timestamp || data.created_at || data.createdAt || new Date().toISOString()
        };
    }

    /**
     * Get market info for a token
     * @param {string} tokenId - Token ID
     * @returns {Promise<Object>} Market info
     * @private
     */
    async _getMarketInfo(tokenId) {
        // Try to get from events database
        const events = await db.events.getAll({ limit: 100, resolved: false });

        for (const event of events) {
            if (event.markets) {
                for (const market of event.markets) {
                    if (market.clobTokenIds && market.clobTokenIds.includes(tokenId)) {
                        return {
                            id: market.id,
                            question: market.question,
                            liquidity: market.liquidity || 0,
                            volume: market.volume || 0,
                            outcomePrices: market.outcomePrices
                        };
                    }
                }
            }
        }

        // Return minimal market info if not found
        return {
            id: tokenId,
            liquidity: 0,
            volume: 0
        };
    }

    /**
     * Get event info for a token
     * @param {string} tokenId - Token ID
     * @returns {Promise<Object|null>} Event info
     * @private
     */
    async _getEventInfo(tokenId) {
        const events = await db.events.getAll({ limit: 100, resolved: false });

        for (const event of events) {
            if (event.markets) {
                for (const market of event.markets) {
                    if (market.clobTokenIds && market.clobTokenIds.includes(tokenId)) {
                        return event;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Format uptime in human-readable format
     * @param {number} ms - Uptime in milliseconds
     * @returns {string} Formatted uptime
     * @private
     */
    _formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        }
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        }
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    }
}

// Create singleton instance
const streamProcessor = new StreamProcessor();

/**
 * Generate fake anomalous patterns for testing the dev panel.
 * These patterns are designed to be clearly suspicious.
 */
function startFakePatternGenerator() {
    const PATTERN_TYPES = ['liquidity-impact', 'wallet-accuracy', 'timing-pattern', 'sniper-cluster'];
    const SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'];
    const DIRECTIONS = ['YES', 'NO'];

    function randomChoice(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function randomWallet() {
        return '0x' + Array.from({ length: 40 }, () =>
            Math.floor(Math.random() * 16).toString(16)
        ).join('');
    }

    function generateFakePattern() {
        const type = randomChoice(PATTERN_TYPES);
        const severity = randomChoice(SEVERITIES);
        const direction = randomChoice(DIRECTIONS);
        const confidence = 0.7 + Math.random() * 0.25; // 70-95% confidence (suspicious)

        let metadata = {};

        switch (type) {
            case 'liquidity-impact':
                // Large trade consuming significant orderbook depth
                metadata = {
                    liquidityPercent: (15 + Math.random() * 35).toFixed(2) + '%', // 15-50% of liquidity
                    tradeSize: Math.floor(10000 + Math.random() * 90000), // $10k-$100k
                    priceImpact: (2 + Math.random() * 8).toFixed(2) + '%',
                    address: randomWallet()
                };
                break;

            case 'wallet-accuracy':
                // Wallet with improbably high win rate
                metadata = {
                    winRate: 0.85 + Math.random() * 0.14, // 85-99% win rate
                    totalTrades: Math.floor(15 + Math.random() * 50), // 15-65 trades
                    profitUsd: Math.floor(5000 + Math.random() * 95000),
                    avgTradeSize: Math.floor(1000 + Math.random() * 9000),
                    address: randomWallet()
                };
                break;

            case 'timing-pattern':
                // Unusual trade concentration before resolution
                metadata = {
                    hoursBeforeResolution: (0.5 + Math.random() * 4).toFixed(1), // 0.5-4.5 hours
                    tradeCount: Math.floor(5 + Math.random() * 20),
                    volumeSpike: (3 + Math.random() * 7).toFixed(1) + 'x', // 3-10x normal
                    address: randomWallet()
                };
                break;

            case 'sniper-cluster':
                // Coordinated trading from multiple wallets
                metadata = {
                    walletCount: Math.floor(3 + Math.random() * 8), // 3-10 wallets
                    timeWindow: Math.floor(30 + Math.random() * 90), // 30-120 seconds
                    totalVolume: Math.floor(25000 + Math.random() * 75000),
                    similarityScore: (0.85 + Math.random() * 0.14).toFixed(2)
                };
                break;
        }

        return {
            type,
            eventId: 'test-event-' + Math.floor(Math.random() * 1000),
            tokenId: 'test-token-' + Math.floor(Math.random() * 1000),
            confidence,
            direction,
            severity,
            metadata
        };
    }

    // Generate a fake pattern every 5 seconds
    const interval = setInterval(async () => {
        const pattern = generateFakePattern();
        await db.detectedPatterns.record(pattern);
        streamProcessor.detectedSignals++;
        // Simulate processing 10-50 trades that led to this pattern detection
        streamProcessor.processedTrades += Math.floor(10 + Math.random() * 40);
        console.log(`[FakePatternGenerator] Created ${pattern.type} pattern (${pattern.severity})`);
    }, 5000);

    // Mark the processor as running for the status endpoint
    streamProcessor.running = true;
    streamProcessor.startTime = Date.now();

    console.log('FakePatternGenerator: Started - generating anomalous patterns every 5 seconds');

    return interval;
}

// Disabled: Fake pattern generator prevents real WebSocket from starting
// const fakeGeneratorInterval = startFakePatternGenerator();

// Export both class and singleton instance
module.exports = {
    StreamProcessor,
    streamProcessor,
    startFakePatternGenerator
};
