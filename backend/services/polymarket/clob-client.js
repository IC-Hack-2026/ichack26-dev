// Polymarket CLOB (Central Limit Order Book) REST API Client
// Handles fetching order book, trades, prices, and midpoints from CLOB API
// Implements token bucket rate limiting and exponential backoff

const config = require('../../config');

const CLOB_BASE_URL = config.polymarket.clobUrl;

// Rate limit pools configuration (requests per window)
const RATE_LIMIT_POOLS = {
    general: { maxTokens: 9000, windowMs: 10000 },  // 9,000 requests per 10 seconds
    book: { maxTokens: 1500, windowMs: 10000 },     // 1,500 requests per 10 seconds
    trades: { maxTokens: 200, windowMs: 10000 }     // 200 requests per 10 seconds
};

// Exponential backoff configuration
const BACKOFF_CONFIG = {
    initialDelayMs: 1000,
    maxDelayMs: 32000,
    multiplier: 2
};

/**
 * Token Bucket Rate Limiter
 * Implements the token bucket algorithm for rate limiting
 */
class TokenBucket {
    constructor(maxTokens, windowMs) {
        this.maxTokens = maxTokens;
        this.windowMs = windowMs;
        this.tokens = maxTokens;
        this.lastRefill = Date.now();
        this.queue = [];
        this.processing = false;
    }

    /**
     * Refill tokens based on elapsed time
     */
    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const tokensToAdd = Math.floor((elapsed / this.windowMs) * this.maxTokens);

        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    /**
     * Try to consume a token, returns true if successful
     */
    tryConsume() {
        this.refill();
        if (this.tokens > 0) {
            this.tokens--;
            return true;
        }
        return false;
    }

    /**
     * Calculate wait time until a token is available
     */
    getWaitTime() {
        this.refill();
        if (this.tokens > 0) {
            return 0;
        }
        // Calculate time until next token is available
        const timePerToken = this.windowMs / this.maxTokens;
        return timePerToken;
    }

    /**
     * Acquire a token, waiting in queue if necessary
     */
    async acquire() {
        return new Promise((resolve) => {
            const tryAcquire = () => {
                if (this.tryConsume()) {
                    resolve();
                    this.processQueue();
                } else {
                    this.queue.push(tryAcquire);
                    this.scheduleProcessing();
                }
            };
            tryAcquire();
        });
    }

    /**
     * Schedule queue processing
     */
    scheduleProcessing() {
        if (this.processing) return;
        this.processing = true;

        const waitTime = this.getWaitTime();
        setTimeout(() => {
            this.processing = false;
            this.processQueue();
        }, waitTime);
    }

    /**
     * Process queued requests
     */
    processQueue() {
        while (this.queue.length > 0 && this.tryConsume()) {
            const next = this.queue.shift();
            // Re-add the token since tryConsume already consumed it
            this.tokens++;
            next();
        }

        if (this.queue.length > 0) {
            this.scheduleProcessing();
        }
    }
}

/**
 * Custom error class for CLOB API errors
 */
class ClobApiError extends Error {
    constructor(message, statusCode, response) {
        super(message);
        this.name = 'ClobApiError';
        this.statusCode = statusCode;
        this.response = response;
    }
}

/**
 * Polymarket CLOB REST API Client
 */
class ClobClient {
    constructor(baseUrl = CLOB_BASE_URL) {
        this.baseUrl = baseUrl;

        // Initialize rate limit pools
        this.rateLimiters = {
            general: new TokenBucket(
                RATE_LIMIT_POOLS.general.maxTokens,
                RATE_LIMIT_POOLS.general.windowMs
            ),
            book: new TokenBucket(
                RATE_LIMIT_POOLS.book.maxTokens,
                RATE_LIMIT_POOLS.book.windowMs
            ),
            trades: new TokenBucket(
                RATE_LIMIT_POOLS.trades.maxTokens,
                RATE_LIMIT_POOLS.trades.windowMs
            )
        };
    }

