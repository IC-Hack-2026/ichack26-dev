'use client';

export default function SpreadIndicator({ spread, spreadPercent, midPrice }) {
    const formatPrice = (price) => {
        if (price === null || price === undefined) return '-';
        return price.toFixed(4);
    };

    const formatPercent = (pct) => {
        if (pct === null || pct === undefined) return '-';
        return pct.toFixed(2) + '%';
    };

    return (
        <div className="spread-indicator">
            <div className="spread-item">
                <span className="spread-label">Spread</span>
                <span className="spread-value">{formatPrice(spread)}</span>
            </div>
            <div className="spread-item">
                <span className="spread-label">Spread %</span>
                <span className="spread-value">{formatPercent(spreadPercent)}</span>
            </div>
            <div className="spread-item">
                <span className="spread-label">Mid Price</span>
                <span className="spread-value">{formatPrice(midPrice)}</span>
            </div>
        </div>
    );
}
