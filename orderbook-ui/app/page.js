'use client';

import { useState, useEffect } from 'react';
import MarketCard from '@/components/MarketCard';
import { fetchAllOrderBooks } from '@/lib/api';

export default function Dashboard() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);

    const loadData = async () => {
        try {
            const result = await fetchAllOrderBooks();
            setData(result);
            setError(null);
            setLastUpdate(new Date());
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
    }, []);

    if (loading && !data) {
        return (
            <div className="loading">
                Loading order books...
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="error">
                Error: {error}
            </div>
        );
    }

    const orderBooks = data?.orderBooks || [];

    return (
        <div className="dashboard">
            <div className="dashboard-header">
                <h1>Order Books</h1>
                <div className="dashboard-stats">
                    <span>
                        <span className="refresh-dot"></span>
                        Live
                    </span>
                    <span>{data?.count || 0} Markets</span>
                    <span>{data?.initializedCount || 0} Active</span>
                    <span>{data?.totalBidLevels || 0} Bid Levels</span>
                    <span>{data?.totalAskLevels || 0} Ask Levels</span>
                </div>
            </div>

            {orderBooks.length === 0 ? (
                <div className="empty-state">
                    <p>No order books available.</p>
                    <p>Make sure the backend is running and has active WebSocket subscriptions.</p>
                </div>
            ) : (
                <div className="market-grid">
                    {orderBooks.map((orderBook) => (
                        <MarketCard key={orderBook.assetId} orderBook={orderBook} />
                    ))}
                </div>
            )}
        </div>
    );
}
