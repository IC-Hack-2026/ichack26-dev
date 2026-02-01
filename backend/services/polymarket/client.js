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
// Priority order matters: World checked first to catch geopolitical terms before other categories
function categorizeMarket(market) {
    const text = `${market.question || ''} ${market.description || ''}`.toLowerCase();

    // World category (check FIRST - most geopolitical terms that could be misclassified)
    if (text.match(/\b(iran|iraq|syria|israel|palestine|gaza|russia|ukraine|china|taiwan|korea|afghanistan|yemen|lebanon|saudi|turkey|pakistan|india|mexico|canada|europe|eu|european)\b/) ||
        text.match(/\b(invasion|war|military|conflict|sanctions|treaty|nato|un|united nations|geopolitical|diplomatic|ambassador|embassy)\b/) ||
        text.match(/\b(world|global|international|foreign|border|refugee|humanitarian|ceasefire|peace|troops|army|navy|missile|nuclear|weapon)\b/)) {
        return 'World';
    }

    // Politics (US domestic politics)
    if (text.match(/\b(trump|biden|harris|election|president|congress|senate|governor|democrat|republican|gop|dnc|rnc)\b/) ||
        text.match(/\b(vote|voting|ballot|poll|primary|caucus|impeach|supreme court|scotus|legislation|bill|law|amendment)\b/) ||
        text.match(/\b(political|policy|administration|white house|cabinet|attorney general|secretary|federal)\b/)) {
        return 'Politics';
    }

    // Sports
    if (text.match(/\b(sport|nfl|nba|mlb|nhl|mls|ufc|mma|boxing|soccer|football|basketball|baseball|hockey|tennis|golf)\b/) ||
        text.match(/\b(game|match|team|player|championship|league|playoff|finals|tournament|cup|medal|olympic|super bowl)\b/) ||
        text.match(/\b(coach|draft|trade|mvp|score|win|lose|season|world series|stanley cup)\b/)) {
        return 'Sports';
    }

    // Entertainment
    if (text.match(/\b(celebrity|movie|film|music|entertainment|award|oscar|grammy|emmy|golden globe|tony)\b/) ||
        text.match(/\b(show|concert|album|song|artist|actor|actress|director|netflix|disney|hollywood|streaming)\b/) ||
        text.match(/\b(box office|premiere|release|tv|television|series|podcast|youtube|tiktok|viral)\b/)) {
        return 'Entertainment';
    }

    // Finance
    if (text.match(/\b(stock|market|fed|federal reserve|rate|economy|gdp|inflation|recession|dow|nasdaq|s&p)\b/) ||
        text.match(/\b(earnings|ipo|bond|treasury|debt|deficit|trade|tariff|currency|forex|commodities|gold|oil)\b/)) {
        return 'Finance';
    }

    // Technology
    if (text.match(/\b(ai|artificial intelligence|tech|technology|apple|google|microsoft|amazon|meta|tesla|spacex)\b/) ||
        text.match(/\b(launch|rocket|satellite|software|hardware|chip|semiconductor|robot|autonomous|startup|silicon valley)\b/)) {
        return 'Technology';
    }

    // Crypto (check LAST to avoid false positives from terms like "token" that might appear in other contexts)
    if (text.match(/\b(crypto|cryptocurrency|bitcoin|ethereum|btc|eth|token|blockchain|defi|nft|web3|wallet|mining|altcoin|stablecoin|solana|cardano|dogecoin)\b/)) {
        return 'Crypto';
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
async function fetchMarkets({
    limit = 50,
    sortBy = 'volume',
    minDaysUntilResolution = null,
    maxDaysUntilResolution = null
} = {}) {
    const cacheKey = `markets:${limit}:${sortBy}:${minDaysUntilResolution}:${maxDaysUntilResolution}`;

    return cache.getOrSet(cacheKey, async () => {
        // Build API URL with optional date filtering
        let apiUrl = `${POLYMARKET_API}/markets?active=true&closed=false&limit=100&order=volume24hr&ascending=false`;

        // Add server-side date filtering if specified
        if (minDaysUntilResolution != null || maxDaysUntilResolution != null) {
            const now = Date.now();
            if (minDaysUntilResolution != null) {
                const minDate = new Date(now + minDaysUntilResolution * 24 * 60 * 60 * 1000);
                apiUrl += `&end_date_min=${minDate.toISOString()}`;
            }
            if (maxDaysUntilResolution != null) {
                const maxDate = new Date(now + maxDaysUntilResolution * 24 * 60 * 60 * 1000);
                apiUrl += `&end_date_max=${maxDate.toISOString()}`;
            }
        }

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
