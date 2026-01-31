// ============================================================
// POLYMARKET SERVICE MODULE
// ============================================================
// This module encapsulates all interactions with the Polymarket API.
// It follows the "Single Responsibility Principle" - this file only
// handles Polymarket data fetching and transformation.
//
// Benefits of this separation:
// 1. Testability - you can test this logic independently
// 2. Reusability - other parts of your app can import these functions
// 3. Maintainability - API changes only require updates here
// 4. Readability - server.js stays focused on HTTP routing
// ============================================================

const POLYMARKET_API = 'https://gamma-api.polymarket.com';

// ============================================================
// HELPER FUNCTIONS (Private - not exported)
// ============================================================
// These are internal utilities used by the exported functions.
// By not exporting them, we hide implementation details.
// ============================================================

/**
 * Parse outcome prices from Polymarket's JSON string format.
 * @param {Object} market - Raw market object from Polymarket API
 * @returns {Array} Array of {name, probability} objects
 */
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

/**
 * Transform a raw Polymarket market into our simplified format.
 * This creates a consistent shape for the frontend to consume.
 * @param {Object} market - Raw market from Polymarket API
 * @returns {Object} Transformed market object
 */
function transformMarket(market) {
    const outcomes = parseOutcomes(market);

    return {
        id: market.id,
        question: market.question,
        slug: market.slug,
        probability: outcomes[0]?.probability ?? null,
        outcomes,
        volume24hr: parseFloat(market.volume24hr) || 0,
        totalVolume: parseFloat(market.volumeNum) || 0,
        liquidity: parseFloat(market.liquidityNum) || 0,
        endDate: market.endDate,
        image: market.image,
        url: `https://polymarket.com/event/${market.slug}`
    };
}

/**
 * Transform a raw Polymarket market into detailed format (for single market view).
 * Includes additional fields like description and startDate.
 * @param {Object} market - Raw market from Polymarket API
 * @returns {Object} Detailed market object
 */
function transformMarketDetailed(market) {
    const outcomes = parseOutcomes(market);

    return {
        id: market.id,
        question: market.question,
        description: market.description,
        slug: market.slug,
        outcomes,
        volume24hr: parseFloat(market.volume24hr) || 0,
        totalVolume: parseFloat(market.volumeNum) || 0,
        liquidity: parseFloat(market.liquidityNum) || 0,
        startDate: market.startDate,
        endDate: market.endDate,
        image: market.image,
        url: `https://polymarket.com/event/${market.slug}`
    };
}

/**
 * Transform a raw Polymarket event into our simplified format.
 * @param {Object} event - Raw event from Polymarket API
 * @returns {Object} Transformed event object
 */
function transformEvent(event) {
    return {
        id: event.id,
        title: event.title,
        slug: event.slug,
        description: event.description,
        marketCount: event.markets?.length || 0,
        markets: (event.markets || []).map(m => ({
            id: m.id,
            question: m.question,
            outcomes: parseOutcomes(m)
        })),
        image: event.image,
        url: `https://polymarket.com/event/${event.slug}`
    };
}

// ============================================================
// EXPORTED FUNCTIONS (Public API)
// ============================================================
// These are the functions other modules can import and use.
// They represent the "contract" of this module.
// ============================================================

/**
 * Fetch markets from Polymarket, sorted by probability or volume.
 *
 * @param {Object} options - Query options
 * @param {number} options.limit - Max number of markets to return (default: 20)
 * @param {string} options.sortBy - 'probability' or 'volume' (default: 'probability')
 * @returns {Promise<{count: number, markets: Array}>}
 * @throws {Error} If the API request fails
 */
async function getMarkets({ limit = 20, sortBy = 'probability' } = {}) {
    const apiUrl = `${POLYMARKET_API}/markets?active=true&closed=false&limit=100&order=volume24hr&ascending=false`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status}`);
    }

    const rawMarkets = await response.json();
    const markets = rawMarkets.map(transformMarket);

    // Sort based on preference
    let sorted;
    if (sortBy === 'volume') {
        sorted = markets.sort((a, b) => b.volume24hr - a.volume24hr);
    } else {
        sorted = markets
            .filter(m => m.probability !== null)
            .sort((a, b) => b.probability - a.probability);
    }

    const result = sorted.slice(0, limit);

    return {
        count: result.length,
        markets: result
    };
}

/**
 * Fetch a single market by its slug.
 *
 * @param {string} slug - The market's URL slug
 * @returns {Promise<Object>} The market details
 * @throws {Error} If the API request fails or market not found
 */
async function getMarketBySlug(slug) {
    const apiUrl = `${POLYMARKET_API}/markets?slug=${encodeURIComponent(slug)}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status}`);
    }

    const markets = await response.json();

    if (markets.length === 0) {
        const error = new Error('Market not found');
        error.code = 'NOT_FOUND';
        throw error;
    }

    return transformMarketDetailed(markets[0]);
}

/**
 * Fetch events (groups of related markets) from Polymarket.
 *
 * @param {Object} options - Query options
 * @param {number} options.limit - Max number of events to return (default: 10)
 * @returns {Promise<{count: number, events: Array}>}
 * @throws {Error} If the API request fails
 */
async function getEvents({ limit = 10 } = {}) {
    const apiUrl = `${POLYMARKET_API}/events?active=true&closed=false&limit=${limit}&order=volume24hr&ascending=false`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
        throw new Error(`Polymarket API error: ${response.status}`);
    }

    const rawEvents = await response.json();
    const events = rawEvents.map(transformEvent);

    return {
        count: events.length,
        events
    };
}

// ============================================================
// MODULE EXPORTS
// ============================================================
// In Node.js, module.exports defines what other files get when
// they require() this file. We export an object with our public
// functions. This is the "interface" of our module.
//
// Alternative: You could use ES6 modules (export/import) by
// adding "type": "module" to package.json, but CommonJS
// (require/module.exports) is still the default in Node.js.
// ============================================================

module.exports = {
    getMarkets,
    getMarketBySlug,
    getEvents
};