    /**
     * Sleep utility for backoff
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Calculate exponential backoff delay
     */
    calculateBackoff(attempt) {
        const delay = BACKOFF_CONFIG.initialDelayMs * Math.pow(BACKOFF_CONFIG.multiplier, attempt);
        return Math.min(delay, BACKOFF_CONFIG.maxDelayMs);
    }

    /**
     * Make a rate-limited request with exponential backoff on 429 errors
     * @param {string} endpoint - API endpoint
     * @param {Object} params - Query parameters
     * @param {string} pool - Rate limit pool to use ('general', 'book', 'trades')
     */
    async request(endpoint, params = {}, pool = 'general') {
        // Wait for rate limit token
        const limiter = this.rateLimiters[pool];
        if (!limiter) {
            throw new Error(`Unknown rate limit pool: ${pool}`);
        }
        await limiter.acquire();

        // Build URL with query parameters
        const url = new URL(endpoint, this.baseUrl);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, String(value));
            }
        });

        let attempt = 0;
        const maxAttempts = 6; // Allows for backoff up to 32 seconds

        while (attempt < maxAttempts) {
            try {
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                // Handle rate limit errors with exponential backoff
                if (response.status === 429) {
                    const backoffDelay = this.calculateBackoff(attempt);
                    attempt++;

                    if (attempt >= maxAttempts) {
                        throw new ClobApiError(
                            `Rate limited after ${maxAttempts} attempts`,
                            429,
                            null
                        );
                    }

                    await this.sleep(backoffDelay);
                    continue;
                }

                // Handle other errors
                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new ClobApiError(
                        `CLOB API error: ${response.status} ${response.statusText}`,
                        response.status,
                        errorBody
                    );
                }

                return await response.json();
            } catch (error) {
                // Re-throw ClobApiError
                if (error instanceof ClobApiError) {
                    throw error;
                }

                // Handle network errors
                throw new ClobApiError(
                    `Network error: ${error.message}`,
                    null,
                    null
                );
            }
        }
    }

    /**
     * Get order book for a token
     * @param {string} tokenId - The token ID (condition ID)
     * @param {number} level - Order book depth level (optional)
     * @returns {Promise<Object>} Order book data with bids and asks
     */
    async getOrderBook(tokenId, level) {
        const params = { token_id: tokenId };
        if (level !== undefined) {
            params.level = level;
        }
        return this.request('/book', params, 'book');
    }

    /**
     * Get trades for a market or maker
     * @param {Object} params - Query parameters
     * @param {string} [params.maker] - Filter by maker address
     * @param {string} [params.market] - Filter by market/token ID
     * @param {number} [params.limit] - Maximum number of trades to return
     * @param {string} [params.before] - Cursor for pagination (trade ID)
     * @param {string} [params.after] - Cursor for pagination (trade ID)
     * @returns {Promise<Array>} Array of trade objects
     */
    async getTrades(params = {}) {
        const queryParams = {};

        if (params.maker) {
            queryParams.maker = params.maker;
        }
        if (params.market) {
            queryParams.market = params.market;
        }
        if (params.limit !== undefined) {
            queryParams.limit = params.limit;
        }
        if (params.before) {
            queryParams.before = params.before;
        }
        if (params.after) {
            queryParams.after = params.after;
        }

        return this.request('/trades', queryParams, 'trades');
    }

    /**
     * Get current price for a token
     * @param {string} tokenId - The token ID
     * @param {string} side - 'buy' or 'sell'
     * @returns {Promise<Object>} Price data
     */
    async getPrice(tokenId, side) {
        const params = { token_id: tokenId };
        if (side) {
            params.side = side;
        }
        return this.request('/price', params, 'general');
    }

    /**
     * Get midpoint price for a token
     * @param {string} tokenId - The token ID
     * @returns {Promise<Object>} Midpoint price data
     */
    async getMidpoint(tokenId) {
        return this.request('/midpoint', { token_id: tokenId }, 'general');
    }
}

// Create singleton instance
const clobClient = new ClobClient();

module.exports = {
    ClobClient,
    clobClient,
    ClobApiError
};
