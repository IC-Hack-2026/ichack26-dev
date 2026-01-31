// Test fixtures for market data

// Standard market with good liquidity
const standardMarket = {
    id: 'market-001',
    tokenId: 'token-123',
    question: 'Will event X happen?',
    liquidity: 50000,
    volume: 100000,
    probability: 0.65,
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
};

// Market close to resolution (for timing pattern testing)
const nearResolutionMarket = {
    id: 'market-near-resolution',
    tokenId: 'token-timing-001',
    question: 'Will event Y happen?',
    liquidity: 30000,
    volume: 80000,
    probability: 0.75,
    endDate: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() // 12 hours from now
};

// Market far from resolution
const farResolutionMarket = {
    id: 'market-far-resolution',
    tokenId: 'token-far-001',
    question: 'Will event Z happen?',
    liquidity: 40000,
    volume: 60000,
    probability: 0.50,
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
};

// Market without end date
const noEndDateMarket = {
    id: 'market-no-end',
    tokenId: 'token-no-end-001',
    question: 'Ongoing event market',
    liquidity: 25000,
    volume: 50000,
    probability: 0.55
};

// Market with resolutionDate instead of endDate
const resolutionDateMarket = {
    id: 'market-resolution-date',
    tokenId: 'token-resolution-001',
    question: 'Will event W happen?',
    liquidity: 35000,
    volume: 70000,
    probability: 0.80,
    resolutionDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
};

// Low liquidity market (for fresh wallet testing)
const lowLiquidityMarket = {
    id: 'market-low-liq',
    tokenId: 'token-low-liq-001',
    question: 'Low liquidity market?',
    liquidity: 5000,
    volume: 10000,
    probability: 0.40,
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
};

// High liquidity market
const highLiquidityMarket = {
    id: 'market-high-liq',
    tokenId: 'token-high-liq-001',
    question: 'High liquidity market?',
    liquidity: 500000,
    volume: 1000000,
    probability: 0.70,
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
};

// Zero liquidity market
const zeroLiquidityMarket = {
    id: 'market-zero-liq',
    tokenId: 'token-zero-liq-001',
    question: 'Zero liquidity market?',
    liquidity: 0,
    volume: 0,
    probability: 0.50
};

module.exports = {
    standardMarket,
    nearResolutionMarket,
    farResolutionMarket,
    noEndDateMarket,
    resolutionDateMarket,
    lowLiquidityMarket,
    highLiquidityMarket,
    zeroLiquidityMarket
};
