// Environment configuration
// All environment variables centralized here for easy management

module.exports = {
    // Server
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',

    // Database (PostgreSQL - optional for MVP)
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'futuro_news',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        // Use in-memory store if no database configured
        useInMemory: !process.env.DB_HOST
    },

    // Redis (optional for MVP)
    redis: {
        url: process.env.REDIS_URL || null,
        // Use in-memory cache if no Redis configured
        useInMemory: !process.env.REDIS_URL
    },

    // OpenAI
    openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    },

    // Polymarket API
    polymarket: {
        baseUrl: 'https://gamma-api.polymarket.com',
        clobUrl: 'https://clob.polymarket.com'
    },

    // Cache settings
    cache: {
        articleTTL: 15 * 60 * 1000, // 15 minutes
        marketTTL: 5 * 60 * 1000,   // 5 minutes
        eventTTL: 10 * 60 * 1000    // 10 minutes
    },

    // Article generation settings
    article: {
        maxLength: 800,
        summaryLength: 150
    }
};
