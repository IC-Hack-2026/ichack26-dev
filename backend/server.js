const express = require('express');
const cors = require('cors');

const config = require('./config');
const articlesRouter = require('./api/routes/articles');
const internalRouter = require('./api/routes/internal');

// Legacy polymarket routes (for backwards compatibility)
const polymarket = require('./services/polymarket/client');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Public API Routes - Article endpoints (new architecture)
app.use('/api/articles', articlesRouter);

// Internal API Routes - Admin/debugging
app.use('/api/internal', internalRouter);

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
    console.log('  POST /api/internal/sync        - Sync with Polymarket');
    console.log('  POST /api/internal/regenerate  - Regenerate articles');
    console.log('  GET /api/internal/signals/:id  - View signals for event');
    console.log('');
    console.log('Status:');
    console.log(`  OpenAI: ${config.openai.apiKey ? 'Configured' : 'Not configured (using fallback)'}`);
    console.log(`  Database: ${config.db.useInMemory ? 'In-memory' : 'PostgreSQL'}`);
});
