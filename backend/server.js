require('dotenv').config();

const express = require('express');
const cors = require('cors');

const config = require('./config');
const articlesRouter = require('./api/routes/articles');
const internalRouter = require('./api/routes/internal');
const orderbookRouter = require('./api/routes/orderbook');

// Legacy polymarket routes (for backwards compatibility)
const polymarket = require('./services/polymarket/client');

// Real-time stream processing
const { streamProcessor } = require('./services/pipeline/stream-processor');
const { createArticle } = require('./services/article/generator');
const db = require('./db');

const app = express();

// Handle stream processor errors gracefully (don't crash the server)
streamProcessor.on('error', (error) => {
    console.error('Stream processor error:', error.message || error);
});

// Middleware
app.use(cors());
app.use(express.json());

// Public API Routes - Article endpoints (new architecture)
app.use('/api/articles', articlesRouter);

// Internal API Routes - Admin/debugging
app.use('/api/internal', internalRouter);

// Order Book API Routes - Real-time order book data
app.use('/api/orderbook', orderbookRouter);

// Legacy Routes - Keep existing market endpoints for backward compatibility
app.get('/api/markets', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const sortBy = req.query.sortBy || 'probability';

        const markets = await polymarket.fetchMarkets({ limit, sortBy });

        res.json({
            count: markets.length,
            markets
        });
    } catch (error) {
        console.error('Error fetching markets:', error.message);
        res.status(500).json({
            error: 'Failed to fetch markets from Polymarket',
            details: error.message
        });
    }
});

app.get('/api/markets/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const market = await polymarket.fetchMarketBySlug(slug);

        if (!market) {
            return res.status(404).json({ error: 'Market not found' });
        }

        res.json(market);
    } catch (error) {
        console.error('Error fetching market:', error.message);
        res.status(500).json({
            error: 'Failed to fetch market from Polymarket',
            details: error.message
        });
    }
});

app.get('/api/events', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const events = await polymarket.fetchEvents({ limit });

        res.json({
            count: events.length,
            events
        });
    } catch (error) {
        console.error('Error fetching events:', error.message);
        res.status(500).json({
            error: 'Failed to fetch events from Polymarket',
            details: error.message
        });
    }
});

// Categories endpoint
app.get('/api/categories', async (req, res) => {
    try {
        const db = require('./db');
        const categories = await db.events.getCategories();

        // If no categories in DB, return default list
        if (categories.length === 0) {
            return res.json({
                categories: [
                    { name: 'Politics', count: 0 },
                    { name: 'Crypto', count: 0 },
                    { name: 'Sports', count: 0 },
                    { name: 'Finance', count: 0 },
                    { name: 'Technology', count: 0 },
                    { name: 'Entertainment', count: 0 },
                    { name: 'World', count: 0 },
                    { name: 'Other', count: 0 }
                ]
            });
        }

        res.json({ categories });
    } catch (error) {
        console.error('Error fetching categories:', error.message);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            polymarket: 'connected',
            openai: config.openai.apiKey ? 'configured' : 'not-configured',
            database: config.db.useInMemory ? 'in-memory' : 'postgresql',
            cache: config.redis.useInMemory ? 'in-memory' : 'redis'
        }
    });
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    await streamProcessor.stop();
    process.exit(0);
});

