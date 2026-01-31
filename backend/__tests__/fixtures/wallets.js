// Test fixtures for wallet profiles

// Fresh wallet (1 day old, 2 trades)
const freshWalletProfile = {
    address: '0xfreshwallet001',
    firstTradeAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    lastTradeAt: new Date().toISOString(),
    totalTrades: 2,
    totalVolume: 1000,
    avgTradeSize: 500,
    maxTradeSize: 600,
    resolvedPositions: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    riskScore: 0.3,
    suspiciousFlags: []
};

// Very fresh wallet (less than 1 day, 1 trade)
const veryFreshWalletProfile = {
    address: '0xveryfreshwallet001',
    firstTradeAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    lastTradeAt: new Date().toISOString(),
    totalTrades: 1,
    totalVolume: 500,
    avgTradeSize: 500,
    maxTradeSize: 500,
    resolvedPositions: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    riskScore: 0.5,
    suspiciousFlags: []
};

// Established wallet (30 days old, many trades)
const establishedWalletProfile = {
    address: '0xestablishedwallet001',
    firstTradeAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    lastTradeAt: new Date().toISOString(),
    totalTrades: 150,
    totalVolume: 50000,
    avgTradeSize: 333,
    maxTradeSize: 2000,
    resolvedPositions: 20,
    wins: 12,
    losses: 8,
    winRate: 0.6,
    riskScore: 0.1,
    suspiciousFlags: []
};

// High accuracy wallet (potential insider)
const highAccuracyWalletProfile = {
    address: '0xhighaccuracywallet001',
    firstTradeAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
    lastTradeAt: new Date().toISOString(),
    totalTrades: 100,
    totalVolume: 80000,
    avgTradeSize: 800,
    maxTradeSize: 5000,
    resolvedPositions: 50,
    wins: 45,
    losses: 5,
    winRate: 0.9,
    avgProfit: 150,
    riskScore: 0.8,
    suspiciousFlags: ['high_win_rate']
};

// Wallet with suspicious flags
const suspiciousWalletProfile = {
    address: '0xsuspiciouswallet001',
    firstTradeAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    lastTradeAt: new Date().toISOString(),
    totalTrades: 25,
    totalVolume: 20000,
    avgTradeSize: 800,
    maxTradeSize: 5000,
    resolvedPositions: 5,
    wins: 5,
    losses: 0,
    winRate: 1.0,
    riskScore: 0.9,
    suspiciousFlags: ['fresh_wallet_large_trade', 'unusual_trade_size']
};

// Wallet aged exactly at threshold (7 days)
const thresholdAgeWalletProfile = {
    address: '0xthresholdagewallet001',
    firstTradeAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago exactly
    lastTradeAt: new Date().toISOString(),
    totalTrades: 10,
    totalVolume: 5000,
    avgTradeSize: 500,
    maxTradeSize: 1000,
    resolvedPositions: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    riskScore: 0.2,
    suspiciousFlags: []
};

// New wallet profile (no trades yet)
const newWalletProfile = {
    address: '0xnewwallet001',
    firstTradeAt: null,
    lastTradeAt: null,
    totalTrades: 0,
    totalVolume: 0,
    avgTradeSize: 0,
    maxTradeSize: 0,
    resolvedPositions: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    riskScore: 0,
    suspiciousFlags: []
};

module.exports = {
    freshWalletProfile,
    veryFreshWalletProfile,
    establishedWalletProfile,
    highAccuracyWalletProfile,
    suspiciousWalletProfile,
    thresholdAgeWalletProfile,
    newWalletProfile
};
