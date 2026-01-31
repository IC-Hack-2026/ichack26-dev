// Article API Routes
// Public endpoints for the news frontend

const express = require('express');
const router = express.Router();

const db = require('../../db');
const polymarket = require('../../services/polymarket/client');
const predictionEngine = require('../../services/prediction/engine');
const articleGenerator = require('../../services/article/generator');

// GET /api/articles - List articles with optional filters
router.get('/', async (req, res) => {
    try {
        const {
            category,
            limit = 20,
            offset = 0,
            sort = 'publishedAt'
        } = req.query;

        // Get articles from database
        let articles = await db.articles.getAll({
            limit: parseInt(limit),
            offset: parseInt(offset),
            category,
            sort
        });

        // If no articles yet, generate some from Polymarket
        if (articles.length === 0) {
            const markets = await polymarket.fetchMarkets({ limit: parseInt(limit) });

            // Generate articles for each market
            for (const market of markets) {
                const prediction = await predictionEngine.calculatePrediction(market, market);
                await articleGenerator.createArticle(market, prediction);
            }

            // Fetch the newly created articles
            articles = await db.articles.getAll({
                limit: parseInt(limit),
                offset: parseInt(offset),
                category,
                sort
            });
        }

        res.json({
            count: articles.length,
            articles: articles.map(formatArticleCard)
        });
    } catch (error) {
        console.error('Error fetching articles:', error.message);
        res.status(500).json({ error: 'Failed to fetch articles', details: error.message });
    }
});

// GET /api/articles/featured - Top articles for hero section
router.get('/featured', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        let articles = await db.articles.getFeatured(limit);

        // If no articles, generate from top markets
        if (articles.length === 0) {
            const markets = await polymarket.fetchMarkets({ limit, sortBy: 'volume' });

            for (const market of markets) {
                const prediction = await predictionEngine.calculatePrediction(market, market);
                await articleGenerator.createArticle(market, prediction);
            }

            articles = await db.articles.getFeatured(limit);
        }

        res.json({
            count: articles.length,
            articles: articles.map(formatArticleFull)
        });
    } catch (error) {
        console.error('Error fetching featured articles:', error.message);
        res.status(500).json({ error: 'Failed to fetch featured articles', details: error.message });
    }
});

// GET /api/articles/:slug - Single article with full content
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        let article = await db.articles.getBySlug(slug);

        // If not found, try to fetch from Polymarket and generate
        if (!article) {
            const market = await polymarket.fetchMarketBySlug(slug);

            if (!market) {
                return res.status(404).json({ error: 'Article not found' });
            }

            const prediction = await predictionEngine.calculatePrediction(market, market);
            article = await articleGenerator.createArticle(market, prediction);
        }

        res.json(formatArticleFull(article));
    } catch (error) {
        console.error('Error fetching article:', error.message);
        res.status(500).json({ error: 'Failed to fetch article', details: error.message });
    }
});

// GET /api/categories - List categories with article counts
router.get('/meta/categories', async (req, res) => {
    try {
        // Get categories from events
        const categories = await db.events.getCategories();

        // Get article counts per category
        const result = [];
        const seenCategories = new Set();

        // First add categories with articles
        const articles = await db.articles.getAll({ limit: 1000 });
        const articleCounts = {};

        for (const article of articles) {
            const cat = article.category || 'Other';
            articleCounts[cat] = (articleCounts[cat] || 0) + 1;
            seenCategories.add(cat);
        }

        for (const cat of seenCategories) {
            result.push({ name: cat, count: articleCounts[cat] || 0 });
        }

        // Sort by count
        result.sort((a, b) => b.count - a.count);

        res.json({ categories: result });
    } catch (error) {
        console.error('Error fetching categories:', error.message);
        res.status(500).json({ error: 'Failed to fetch categories', details: error.message });
    }
});

// Helper: format article for card display (list view)
function formatArticleCard(article) {
    return {
        id: article.id,
        slug: article.slug,
        headline: article.headline,
        summary: article.summary,
        category: article.category,
        probability: article.probability,
        imageUrl: article.imageUrl,
        publishedAt: article.publishedAt,
        expiresAt: article.expiresAt
    };
}

// Helper: format article for full display
function formatArticleFull(article) {
    return {
        id: article.id,
        slug: article.slug,
        headline: article.headline,
        summary: article.summary,
        body: article.body,
        category: article.category,
        probability: article.probability,
        imageUrl: article.imageUrl,
        publishedAt: article.publishedAt,
        expiresAt: article.expiresAt,
        eventId: article.eventId
    };
}

module.exports = router;
