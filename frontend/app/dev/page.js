'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '../../components/layout/Header';
import { fetchRealtimeSignals, fetchStreamStatus } from '../../lib/api';

const PATTERN_TYPES = [
    { id: 'all', label: 'All' },
    { id: 'fresh-wallet', label: 'Fresh Wallet' },
    { id: 'liquidity-impact', label: 'Liquidity Impact' },
    { id: 'wallet-accuracy', label: 'Wallet Accuracy' },
    { id: 'timing-pattern', label: 'Timing Pattern' },
    { id: 'sniper-cluster', label: 'Sniper Cluster' },
];

function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatTimeAgo(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

function formatMetadata(pattern) {
    const { metadata, type } = pattern;
    if (!metadata) return '-';

    switch (type) {
        case 'fresh-wallet':
            return `Age: ${metadata.walletAge?.toFixed(1) || '?'}d | Trades: ${metadata.totalTrades || '?'} | Size: $${metadata.tradeSize?.toLocaleString() || '?'}`;
        case 'liquidity-impact':
            return `Impact: ${metadata.liquidityPercent || '?'} | Size: $${metadata.tradeSize?.toLocaleString() || '?'}`;
        case 'wallet-accuracy':
            return `Win Rate: ${metadata.winRate ? (metadata.winRate * 100).toFixed(1) + '%' : '?'} | Trades: ${metadata.totalTrades || '?'}`;
        case 'timing-pattern':
            return `Before Resolution: ${metadata.hoursBeforeResolution || '?'}h | Trades: ${metadata.tradeCount || '?'}`;
        case 'sniper-cluster':
            return `Wallets: ${metadata.walletCount || '?'} | Window: ${metadata.timeWindow || '?'}s`;
        default:
            return JSON.stringify(metadata).slice(0, 50);
    }
}

function StreamStatusBadge({ status }) {
    const isOnline = status?.running;

    return (
        <div className={`stream-status ${isOnline ? 'stream-online' : 'stream-offline'}`}>
            <span className="stream-status-dot"></span>
            <span>{isOnline ? 'Stream Online' : 'Stream Offline'}</span>
            {isOnline && status?.processedTrades !== undefined && (
                <span style={{ marginLeft: '0.5rem', opacity: 0.8 }}>
                    ({status.processedTrades.toLocaleString()} trades)
                </span>
            )}
        </div>
    );
}

export default function DevPanel() {
    const [patterns, setPatterns] = useState([]);
    const [streamStatus, setStreamStatus] = useState(null);
    const [filterType, setFilterType] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const [signalsData, statusData] = await Promise.all([
                fetchRealtimeSignals({ limit: 50, type: filterType === 'all' ? null : filterType }),
                fetchStreamStatus(),
            ]);

            setPatterns(signalsData.patterns || []);
            setStreamStatus(statusData);
            setLastUpdated(Date.now());
            setError(null);
        } catch (err) {
            console.error('Failed to fetch data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [filterType]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Update "time ago" display
    const [, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const highSeverityCount = patterns.filter(p => p.severity === 'HIGH').length;
    const timeSinceUpdate = lastUpdated ? Date.now() - lastUpdated : null;

    return (
        <div className="page">
            <Header />

            <main className="main">
                <section className="dev-panel">
                    <div className="dev-header">
                        <h1>Developer Panel</h1>
                        <StreamStatusBadge status={streamStatus} />
                    </div>

                    <div className="dev-filters">
                        {PATTERN_TYPES.map(type => (
                            <button
                                key={type.id}
                                className={`dev-filter-btn ${filterType === type.id ? 'active' : ''}`}
                                onClick={() => setFilterType(type.id)}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>

                    <div className="dev-metrics">
                        <div className="metric-card">
                            <div className="metric-card-label">Total Patterns</div>
                            <div className="metric-card-value">{patterns.length}</div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-card-label">High Severity</div>
                            <div className={`metric-card-value ${highSeverityCount > 0 ? 'high-severity' : ''}`}>
                                {highSeverityCount}
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-card-label">Signals Detected</div>
                            <div className="metric-card-value">
                                {streamStatus?.detectedSignals?.toLocaleString() || '0'}
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-card-label">Subscriptions</div>
                            <div className="metric-card-value">
                                {streamStatus?.subscriptionCount || '0'}
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading">
                            <div className="loading-spinner"></div>
                            <span>Loading patterns...</span>
                        </div>
                    ) : error ? (
                        <div className="dev-empty-state">
                            <p>Error: {error}</p>
                            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                                Make sure the backend is running and the internal API endpoints are available.
                            </p>
                        </div>
                    ) : patterns.length === 0 ? (
                        <div className="dev-empty-state">
                            <p>No anomalous patterns detected yet.</p>
                            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                                Patterns will appear here when the stream processor detects suspicious trading activity.
                            </p>
                        </div>
                    ) : (
                        <div className="patterns-table">
                            <div className="patterns-table-header">
                                <span>Time</span>
                                <span>Type</span>
                                <span>Severity</span>
                                <span>Confidence</span>
                                <span>Direction</span>
                                <span>Metadata</span>
                            </div>
                            {patterns.map(pattern => (
                                <div key={pattern.id} className="pattern-row">
                                    <span className="pattern-time">
                                        {formatTime(pattern.detectedAt)}
                                    </span>
                                    <span>
                                        <span className={`pattern-type-badge pattern-type-${pattern.type}`}>
                                            {pattern.type.replace(/-/g, ' ')}
                                        </span>
                                    </span>
                                    <span>
                                        <span className={`severity-badge severity-${pattern.severity?.toLowerCase()}`}>
                                            {pattern.severity}
                                        </span>
                                    </span>
                                    <span className="pattern-confidence">
                                        {(pattern.confidence * 100).toFixed(0)}%
                                    </span>
                                    <span className={`pattern-direction ${pattern.direction?.toLowerCase()}`}>
                                        {pattern.direction}
                                    </span>
                                    <span className="pattern-metadata" title={JSON.stringify(pattern.metadata, null, 2)}>
                                        {formatMetadata(pattern)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {timeSinceUpdate !== null && (
                        <div className="dev-refresh-info">
                            <span>Updated {formatTimeAgo(timeSinceUpdate)}</span>
                            <span>|</span>
                            <span>Auto-refresh every 30s</span>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
