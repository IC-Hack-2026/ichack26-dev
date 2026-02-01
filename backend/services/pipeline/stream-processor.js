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
const { WhaleDetector } = require('../orderbook/whale-detector');
const { probabilityAdjuster } = require('../orderbook/probability-adjuster');
const { assetRegistry } = require('../orderbook/asset-registry');
const db = require('../../db');
const config = require('../../config');

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

        // Initialize whale detector
        this.whaleDetector = new WhaleDetector(orderBookManager);

        // Statistics
        this.processedTrades = 0;
        this.detectedWhaleTrades = 0;
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

            this.processedTrades++;
        } catch (error) {
            this.emit('error', error);
            console.error('StreamProcessor: Error processing trade:', error.message);
        }
    }

    /**
     * Process an orderbook update
     * Records snapshot for liquidity tracking
     * @param {string} tokenId - The market/token ID
     * @param {Object} orderbook - Orderbook data with bids and asks
     */
    async processOrderBookUpdate(tokenId, orderbook) {
        try {
            // Record snapshot
            await liquidityTracker.recordSnapshot(tokenId, orderbook);
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
            detectedWhaleTrades: this.detectedWhaleTrades,
            uptime,
            uptimeFormatted: this._formatUptime(uptime),
            whaleDetector: {
                config: this.whaleDetector.getConfig()
            },
            probabilityAdjuster: {
                config: probabilityAdjuster.getConfig(),
                activeSignals: probabilityAdjuster.getAllSignals().length
            },
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

            // Whale detection
            const whaleResult = this.whaleDetector.analyzeTrade(data);
            if (whaleResult) {
                this.detectedWhaleTrades++;

                // Record whale trade in database
                await db.whaleTrades.record(whaleResult);

                // Update probability adjuster with whale signal
                probabilityAdjuster.recordWhaleTrade(whaleResult);

                // Update article probability for affected event
                const event = await this._getEventInfo(whaleResult.assetId);
                if (event && event.id) {
                    const baseProbability = this._extractBaseProbability(event);
                    if (baseProbability !== null) {
                        const adjustedProbability = probabilityAdjuster.getAdjustedProbability(
                            whaleResult.assetId,
                            baseProbability
                        );
                        await db.articles.updateProbability(event.id, adjustedProbability);
                    }
                }

                // Emit whale trade event
                this.emit('whale-trade', whaleResult);

                // Get asset metadata for human-readable context
                const assetMeta = assetRegistry.get(whaleResult.assetId);
                const contextPrefix = assetMeta && assetMeta.eventTitle
                    ? `"${assetMeta.eventTitle}" ${assetMeta.outcome || ''} | `
                    : '';

                console.log(
                    `[WHALE TRADE] ${contextPrefix}${whaleResult.side} ${whaleResult.size.toFixed(2)} @ ${whaleResult.price.toFixed(4)} ` +
                    `(${whaleResult.depthPercent.toFixed(1)}% of book, $${whaleResult.notional.toFixed(2)} notional)`
                );
            }
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
            // Get active events from database WITH date filtering (1-30 days until resolution)
            const activeEvents = await db.events.getAll({
                limit: 100,
                resolved: false,
                minDaysUntilResolution: 1,
                maxDaysUntilResolution: 30
            });

            // If no events in DB, fetch top markets from Polymarket API with same filters
            if (activeEvents.length === 0) {
                const polymarket = require('../polymarket/client');
                const markets = await polymarket.fetchMarkets({
                    limit: 100,
                    minDaysUntilResolution: 1,
                    maxDaysUntilResolution: 30
                });

                for (const market of markets) {
                    await this._subscribeToMarketTokens(market.rawData, market.id, market.question || market.title);
                }
                console.log(`StreamProcessor: Auto-subscribed to ${this.subscriptions.size} markets from API`);
                return;
            }

            // Subscribe to events from database
            for (const event of activeEvents) {
                // Extract rawData (where sync stores clobTokenIds and outcomes)
                await this._subscribeToMarketTokens(event.rawData, event.id, event.title);
            }

            console.log(`StreamProcessor: Subscribed to ${this.subscriptions.size} markets from DB`);
        } catch (error) {
            console.error('StreamProcessor: Error subscribing to active markets:', error.message);
        }
    }

    /**
     * Helper to subscribe to market tokens and optionally generate article
     * @param {Object} rawData - Raw market data containing clobTokenIds and outcomes
     * @param {string} eventId - Event ID for article generation
     * @param {string} eventTitle - Human-readable event title/question
     * @private
     */
    async _subscribeToMarketTokens(rawData, eventId, eventTitle) {
        if (!rawData) {
            return;
        }

        // Parse clobTokenIds if it's a JSON string
        let clobTokenIds = rawData.clobTokenIds;
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

        // Parse outcomes if it's a JSON string
        let outcomes = rawData.outcomes;
        if (typeof outcomes === 'string') {
            try {
                outcomes = JSON.parse(outcomes);
            } catch {
                outcomes = null;
            }
        }

        // Default outcomes if not provided
        if (!Array.isArray(outcomes)) {
            outcomes = ['Yes', 'No'];
        }

        for (let i = 0; i < clobTokenIds.length; i++) {
            const tokenId = clobTokenIds[i];
            const outcome = outcomes[i] || (i === 0 ? 'Yes' : 'No');

            // Register asset metadata
            assetRegistry.register(tokenId, {
                eventId,
                eventTitle,
                outcome,
                outcomeIndex: i
            });

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
     * Extract base probability from event data
     * @param {Object} event - Event object
     * @returns {number|null} Base probability or null if not available
     * @private
     */
    _extractBaseProbability(event) {
        if (!event) return null;

        // Try to get probability from rawData
        if (event.rawData) {
            // Polymarket stores outcome prices as probabilities
            if (event.rawData.outcomePrices) {
                try {
                    const prices = typeof event.rawData.outcomePrices === 'string'
                        ? JSON.parse(event.rawData.outcomePrices)
                        : event.rawData.outcomePrices;
                    if (Array.isArray(prices) && prices.length > 0) {
                        return parseFloat(prices[0]) || null;
                    }
                } catch {
                    // Ignore parse errors
                }
            }

            if (event.rawData.probability !== undefined) {
                return parseFloat(event.rawData.probability);
            }
        }

        // Try markets array
        if (event.markets && event.markets.length > 0) {
            const market = event.markets[0];
            if (market.outcomePrices) {
                try {
                    const prices = typeof market.outcomePrices === 'string'
                        ? JSON.parse(market.outcomePrices)
                        : market.outcomePrices;
                    if (Array.isArray(prices) && prices.length > 0) {
                        return parseFloat(prices[0]) || null;
                    }
                } catch {
                    // Ignore parse errors
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
