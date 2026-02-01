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

// Map Polymarket tags to our categories
const TAG_TO_CATEGORY = {
    // Politics
    'politics': 'Politics',
    'us-politics': 'Politics',
    'elections': 'Politics',
    'us-elections': 'Politics',
    '2024-election': 'Politics',
    '2024-elections': 'Politics',
    '2025-election': 'Politics',
    '2025-elections': 'Politics',
    '2026-election': 'Politics',
    '2026-elections': 'Politics',
    'congress': 'Politics',
    'senate': 'Politics',
    'president': 'Politics',
    'presidential': 'Politics',
    // Crypto
    'crypto': 'Crypto',
    'bitcoin': 'Crypto',
    'ethereum': 'Crypto',
    'cryptocurrency': 'Crypto',
    'defi': 'Crypto',
    'nft': 'Crypto',
    'web3': 'Crypto',
    // Sports
    'sports': 'Sports',
    'nfl': 'Sports',
    'nba': 'Sports',
    'mlb': 'Sports',
    'nhl': 'Sports',
    'soccer': 'Sports',
    'football': 'Sports',
    'basketball': 'Sports',
    'baseball': 'Sports',
    'hockey': 'Sports',
    'tennis': 'Sports',
    'golf': 'Sports',
    'ufc': 'Sports',
    'mma': 'Sports',
    'boxing': 'Sports',
    'olympics': 'Sports',
    'formula-1': 'Sports',
    'f1': 'Sports',
    // Finance
    'finance': 'Finance',
    'markets': 'Finance',
    'fed': 'Finance',
    'federal-reserve': 'Finance',
    'stocks': 'Finance',
    'economy': 'Finance',
    'economics': 'Finance',
    // Technology
    'tech': 'Technology',
    'technology': 'Technology',
    'ai': 'Technology',
    'artificial-intelligence': 'Technology',
    'science': 'Technology',
    'space': 'Technology',
    // Entertainment
    'entertainment': 'Entertainment',
    'movies': 'Entertainment',
    'music': 'Entertainment',
    'tv': 'Entertainment',
    'television': 'Entertainment',
    'awards': 'Entertainment',
    'celebrities': 'Entertainment',
    'pop-culture': 'Entertainment',
    // World
    'world': 'World',
    'geopolitics': 'World',
    'international': 'World',
    'global': 'World',
    'middle-east': 'World',
    'europe': 'World',
    'asia': 'World',
    'africa': 'World',
    'latin-america': 'World',
};

// Get category from Polymarket tags
function getCategoryFromTags(tags) {
    if (!tags || !Array.isArray(tags)) return null;

    for (const tag of tags) {
        // Handle both object format {slug, label} and string format
        const tagSlug = (typeof tag === 'string' ? tag : (tag.slug || tag.label || '')).toLowerCase();
        if (TAG_TO_CATEGORY[tagSlug]) {
            return TAG_TO_CATEGORY[tagSlug];
        }
    }
    return null;
}

// Categorize market based on title/description (fallback when no tags available)
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

    // Crypto (check BEFORE Sports - crypto terms should take priority over generic sports terms like "game")
    if (text.match(/\b(crypto|cryptocurrency|bitcoin|ethereum|btc|eth|token|blockchain|defi|nft|web3|wallet|mining|altcoin|stablecoin|solana|cardano|dogecoin)\b/)) {
        return 'Crypto';
    }

    // Sports (after Crypto to avoid "game"/"team" false positives from crypto gaming)
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

    return 'Other';
}

// Transform raw market to our format
function transformMarket(market) {
    const outcomes = parseOutcomes(market);
    // Use Polymarket's tags if available, otherwise fall back to regex
    const category = getCategoryFromTags(market.tags) || categorizeMarket(market);

    return {
        id: market.id,
        question: market.question,
        title: market.question, // Alias for article generation
        description: market.description || '',
        slug: market.slug,
        category,
        tags: market.tags || [], // Store original tags
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

// Fetch available tags from Polymarket
async function fetchTags() {
    const cacheKey = 'polymarket:tags';

    return cache.getOrSet(cacheKey, async () => {
        const apiUrl = `${POLYMARKET_API}/tags`;
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Polymarket API error: ${response.status}`);
        }
        return await response.json();
    }, config.cache.eventTTL);
}

// Fetch markets from Polymarket
async function fetchMarkets({
    limit = 50,
    sortBy = 'volume',
    tag = null,
    minDaysUntilResolution = null,
    maxDaysUntilResolution = null
} = {}) {
    const cacheKey = `markets:${limit}:${sortBy}:${tag}:${minDaysUntilResolution}:${maxDaysUntilResolution}`;

    return cache.getOrSet(cacheKey, async () => {
        // Determine sort order based on sortBy parameter
        let orderParam = 'volume24hr';
        let ascendingParam = 'false';

        if (sortBy === 'endingSoon') {
            orderParam = 'endDate';
            ascendingParam = 'true';
        }

        // Build API URL with optional date filtering
        let apiUrl = `${POLYMARKET_API}/markets?active=true&closed=false&limit=${limit}&order=${orderParam}&ascending=${ascendingParam}`;

        // Add tag filtering if specified
        if (tag) {
            apiUrl += `&tag=${encodeURIComponent(tag)}`;
        }

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

        // Filter by allowed categories if configured
        const allowedCategories = config.article?.allowedCategories;
        if (allowedCategories && allowedCategories.length > 0) {
            markets = markets.filter(m => allowedCategories.includes(m.category));
        }

        // Sort
        if (sortBy === 'probability') {
            markets = markets
                .filter(m => m.probability !== null)
                .sort((a, b) => b.probability - a.probability);
        } else if (sortBy === 'endingSoon') {
            // Sort by end date ascending (soonest first)
            markets.sort((a, b) => {
                if (!a.endDate) return 1;
                if (!b.endDate) return -1;
                return new Date(a.endDate) - new Date(b.endDate);
            });
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

        let events = rawEvents.map(event => ({
            id: event.id,
            title: event.title,
            slug: event.slug,
            description: event.description || '',
            // Use Polymarket's tags if available, otherwise fall back to regex
            category: getCategoryFromTags(event.tags) || categorizeMarket(event),
            tags: event.tags || [], // Store original tags
            image: event.image,
            endDate: event.endDate,
            markets: (event.markets || []).map(m => transformMarket(m)),
            url: `https://polymarket.com/event/${event.slug}`
        }));

        // Filter by allowed categories if configured
        const allowedCategories = config.article?.allowedCategories;
        if (allowedCategories && allowedCategories.length > 0) {
            events = events.filter(e => allowedCategories.includes(e.category));
        }

        return events;
    }, config.cache.eventTTL);
}

module.exports = {
    fetchMarkets,
    fetchMarketBySlug,
    fetchEvents,
    fetchTags,
    transformMarket,
    categorizeMarket,
    getCategoryFromTags,
    parseOutcomes
};
