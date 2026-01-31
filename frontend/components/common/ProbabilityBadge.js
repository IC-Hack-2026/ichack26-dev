'use client';

import { useEffect, useState } from 'react';

export default function ProbabilityBadge({ probability, size = 'medium' }) {
    if (probability === null || probability === undefined) return null;

    const percent = Math.round(probability * 100);
    const [pulse, setPulse] = useState(false);

    useEffect(() => {
        setPulse(true);
        const timeout = setTimeout(() => setPulse(false), 650);
        return () => clearTimeout(timeout);
    }, [percent]);

    const getColorClass = () => {
        if (percent >= 80) return 'prob-high';
        if (percent >= 50) return 'prob-medium';
        if (percent >= 20) return 'prob-low';
        return 'prob-very-low';
    };

    const sizeClass = size === 'large' ? 'badge-large' : size === 'small' ? 'badge-small' : '';

    return (
        <div className={`probability-badge ${getColorClass()} ${sizeClass} ${pulse ? 'badge-pulse' : ''}`}>
            <span className="badge-value">{percent}%</span>
            <span className="badge-label">likely</span>
        </div>
    );
}
