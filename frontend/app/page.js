'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
    const [markets, setMarkets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMarket, setSelectedMarket] = useState(null);
    const [sortBy, setSortBy] = useState('probability');

    useEffect(() => {
        fetchMarkets();
    }, [sortBy]);

    const fetchMarkets = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/markets?limit=30&sortBy=${sortBy}`);
            const data = await res.json();
            setMarkets(data.markets || []);
        } catch (error) {
            console.error('Failed to fetch markets:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatProbability = (prob) => {
        if (prob === null || prob === undefined) return '—';
        return `${(prob * 100).toFixed(1)}%`;
    };

    const formatVolume = (vol) => {
        if (!vol) return '$0';
        if (vol >= 1000000) return `$${(vol / 1000000).toFixed(2)}M`;
        if (vol >= 1000) return `$${(vol / 1000).toFixed(1)}K`;
        return `$${vol.toFixed(0)}`;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getProbabilityColor = (prob) => {
        if (prob >= 0.8) return 'prob-high';
        if (prob >= 0.5) return 'prob-medium';
        if (prob >= 0.2) return 'prob-low';
        return 'prob-very-low';
    };

    return (
        <div className="page">
            <header className="header">
                <div className="header-left">
                    <h1 className="logo">
                        <span className="logo-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 3v18h18" />
                                <path d="M18 9l-5-6-4 8-3-2" />
                            </svg>
                        </span>
                        ORACLE<span className="logo-accent">.</span>
                    </h1>
                </div>
                <div className="header-center">
                    <div className="status-badge">
                        <span className="status-dot"></span>
                        <span>LIVE</span>
                    </div>
                </div>
                <div className="header-right">
                    <span className="header-time">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            </header>

            <main className="main">
                <aside className="sidebar">
                    <div className="sidebar-section">
                        <h2 className="sidebar-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 6v6l4 2" />
                            </svg>
                            Markets
                        </h2>
                        <div className="stats-row">
                            <div className="stat-item">
                                <span className="stat-value glow-cyan">{markets.length}</span>
                                <span className="stat-label">Active</span>
                            </div>
                        </div>
                    </div>

                    <div className="sidebar-section">
                        <h2 className="sidebar-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M6 12h12M9 18h6" />
                            </svg>
                            Sort By
                        </h2>
                        <div className="sort-buttons">
                            <button
                                className={`sort-btn ${sortBy === 'probability' ? 'active' : ''}`}
                                onClick={() => setSortBy('probability')}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                                Probability
                            </button>
                            <button
                                className={`sort-btn ${sortBy === 'volume' ? 'active' : ''}`}
                                onClick={() => setSortBy('volume')}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                                </svg>
                                Volume
                            </button>
                        </div>
                    </div>

                    <div className="sidebar-section sidebar-footer">
                        <div className="powered-by">
                            <span>Data from</span>
                            <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="polymarket-link">
                                Polymarket
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                                </svg>
                            </a>
                        </div>
                    </div>
                </aside>

                <section className={`content ${selectedMarket ? 'with-detail' : ''}`}>
                    <div className="content-header">
                        <div>
                            <h2 className="content-title">Prediction Markets</h2>
                            <p className="content-subtitle">Real-time probabilities from crowd intelligence</p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading">
                            <div className="loading-spinner"></div>
                            <span>Fetching markets...</span>
                        </div>
                    ) : (
                        <div className="markets-list">
                            {markets.map((market, index) => (
                                <MarketRow
                                    key={market.id}
                                    market={market}
                                    index={index}
                                    isSelected={selectedMarket?.id === market.id}
                                    onClick={() => setSelectedMarket(selectedMarket?.id === market.id ? null : market)}
                                    formatProbability={formatProbability}
                                    formatVolume={formatVolume}
                                    getProbabilityColor={getProbabilityColor}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {selectedMarket && (
                    <aside className="detail-panel">
                        <div className="detail-header">
                            <h3 className="detail-title">Market Details</h3>
                            <button className="close-btn" onClick={() => setSelectedMarket(null)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="detail-content">
                            {selectedMarket.image && (
                                <div className="detail-image">
                                    <img src={selectedMarket.image} alt="" />
                                </div>
                            )}

                            <h4 className="detail-question">{selectedMarket.question}</h4>

                            <div className="detail-outcomes">
                                {selectedMarket.outcomes?.map((outcome, i) => (
                                    <div key={i} className={`outcome-bar ${i === 0 ? 'primary' : 'secondary'}`}>
                                        <div className="outcome-info">
                                            <span className="outcome-name">{outcome.name}</span>
                                            <span className="outcome-prob">{formatProbability(outcome.probability)}</span>
                                        </div>
                                        <div className="outcome-track">
                                            <div
                                                className="outcome-fill"
                                                style={{ width: `${(outcome.probability || 0) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="detail-stats">
                                <div className="detail-stat">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                                    </svg>
                                    <div>
                                        <span className="stat-label">24h Volume</span>
                                        <span className="stat-value">{formatVolume(selectedMarket.volume24hr)}</span>
                                    </div>
                                </div>
                                <div className="detail-stat">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                                    </svg>
                                    <div>
                                        <span className="stat-label">Total Volume</span>
                                        <span className="stat-value">{formatVolume(selectedMarket.totalVolume)}</span>
                                    </div>
                                </div>
                                <div className="detail-stat">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        <path d="M9 12l2 2 4-4" />
                                    </svg>
                                    <div>
                                        <span className="stat-label">Liquidity</span>
                                        <span className="stat-value">{formatVolume(selectedMarket.liquidity)}</span>
                                    </div>
                                </div>
                                <div className="detail-stat">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                        <line x1="16" y1="2" x2="16" y2="6" />
                                        <line x1="8" y1="2" x2="8" y2="6" />
                                        <line x1="3" y1="10" x2="21" y2="10" />
                                    </svg>
                                    <div>
                                        <span className="stat-label">End Date</span>
                                        <span className="stat-value">{formatDate(selectedMarket.endDate)}</span>
                                    </div>
                                </div>
                            </div>

                            <a
                                href={selectedMarket.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="trade-btn"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                                </svg>
                                Trade on Polymarket
                            </a>
                        </div>
                    </aside>
                )}
            </main>
        </div>
    );
}

function MarketRow({ market, index, isSelected, onClick, formatProbability, formatVolume, getProbabilityColor }) {
    const probability = market.probability;
    const probClass = getProbabilityColor(probability);

    return (
        <div
            className={`market-row ${isSelected ? 'selected' : ''}`}
            onClick={onClick}
            style={{ animationDelay: `${index * 30}ms` }}
        >
            <div className="market-rank">
                {index + 1}
            </div>

            <div className="market-info">
                <h3 className="market-question">{market.question}</h3>
                <div className="market-meta">
                    <span className="market-volume">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                        {formatVolume(market.volume24hr)} 24h
                    </span>
                </div>
            </div>

            <div className="market-probability">
                <div className={`prob-display ${probClass}`}>
                    <span className="prob-value">{formatProbability(probability)}</span>
                    <span className="prob-label">
                        {market.outcomes?.[0]?.name || 'Yes'}
                    </span>
                </div>
                <div className="prob-bar-container">
                    <div
                        className={`prob-bar ${probClass}`}
                        style={{ width: `${(probability || 0) * 100}%` }}
                    />
                </div>
            </div>

            <div className="market-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                </svg>
            </div>
        </div>
    );
}
