const express = require('express');
const cors = require('cors');

// ============================================================
// IMPORTING MODULES
// ============================================================
// require() loads another JavaScript file and returns its exports.
// Here we import our Polymarket service which handles all API logic.
// This keeps server.js focused on HTTP routing (its single responsibility).
// ============================================================
const polymarket = require('./polymarket');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());

// ============================================================
// ROUTES
// ============================================================
// Notice how clean these route handlers are now!
// They only handle:
// 1. Extracting parameters from the request
// 2. Calling the service function
// 3. Sending the response (or error)
//
// All the business logic (API calls, data transformation) lives
// in the polymarket.js module. This is "separation of concerns".
// ============================================================

// GET /api/markets - Fetch markets sorted by probability or volume
app.get('/api/markets', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const sortBy = req.query.sortBy || 'probability';

        // Call our service - it handles all the Polymarket API details
        const result = await polymarket.getMarkets({ limit, sortBy });

        res.json(result);
    } catch (error) {
        console.error('Error fetching markets:', error.message);
        res.status(500).json({
            error: 'Failed to fetch markets from Polymarket',
            details: error.message
        });
    }
});

// GET /api/markets/:slug - Fetch a single market by its slug
app.get('/api/markets/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        const market = await polymarket.getMarketBySlug(slug);

        res.json(market);
    } catch (error) {
        console.error('Error fetching market:', error.message);

        // Check for specific error types and return appropriate status
        if (error.code === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Market not found' });
        }

        res.status(500).json({
            error: 'Failed to fetch market from Polymarket',
            details: error.message
        });
    }
});

// GET /api/events - Fetch events (groups of related markets)
app.get('/api/events', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const result = await polymarket.getEvents({ limit });

        res.json(result);
    } catch (error) {
        console.error('Error fetching events:', error.message);
        res.status(500).json({
            error: 'Failed to fetch events from Polymarket',
            details: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// START THE SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log('');
    console.log('Available endpoints:');
    console.log('  GET /api/markets              - List markets (sorted by probability)');
    console.log('  GET /api/markets?sortBy=volume - List markets (sorted by volume)');
    console.log('  GET /api/markets/:slug        - Get a specific market');
    console.log('  GET /api/events               - List events with their markets');
    console.log('  GET /api/health               - Health check');
});
