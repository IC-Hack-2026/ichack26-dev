// Polymarket API client
// Handles fetching events and markets from Polymarket's Gamma API

const config = require('../../config');
const cache = require('../cache');

const POLYMARKET_API = config.polymarket.baseUrl;

// Parse outcome prices from Polymarket's JSON string format
function parseOutcomes(market) {
    try {
        const prices = JSON.parse(market.outcomePrices || '[]');
        const names = market.outcomes ? JSON.parse(market.outcomes) : ['Yes', 'No'];

        return names.map((name, i) => ({
            name,
            probability: parseFloat(prices[i]) || 0
        }));
    } catch {
        return [];
    }
}

// Categorize market based on title/description
function categorizeMarket(market) {
    const text = `${market.question || ''} ${market.description || ''}`.toLowerCase();

    if (text.match(/trump|biden|election|president|congress|senate|governor|democrat|republican|vote|political|policy/)) {
        return 'Politics';
    }
    if (text.match(/crypto|bitcoin|ethereum|btc|eth|token|blockchain|defi|nft/)) {
        return 'Crypto';
    }
    if (text.match(/sport|nfl|nba|mlb|soccer|football|basketball|tennis|golf|game|team|player|championship|league/)) {
        return 'Sports';
    }
    if (text.match(/stock|market|fed|rate|economy|gdp|inflation|recession|dow|nasdaq|s&p|earnings|ipo/)) {
        return 'Finance';
    }
    if (text.match(/ai|tech|apple|google|microsoft|amazon|meta|tesla|spacex|launch|rocket|satellite/)) {
        return 'Technology';
    }
    if (text.match(/celebrity|movie|music|entertainment|award|oscar|grammy|show|concert|album/)) {
        return 'Entertainment';
    }
    if (text.match(/war|military|ukraine|russia|china|taiwan|conflict|nato|treaty|international/)) {
        return 'World';
    }

    return 'Other';
}

// Transform raw market to our format
function transformMarket(market) {
    const outcomes = parseOutcomes(market);
    const category = categorizeMarket(market);

    return {
        id: market.id,
        question: market.question,
        title: market.question, // Alias for article generation
        description: market.description || '',
        slug: market.slug,
        category,
        probability: outcomes[0]?.probability ?? null,
        outcomes,
        volume24hr: parseFloat(market.volume24hr) || 0,
        totalVolume: parseFloat(market.volumeNum) || 0,
        liquidity: parseFloat(market.liquidityNum) || 0,
        startDate: market.startDate,
        endDate: market.endDate,
        image: market.image,
        url: `https://polymarket.com/event/${market.slug}`,
        rawData: market
    };
}

// Fetch markets from Polymarket
async function fetchMarkets({ limit = 50, sortBy = 'volume' } = {}) {
    const cacheKey = `markets:${limit}:${sortBy}`;

    return cache.getOrSet(cacheKey, async () => {
        const apiUrl = `${POLYMARKET_API}/markets?active=true&closed=false&limit=100&order=volume24hr&ascending=false`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Polymarket API error: ${response.status}`);
        }

        const rawMarkets = await response.json();
        let markets = rawMarkets.map(transformMarket);

        // Sort
        if (sortBy === 'probability') {
            markets = markets
                .filter(m => m.probability !== null)
                .sort((a, b) => b.probability - a.probability);
        } else {
            markets.sort((a, b) => b.volume24hr - a.volume24hr);
        }

        return markets.slice(0, limit);
    }, config.cache.marketTTL);
}

// Fetch single market by slug
async function fetchMarketBySlug(slug) {
    const cacheKey = `market:${slug}`;

    return cache.getOrSet(cacheKey, async () => {
        const apiUrl = `${POLYMARKET_API}/markets?slug=${encodeURIComponent(slug)}`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Polymarket API error: ${response.status}`);
        }

        const markets = await response.json();
        if (markets.length === 0) {
            return null;
        }

        return transformMarket(markets[0]);
    }, config.cache.marketTTL);
}

// Fetch events (groups of related markets)
async function fetchEvents({ limit = 20 } = {}) {
    const cacheKey = `events:${limit}`;

    return cache.getOrSet(cacheKey, async () => {
        const apiUrl = `${POLYMARKET_API}/events?active=true&closed=false&limit=${limit}&order=volume24hr&ascending=false`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Polymarket API error: ${response.status}`);
        }

        const rawEvents = await response.json();

        return rawEvents.map(event => ({
            id: event.id,
            title: event.title,
            slug: event.slug,
            description: event.description || '',
            category: categorizeMarket(event),
            image: event.image,
            endDate: event.endDate,
            markets: (event.markets || []).map(m => transformMarket(m)),
            url: `https://polymarket.com/event/${event.slug}`
        }));
    }, config.cache.eventTTL);
}

module.exports = {
    fetchMarkets,
    fetchMarketBySlug,
    fetchEvents,
    transformMarket,
    categorizeMarket,
    parseOutcomes
};
