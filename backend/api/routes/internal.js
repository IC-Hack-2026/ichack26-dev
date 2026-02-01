// Internal API Routes
// Admin/debugging endpoints (not for public frontend)

const express = require('express');
const router = express.Router();

const db = require('../../db');
const polymarket = require('../../services/polymarket/client');
const predictionEngine = require('../../services/prediction/engine');
const articleGenerator = require('../../services/article/generator');
const signalRegistry = require('../../services/signals/registry');
const cache = require('../../services/cache');
const { streamProcessor } = require('../../services/pipeline/stream-processor');
const { probabilityAdjuster } = require('../../services/orderbook/probability-adjuster');

// POST /api/internal/sync - Trigger sync with Polymarket
router.post('/sync', async (req, res) => {
    try {
        const { limit = 30 } = req.body;

        // Fetch latest markets
        const markets = await polymarket.fetchMarkets({ limit });

        // Store events and generate predictions
        const results = {
            events: 0,
            predictions: 0,
            articles: 0,
            subscriptions: 0
        };

        for (const market of markets) {
            // Store event
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
            results.events++;

            // Calculate prediction
            await predictionEngine.calculatePrediction(market, market);
            results.predictions++;

            // Generate article
            const prediction = await db.predictions.getLatestByEventId(market.id);
            await articleGenerator.createArticle(market, prediction);
            results.articles++;

            // Subscribe to market's token IDs for real-time updates
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
                        results.subscriptions++;
                    }
                }
            }
        }

        res.json({
            success: true,
            synced: results,
            totalSubscriptions: streamProcessor.subscriptions.size
        });
    } catch (error) {
        console.error('Sync error:', error.message);
        res.status(500).json({ error: 'Sync failed', details: error.message });
    }
});

// POST /api/internal/regenerate - Regenerate articles
router.post('/regenerate', async (req, res) => {
    try {
        const { eventIds } = req.body;
        const results = [];

        const events = eventIds
            ? eventIds.map(id => db.events.getById(id)).filter(Boolean)
            : await db.events.getAll({ limit: 50 });

        for (const event of events) {
            const prediction = await db.predictions.getLatestByEventId(event.id);
            const market = await polymarket.fetchMarketBySlug(event.slug);

            if (market) {
                const articleData = await articleGenerator.generateArticle(market, prediction);
                const existing = await db.articles.getByEventId(event.id);

                if (existing) {
                    await db.articles.update(existing.id, articleData);
                } else {
                    await db.articles.create(articleData);
                }
                results.push({ eventId: event.id, status: 'regenerated' });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Regenerate error:', error.message);
        res.status(500).json({ error: 'Regeneration failed', details: error.message });
    }
});

// GET /api/internal/signals/realtime - Get recent detected patterns
// NOTE: This route must be defined BEFORE /signals/:eventId to avoid being caught by the wildcard
router.get('/signals/realtime', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const type = req.query.type;

        let patterns = await db.detectedPatterns.getRecent(limit);

        if (type) {
            patterns = patterns.filter(p => p.type === type);
        }

        res.json({
            patterns,
            count: patterns.length
        });
    } catch (error) {
        console.error('Realtime signals error:', error.message);
        res.status(500).json({ error: 'Failed to fetch realtime signals', details: error.message });
    }
});

// GET /api/internal/signals/:eventId - Get signals for an event
router.get('/signals/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params;
        const signals = await db.signals.getByEventId(eventId);
        const summary = await signalRegistry.getSignalsSummary(eventId);

        res.json({ eventId, signals, summary });
    } catch (error) {
        console.error('Signals error:', error.message);
        res.status(500).json({ error: 'Failed to fetch signals', details: error.message });
    }
});

// GET /api/internal/cache/stats - Cache statistics
router.get('/cache/stats', (req, res) => {
    res.json({
        size: cache.size(),
        keys: cache.keys()
    });
});

// POST /api/internal/cache/clear - Clear cache
router.post('/cache/clear', (req, res) => {
    cache.clear();
    res.json({ success: true, message: 'Cache cleared' });
});

// GET /api/internal/debug/store - Debug: view in-memory store
router.get('/debug/store', (req, res) => {
    res.json({
        events: db._store.events.size,
        predictions: db._store.predictions.size,
        articles: db._store.articles.size,
        signals: db._store.signals.size,
        walletProfiles: db._store.walletProfiles.size,
        tradeHistory: db._store.tradeHistory.length,
        detectedPatterns: db._store.detectedPatterns.length,
        whaleTrades: db._store.whaleTrades.length
    });
});

// GET /api/internal/wallets/suspicious - Get high-accuracy/suspicious wallets
// NOTE: This route must be defined BEFORE /wallets/:address to avoid being caught by the wildcard
router.get('/wallets/suspicious', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const minWinRate = req.query.minWinRate ? parseFloat(req.query.minWinRate) : undefined;

        let wallets = await db.walletProfiles.getSuspicious(limit);

        if (minWinRate !== undefined) {
            wallets = wallets.filter(w => w.winRate >= minWinRate);
        }

        res.json({
            wallets,
            count: wallets.length
        });
    } catch (error) {
        console.error('Suspicious wallets error:', error.message);
        res.status(500).json({ error: 'Failed to fetch suspicious wallets', details: error.message });
    }
});

// GET /api/internal/wallets/:address - Get wallet profile and trades
router.get('/wallets/:address', async (req, res) => {
    try {
        const { address } = req.params;

        const profile = await db.walletProfiles.getByAddress(address);
        const recentTrades = await db.tradeHistory.getByWallet(address, 50);
        // Note: db.signals doesn't have getByWalletAddress, so we use an empty array
        const signals = [];

        res.json({
            profile,
            recentTrades,
            signals
        });
    } catch (error) {
        console.error('Wallet profile error:', error.message);
        res.status(500).json({ error: 'Failed to fetch wallet profile', details: error.message });
    }
});

// GET /api/internal/stream/status - Get stream processor health
router.get('/stream/status', (req, res) => {
    try {
        const status = streamProcessor.getStatus();

        res.json({
            running: status.running,
            subscriptionCount: status.subscriptionCount,
            processedTrades: status.processedTrades,
            detectedSignals: status.detectedSignals,
            detectedWhaleTrades: status.detectedWhaleTrades,
            uptime: status.uptime,
            whaleDetector: status.whaleDetector,
            probabilityAdjuster: status.probabilityAdjuster
        });
    } catch (error) {
        console.error('Stream status error:', error.message);
        res.status(500).json({ error: 'Failed to fetch stream status', details: error.message });
    }
});

// GET /api/internal/whale-trades - List recent whale trade detections
router.get('/whale-trades', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const assetId = req.query.assetId;

        let trades;
        if (assetId) {
            trades = await db.whaleTrades.getByAsset(assetId, limit);
        } else {
            trades = await db.whaleTrades.getRecent(limit);
        }

        const totalCount = await db.whaleTrades.count();

        res.json({
            trades,
            count: trades.length,
            totalCount
        });
    } catch (error) {
        console.error('Whale trades error:', error.message);
        res.status(500).json({ error: 'Failed to fetch whale trades', details: error.message });
    }
});

// GET /api/internal/probability-signals - List active probability adjustment signals
router.get('/probability-signals', (req, res) => {
    try {
        const signals = probabilityAdjuster.getAllSignals();
        const config = probabilityAdjuster.getConfig();

        res.json({
            signals,
            count: signals.length,
            config
        });
    } catch (error) {
        console.error('Probability signals error:', error.message);
        res.status(500).json({ error: 'Failed to fetch probability signals', details: error.message });
    }
});

module.exports = router;
