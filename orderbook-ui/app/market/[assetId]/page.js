'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import OrderBookTable from '@/components/OrderBookTable';
import SpreadIndicator from '@/components/SpreadIndicator';
import { fetchOrderBook } from '@/lib/api';

export default function MarketDetail({ params }) {
    const resolvedParams = use(params);
    const assetId = decodeURIComponent(resolvedParams.assetId);

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        try {
            const result = await fetchOrderBook(assetId);
            setData(result);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();

        // Auto-refresh every 2 seconds
        const interval = setInterval(loadData, 2000);

        return () => clearInterval(interval);
    }, [assetId]);

    if (loading && !data) {
        return (
            <div className="loading">
                Loading order book...
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="market-detail">
                <div className="market-detail-header">
                    <Link href="/" className="back-link">Back to Dashboard</Link>
                </div>
                <div className="error">
                    Error: {error}
                </div>
            </div>
        );
    }

    const { bids = [], asks = [], stats = {}, eventTitle, outcome } = data || {};

    const getOutcomeClass = (out) => {
        if (!out) return '';
        const lower = out.toLowerCase();
        if (lower === 'yes') return 'outcome-yes';
        if (lower === 'no') return 'outcome-no';
        return '';
    };

    return (
        <div className="market-detail">
            <div className="market-detail-header">
                <div>
                    <Link href="/" className="back-link">Back to Dashboard</Link>
                    {eventTitle ? (
                        <>
                            <h1 className="event-title">
                                {eventTitle}
                                {outcome && (
                                    <span className={`outcome-badge-large ${getOutcomeClass(outcome)}`}>
                                        {outcome}
                                    </span>
                                )}
                            </h1>
                            <p className="asset-id-subtitle">{assetId}</p>
                        </>
                    ) : (
                        <h1>{assetId}</h1>
                    )}
                </div>
                <div className="refresh-indicator">
                    <span className="refresh-dot"></span>
                    <span>Live - Updates every 2s</span>
                </div>
            </div>

            <SpreadIndicator
                spread={stats.spread}
                spreadPercent={stats.spreadPercent}
                midPrice={stats.midPrice}
            />

            <div className="stats-summary">
                <div className="spread-indicator">
                    <div className="spread-item">
                        <span className="spread-label">Bid Levels</span>
                        <span className="spread-value">{stats.bidLevels || 0}</span>
                    </div>
                    <div className="spread-item">
                        <span className="spread-label">Ask Levels</span>
                        <span className="spread-value">{stats.askLevels || 0}</span>
                    </div>
                    <div className="spread-item">
                        <span className="spread-label">Bid Total</span>
                        <span className="spread-value">{formatSize(stats.bidTotal)}</span>
                    </div>
                    <div className="spread-item">
                        <span className="spread-label">Ask Total</span>
                        <span className="spread-value">{formatSize(stats.askTotal)}</span>
                    </div>
                    <div className="spread-item">
                        <span className="spread-label">Imbalance</span>
                        <span className="spread-value" style={{
                            color: stats.imbalance > 0.1 ? 'var(--color-bid)' :
                                   stats.imbalance < -0.1 ? 'var(--color-ask)' : 'inherit'
                        }}>
                            {((stats.imbalance || 0) * 100).toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>

            <OrderBookTable bids={bids} asks={asks} />
        </div>
    );
}

function formatSize(size) {
    if (size === null || size === undefined) return '-';
    if (size >= 1000000) return (size / 1000000).toFixed(2) + 'M';
    if (size >= 1000) return (size / 1000).toFixed(2) + 'K';
    return size.toFixed(2);
}
