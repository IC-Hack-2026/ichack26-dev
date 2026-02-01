'use client';

import Link from 'next/link';

export default function MarketCard({ orderBook }) {
    const {
        assetId,
        initialized,
        bidLevels,
        askLevels,
        bestBid,
        bestAsk,
        spreadPercent,
        imbalance
    } = orderBook;

    const formatPrice = (price) => {
        if (price === null || price === undefined) return '-';
        return price.toFixed(4);
    };

    const truncateId = (id) => {
        if (!id) return '-';
        if (id.length <= 16) return id;
        return id.slice(0, 8) + '...' + id.slice(-6);
    };

    const getImbalanceColor = (imb) => {
        if (imb > 0.2) return 'var(--color-bid)';
        if (imb < -0.2) return 'var(--color-ask)';
        return 'var(--color-neutral)';
    };

    const getImbalanceLabel = (imb) => {
        if (imb > 0.3) return 'Strong Bid';
        if (imb > 0.1) return 'Bid';
        if (imb < -0.3) return 'Strong Ask';
        if (imb < -0.1) return 'Ask';
        return 'Balanced';
    };

    return (
        <Link href={`/market/${encodeURIComponent(assetId)}`} className="market-card">
            <div className="market-card-header">
                <span className="market-id" title={assetId}>{truncateId(assetId)}</span>
                <span className={`status ${initialized ? 'active' : 'inactive'}`}>
                    {initialized ? 'Live' : 'Pending'}
                </span>
            </div>

            <div className="market-card-body">
                <div className="price-row">
                    <div className="price-item bid">
                        <span className="price-label">Best Bid</span>
                        <span className="price-value">{formatPrice(bestBid)}</span>
                    </div>
                    <div className="price-item ask">
                        <span className="price-label">Best Ask</span>
                        <span className="price-value">{formatPrice(bestAsk)}</span>
                    </div>
                </div>

                <div className="stats-row">
                    <div className="stat-item">
                        <span className="stat-label">Spread</span>
                        <span className="stat-value">{spreadPercent?.toFixed(2) || '-'}%</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Levels</span>
                        <span className="stat-value">{bidLevels}/{askLevels}</span>
                    </div>
                </div>

                <div className="imbalance-row">
                    <span className="imbalance-label">Imbalance</span>
                    <span
                        className="imbalance-value"
                        style={{ color: getImbalanceColor(imbalance) }}
                    >
                        {getImbalanceLabel(imbalance)} ({(imbalance * 100).toFixed(1)}%)
                    </span>
                </div>
            </div>
        </Link>
    );
}
