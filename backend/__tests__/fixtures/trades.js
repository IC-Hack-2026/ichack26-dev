// Test fixtures for trade data

// Trade from a fresh wallet making a large purchase
const freshWalletLargeTrade = {
    id: 'trade-fresh-large-001',
    tokenId: 'token-123',
    price: 0.65,
    size: 500,
    side: 'BUY',
    maker: '0xfreshwallet001',
    taker: '0xmarketmaker001',
    timestamp: new Date().toISOString()
};

// Trade from an established wallet
const establishedWalletTrade = {
    id: 'trade-established-001',
    tokenId: 'token-123',
    price: 0.65,
    size: 500,
    side: 'BUY',
    maker: '0xestablishedwallet001',
    taker: '0xmarketmaker001',
    timestamp: new Date().toISOString()
};

// Small trade from fresh wallet
const freshWalletSmallTrade = {
    id: 'trade-fresh-small-001',
    tokenId: 'token-123',
    price: 0.65,
    size: 10,
    side: 'BUY',
    maker: '0xfreshwallet002',
    taker: '0xmarketmaker001',
    timestamp: new Date().toISOString()
};

// Trade with alternative field formats
const alternativeFormatTrade = {
    trade_id: 'trade-alt-001',
    asset_id: 'token-456',
    last_price: 0.72,
    amount: 200,
    is_buy: true,
    maker_address: '0xALT_WALLET_001',
    taker_address: '0xmarketmaker002',
    created_at: new Date().toISOString()
};

// Trade with camelCase format
const camelCaseTrade = {
    id: 'trade-camel-001',
    assetId: 'token-789',
    price: 0.55,
    quantity: 150,
    isBuy: false,
    maker: '0xcamelwallet001',
    taker: '0xmarketmaker003',
    createdAt: new Date().toISOString()
};

// Coordinated trades for sniper cluster testing (3 wallets, same direction)
function createCoordinatedTrades(baseTime = Date.now()) {
    return [
        {
            id: 'coord-trade-001',
            tokenId: 'token-cluster-001',
            price: 0.60,
            size: 100,
            side: 'YES',
            maker: '0xsniperA',
            timestamp: new Date(baseTime).toISOString()
        },
        {
            id: 'coord-trade-002',
            tokenId: 'token-cluster-001',
            price: 0.61,
            size: 150,
            side: 'YES',
            maker: '0xsniperB',
            timestamp: new Date(baseTime + 60000).toISOString() // 1 minute later
        },
        {
            id: 'coord-trade-003',
            tokenId: 'token-cluster-001',
            price: 0.62,
            size: 200,
            side: 'YES',
            maker: '0xsniperC',
            timestamp: new Date(baseTime + 120000).toISOString() // 2 minutes later
        }
    ];
}

// Trades spanning too much time for cluster detection
function createSpreadOutTrades(baseTime = Date.now()) {
    return [
        {
            id: 'spread-trade-001',
            tokenId: 'token-spread-001',
            price: 0.60,
            size: 100,
            side: 'YES',
            maker: '0xwallet1',
            timestamp: new Date(baseTime).toISOString()
        },
        {
            id: 'spread-trade-002',
            tokenId: 'token-spread-001',
            price: 0.61,
            size: 150,
            side: 'YES',
            maker: '0xwallet2',
            timestamp: new Date(baseTime + 10 * 60 * 1000).toISOString() // 10 minutes later
        },
        {
            id: 'spread-trade-003',
            tokenId: 'token-spread-001',
            price: 0.62,
            size: 200,
            side: 'YES',
            maker: '0xwallet3',
            timestamp: new Date(baseTime + 20 * 60 * 1000).toISOString() // 20 minutes later
        }
    ];
}

// Trades in opposite directions
function createMixedDirectionTrades(baseTime = Date.now()) {
    return [
        {
            id: 'mixed-trade-001',
            tokenId: 'token-mixed-001',
            price: 0.60,
            size: 100,
            side: 'YES',
            maker: '0xmixedA',
            timestamp: new Date(baseTime).toISOString()
        },
        {
            id: 'mixed-trade-002',
            tokenId: 'token-mixed-001',
            price: 0.59,
            size: 150,
            side: 'NO',
            maker: '0xmixedB',
            timestamp: new Date(baseTime + 60000).toISOString()
        },
        {
            id: 'mixed-trade-003',
            tokenId: 'token-mixed-001',
            price: 0.61,
            size: 200,
            side: 'YES',
            maker: '0xmixedC',
            timestamp: new Date(baseTime + 120000).toISOString()
        }
    ];
}

// Trades concentrated before resolution (for timing pattern)
function createConcentratedTrades(now = Date.now()) {
    const trades = [];
    // 20 trades in the last 6 hours
    for (let i = 0; i < 20; i++) {
        trades.push({
            id: `concentrated-recent-${i}`,
            tokenId: 'token-timing-001',
            price: 0.70 + (i * 0.01),
            size: 100,
            side: 'YES',
            maker: `0xtiming${i}`,
            timestamp: new Date(now - (i * 15 * 60 * 1000)).toISOString() // Every 15 minutes
        });
    }
    // 5 trades in the previous 18 hours
    for (let i = 0; i < 5; i++) {
        trades.push({
            id: `concentrated-old-${i}`,
            tokenId: 'token-timing-001',
            price: 0.65 + (i * 0.01),
            size: 100,
            side: 'YES',
            maker: `0xtimingold${i}`,
            timestamp: new Date(now - 6 * 60 * 60 * 1000 - (i * 3 * 60 * 60 * 1000)).toISOString()
        });
    }
    return trades;
}

module.exports = {
    freshWalletLargeTrade,
    establishedWalletTrade,
    freshWalletSmallTrade,
    alternativeFormatTrade,
    camelCaseTrade,
    createCoordinatedTrades,
    createSpreadOutTrades,
    createMixedDirectionTrades,
    createConcentratedTrades
};