// Start the server
app.listen(config.port, () => {
    console.log(`\nFuturo News Backend running on http://localhost:${config.port}`);
    console.log('');
    console.log('Public API (for frontend):');
    console.log('  GET /api/articles              - List news articles');
    console.log('  GET /api/articles/featured     - Featured articles for hero');
    console.log('  GET /api/articles/:slug        - Single article');
    console.log('  GET /api/categories            - List categories');
    console.log('');
    console.log('Legacy API (backward compatible):');
    console.log('  GET /api/markets               - List markets');
    console.log('  GET /api/markets/:slug         - Single market');
    console.log('  GET /api/events                - List events');
    console.log('');
    console.log('Internal API (admin):');
    console.log('  POST /api/internal/sync           - Sync with Polymarket');
    console.log('  POST /api/internal/regenerate     - Regenerate articles');
    console.log('  GET /api/internal/signals/:id     - View signals for event');
    console.log('  GET /api/internal/signals/realtime - Recent detected patterns');
    console.log('  GET /api/internal/wallets/suspicious - Suspicious wallets');
    console.log('  GET /api/internal/wallets/:address - Wallet profile');
    console.log('  GET /api/internal/stream/status   - Stream processor health');
    console.log('');
    console.log('Order Book API:');
    console.log('  GET /api/orderbook                - All order books summary');
    console.log('  GET /api/orderbook/:assetId       - Full order book');
    console.log('  GET /api/orderbook/:assetId/depth - Top N levels');
    console.log('');
    console.log('Status:');
    console.log(`  OpenAI: ${config.openai.apiKey ? 'Configured' : 'Not configured (using fallback)'}`);
    console.log(`  Database: ${config.db.useInMemory ? 'In-memory' : 'PostgreSQL'}`);
    console.log(`  Real-time: ${config.realtime?.enabled ? 'Enabled' : 'Disabled'}`);

    // Start stream processor if real-time is enabled
    if (config.realtime?.enabled) {
        streamProcessor.start().then(() => {
            console.log('Real-time stream processor started');
        }).catch(err => {
            console.error('Failed to start stream processor:', err);
        });
    }

    // Auto-sync markets every 1 minute
    const AUTO_SYNC_INTERVAL = 1 * 60 * 1000; // 1 minute
    setInterval(async () => {
        try {
            console.log('[AutoSync] Starting periodic market sync...');
            const markets = await polymarket.fetchMarkets({
                limit: 500,
                sortBy: 'endingSoon',
                minDaysUntilResolution: 1,
                maxDaysUntilResolution: 14
            });

            let newEvents = 0;
            let newArticles = 0;
            let newSubscriptions = 0;

            for (const market of markets) {
                // Check if event already exists
                const existingEvent = await db.events.getById(market.id);

                // Upsert event
                await db.events.upsert({
                    id: market.id,
                    slug: market.slug,
                    title: market.question,
                    description: market.description,
                    category: market.category,
                    endDate: market.endDate,
                    resolved: false,
                    rawData: market.rawData
                });

                if (!existingEvent) {
                    newEvents++;
                }

                // Generate article if it doesn't exist
                const existingArticle = await db.articles.getByEventId(market.id);
                if (!existingArticle) {
                    const prediction = await db.predictions.getLatestByEventId(market.id);
                    await createArticle(market, prediction || { adjustedProbability: market.probability });
                    newArticles++;
                }

                // Subscribe to market tokens
                let clobTokenIds = market.rawData?.clobTokenIds;
                if (typeof clobTokenIds === 'string') {
                    try {
                        clobTokenIds = JSON.parse(clobTokenIds);
                    } catch {
                        clobTokenIds = null;
                    }
                }
                if (Array.isArray(clobTokenIds)) {
                    for (const tokenId of clobTokenIds) {
                        if (!streamProcessor.subscriptions.has(tokenId)) {
                            streamProcessor.subscribeToMarket(tokenId);
                            newSubscriptions++;
                        }
                    }
                }
            }

            console.log(`[AutoSync] Completed: ${newEvents} new events, ${newArticles} new articles, ${newSubscriptions} new subscriptions (total: ${streamProcessor.subscriptions.size})`);
        } catch (error) {
            console.error('[AutoSync] Failed:', error.message);
        }
    }, AUTO_SYNC_INTERVAL);

    // Also run an initial sync after a short delay to populate data on startup
    setTimeout(async () => {
        try {
            console.log('[InitialSync] Running initial market sync...');
            const markets = await polymarket.fetchMarkets({
                limit: 500,
                sortBy: 'endingSoon',
                minDaysUntilResolution: 1,
                maxDaysUntilResolution: 14
            });

            let syncedArticles = 0;
            for (const market of markets) {
                await db.events.upsert({
                    id: market.id,
                    slug: market.slug,
                    title: market.question,
                    description: market.description,
                    category: market.category,
                    endDate: market.endDate,
                    resolved: false,
                    rawData: market.rawData
                });

                const existingArticle = await db.articles.getByEventId(market.id);
                if (!existingArticle) {
                    await createArticle(market, { adjustedProbability: market.probability });
                    syncedArticles++;
                }

                // Subscribe to tokens
                let clobTokenIds = market.rawData?.clobTokenIds;
                if (typeof clobTokenIds === 'string') {
                    try {
                        clobTokenIds = JSON.parse(clobTokenIds);
                    } catch {
                        clobTokenIds = null;
                    }
                }
                if (Array.isArray(clobTokenIds)) {
                    for (const tokenId of clobTokenIds) {
                        if (!streamProcessor.subscriptions.has(tokenId)) {
                            streamProcessor.subscribeToMarket(tokenId);
                        }
                    }
                }
            }

            // Load persisted whale trades into probability adjuster
            const { probabilityAdjuster } = require('./services/orderbook/probability-adjuster');
            const recentWhales = await db.whaleTrades.getRecent(1000);
            const loaded = probabilityAdjuster.loadFromHistory(recentWhales);
            console.log(`[InitialSync] Loaded ${loaded} whale signals from history`);

            console.log(`[InitialSync] Completed: ${markets.length} events, ${syncedArticles} articles, ${streamProcessor.subscriptions.size} subscriptions`);
        } catch (error) {
            console.error('[InitialSync] Failed:', error.message);
        }
    }, 3000); // Wait 3 seconds for server to fully initialize
});
