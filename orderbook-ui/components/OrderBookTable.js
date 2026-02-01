'use client';

export default function OrderBookTable({ bids = [], asks = [] }) {
    const formatPrice = (price) => {
        if (price === null || price === undefined) return '-';
        return price.toFixed(4);
    };

    const formatSize = (size) => {
        if (size === null || size === undefined) return '-';
        if (size >= 1000000) return (size / 1000000).toFixed(2) + 'M';
        if (size >= 1000) return (size / 1000).toFixed(2) + 'K';
        return size.toFixed(2);
    };

    // Calculate cumulative totals
    const bidsWithTotal = [];
    let bidCumulative = 0;
    for (const bid of bids) {
        bidCumulative += bid.size;
        bidsWithTotal.push({ ...bid, total: bidCumulative });
    }

    const asksWithTotal = [];
    let askCumulative = 0;
    for (const ask of asks) {
        askCumulative += ask.size;
        asksWithTotal.push({ ...ask, total: askCumulative });
    }

    // Find max total for depth bars
    const maxBidTotal = bidsWithTotal.length > 0 ? bidsWithTotal[bidsWithTotal.length - 1].total : 0;
    const maxAskTotal = asksWithTotal.length > 0 ? asksWithTotal[asksWithTotal.length - 1].total : 0;
    const maxTotal = Math.max(maxBidTotal, maxAskTotal);

    // Pad arrays to same length for alignment
    const maxRows = Math.max(bidsWithTotal.length, asksWithTotal.length, 10);

    return (
        <div className="orderbook-table">
            <div className="orderbook-side bids">
                <div className="orderbook-header">
                    <span>Total</span>
                    <span>Size</span>
                    <span>Bid Price</span>
                </div>
                <div className="orderbook-rows">
                    {bidsWithTotal.map((bid, index) => {
                        const depthPercent = maxTotal > 0 ? (bid.total / maxTotal) * 100 : 0;
                        return (
                            <div
                                key={`bid-${index}`}
                                className={`orderbook-row ${index === 0 ? 'best' : ''}`}
                            >
                                <div
                                    className="depth-bar bid-bar"
                                    style={{ width: `${depthPercent}%` }}
                                />
                                <span className="cell total">{formatSize(bid.total)}</span>
                                <span className="cell size">{formatSize(bid.size)}</span>
                                <span className="cell price bid-price">{formatPrice(bid.price)}</span>
                            </div>
                        );
                    })}
                    {Array.from({ length: maxRows - bidsWithTotal.length }).map((_, i) => (
                        <div key={`bid-empty-${i}`} className="orderbook-row empty">
                            <span className="cell">-</span>
                            <span className="cell">-</span>
                            <span className="cell">-</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="orderbook-side asks">
                <div className="orderbook-header">
                    <span>Ask Price</span>
                    <span>Size</span>
                    <span>Total</span>
                </div>
                <div className="orderbook-rows">
                    {asksWithTotal.map((ask, index) => {
                        const depthPercent = maxTotal > 0 ? (ask.total / maxTotal) * 100 : 0;
                        return (
                            <div
                                key={`ask-${index}`}
                                className={`orderbook-row ${index === 0 ? 'best' : ''}`}
                            >
                                <div
                                    className="depth-bar ask-bar"
                                    style={{ width: `${depthPercent}%` }}
                                />
                                <span className="cell price ask-price">{formatPrice(ask.price)}</span>
                                <span className="cell size">{formatSize(ask.size)}</span>
                                <span className="cell total">{formatSize(ask.total)}</span>
                            </div>
                        );
                    })}
                    {Array.from({ length: maxRows - asksWithTotal.length }).map((_, i) => (
                        <div key={`ask-empty-${i}`} className="orderbook-row empty">
                            <span className="cell">-</span>
                            <span className="cell">-</span>
                            <span className="cell">-</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
