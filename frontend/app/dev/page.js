'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '../../components/layout/Header';
import { fetchWhaleTrades, fetchStreamStatus } from '../../lib/api';

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

function formatPrice(price) {
    if (price === null || price === undefined) return '-';
    return `$${parseFloat(price).toFixed(4)}`;
}

function formatVolume(size) {
    if (size === null || size === undefined) return '-';
    const num = parseFloat(size);
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
}

function formatNotional(notional) {
    if (notional === null || notional === undefined) return '-';
    const num = parseFloat(notional);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
}

function formatDelta(delta) {
    if (delta === null || delta === undefined) return '-';
    const percent = (delta * 100).toFixed(1);
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${percent}%`;
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
    const [whaleTrades, setWhaleTrades] = useState([]);
    const [streamStatus, setStreamStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const [tradesData, statusData] = await Promise.all([
                fetchWhaleTrades({ limit: 50 }),
                fetchStreamStatus(),
            ]);

            setWhaleTrades(tradesData.trades || []);
            setStreamStatus(statusData);
            setLastUpdated(Date.now());
            setError(null);
        } catch (err) {
            console.error('Failed to fetch data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-refresh every 3 seconds
    useEffect(() => {
        const interval = setInterval(fetchData, 3000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Update "time ago" display
    const [, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const timeSinceUpdate = lastUpdated ? Date.now() - lastUpdated : null;

    return (
        <div className="page">
            <Header />

            <main className="main">
                <section className="dev-panel">
                    <div className="dev-header">
                        <h1>Anomalies Panel</h1>
                        <StreamStatusBadge status={streamStatus} />
                    </div>

                    <div className="dev-metrics">
                        <div className="metric-card">
                            <div className="metric-card-label">Whale Trades</div>
                            <div className="metric-card-value">{whaleTrades.length}</div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-card-label">Total Detected</div>
                            <div className="metric-card-value">
                                {streamStatus?.detectedWhaleTrades?.toLocaleString() || '0'}
                            </div>
                        </div>
                        <div className="metric-card">
                            <div className="metric-card-label">Trades Processed</div>
                            <div className="metric-card-value">
                                {streamStatus?.processedTrades?.toLocaleString() || '0'}
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
                            <span>Loading whale trades...</span>
                        </div>
                    ) : error ? (
                        <div className="dev-empty-state">
                            <p>Error: {error}</p>
                            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                                Make sure the backend is running and the internal API endpoints are available.
                            </p>
                        </div>
                    ) : whaleTrades.length === 0 ? (
                        <div className="dev-empty-state">
                            <p>No whale trades detected yet.</p>
                            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                                Whale trades will appear here when unusually large trades are detected.
                            </p>
                        </div>
                    ) : (
                        <div className="patterns-table">
                            <div className="patterns-table-header whale-header">
                                <span>Time</span>
                                <span>Event</span>
                                <span>Outcome</span>
                                <span>Side</span>
                                <span>Impact</span>
                                <span>Volume</span>
                                <span>Price</span>
                                <span>Notional</span>
                            </div>
                            {whaleTrades.map(trade => (
                                <div key={trade.id} className="pattern-row whale-row">
                                    <span className="pattern-time">
                                        {formatTime(trade.timestamp || trade.recordedAt)}
                                    </span>
                                    <span className="whale-event" title={trade.eventTitle || trade.assetId}>
                                        {trade.eventTitle || trade.assetId?.slice(0, 12) + '...'}
                                    </span>
                                    <span>
                                        <span className={`outcome-badge outcome-${trade.outcome?.toLowerCase()}`}>
                                            {trade.outcome || '-'}
                                        </span>
                                    </span>
                                    <span className={`pattern-direction ${trade.side?.toLowerCase()}`}>
                                        {trade.side}
                                    </span>
                                    <span className={`whale-delta ${trade.probabilityDelta >= 0 ? 'delta-positive' : 'delta-negative'}`}>
                                        {formatDelta(trade.probabilityDelta)}
                                    </span>
                                    <span className="whale-volume">
                                        {formatVolume(trade.size)}
                                    </span>
                                    <span className="whale-price">
                                        {formatPrice(trade.price)}
                                    </span>
                                    <span className="whale-notional">
                                        {formatNotional(trade.notional)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {timeSinceUpdate !== null && (
                        <div className="dev-refresh-info">
                            <span>Updated {formatTimeAgo(timeSinceUpdate)}</span>
                            <span>|</span>
                            <span>Auto-refresh every 3s</span>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}
