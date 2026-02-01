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
        clobUrl: 'https://clob.polymarket.com',
        wsUrl: 'wss://ws-subscriptions-clob.polymarket.com/ws/market'
    },

    // CLOB API Rate Limits
    clobRateLimits: {
        general: { requests: 9000, window: 10000 },
        book: { requests: 1500, window: 10000 },
        trades: { requests: 200, window: 10000 }
    },

    // Realtime/WebSocket settings
    realtime: {
        enabled: process.env.ENABLE_REALTIME !== 'false',
        reconnectAttempts: parseInt(process.env.WS_RECONNECT_ATTEMPTS) || 10,
        reconnectDelayMs: parseInt(process.env.WS_RECONNECT_DELAY) || 5000,
        heartbeatIntervalMs: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000
    },

    // Signal processor configurations
    signals: {
        freshWallet: {
            weight: parseFloat(process.env.SIGNAL_FRESH_WALLET_WEIGHT) || 0.15,
            maxAgeDays: parseInt(process.env.FRESH_WALLET_MAX_AGE_DAYS) || 7,
            maxTrades: parseInt(process.env.FRESH_WALLET_MAX_TRADES) || 10,
            minTradeSize: parseFloat(process.env.FRESH_WALLET_MIN_TRADE_SIZE) || 0.02
        },
        liquidityImpact: {
            weight: parseFloat(process.env.SIGNAL_LIQUIDITY_IMPACT_WEIGHT) || 0.12,
            threshold: parseFloat(process.env.LIQUIDITY_IMPACT_THRESHOLD) || 0.02
        },
        walletAccuracy: {
            weight: parseFloat(process.env.SIGNAL_WALLET_ACCURACY_WEIGHT) || 0.18,
            minWinRate: parseFloat(process.env.WALLET_ACCURACY_MIN_WIN_RATE) || 0.7,
            minResolvedPositions: parseInt(process.env.WALLET_ACCURACY_MIN_POSITIONS) || 20
        },
        timingPattern: {
            weight: parseFloat(process.env.SIGNAL_TIMING_PATTERN_WEIGHT) || 0.14,
            windowHours: parseInt(process.env.TIMING_PATTERN_WINDOW_HOURS) || 48,
            concentrationThreshold: parseFloat(process.env.TIMING_CONCENTRATION_THRESHOLD) || 2
        },
        sniperCluster: {
            weight: parseFloat(process.env.SIGNAL_SNIPER_CLUSTER_WEIGHT) || 0.16,
            windowMinutes: parseInt(process.env.SNIPER_CLUSTER_WINDOW_MINUTES) || 5,
            minWallets: parseInt(process.env.SNIPER_CLUSTER_MIN_WALLETS) || 3
        }
    },

    // Wallet tracking settings
    wallet: {
        profileRefreshIntervalMs: parseInt(process.env.WALLET_PROFILE_REFRESH_MS) || 3600000,
        historyLookbackDays: parseInt(process.env.WALLET_HISTORY_LOOKBACK_DAYS) || 90,
        maxTrackedWallets: parseInt(process.env.MAX_TRACKED_WALLETS) || 10000
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
    },

    // RAG (Related News Search) settings
    rag: {
        enabled: process.env.BRAVE_SEARCH_API_KEY || process.env.TAVILY_API_KEY ? true : false,
        maxResults: parseInt(process.env.RAG_MAX_RESULTS) || 5,
        generateSummaries: process.env.RAG_GENERATE_SUMMARIES !== 'false'
    }
};
