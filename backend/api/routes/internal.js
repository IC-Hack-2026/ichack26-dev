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
            articles: 0
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
        }

        res.json({
            success: true,
            synced: results
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
        signals: db._store.signals.size
    });
});

module.exports = router;
