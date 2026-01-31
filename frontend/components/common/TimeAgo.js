'use client';

import { useState, useEffect } from 'react';

export default function TimeAgo({ date }) {
    const [timeAgo, setTimeAgo] = useState('');

    useEffect(() => {
        const calculateTimeAgo = () => {
            if (!date) return '';

            const now = new Date();
            const past = new Date(date);
            const diffMs = now - past;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;

            return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        };

        setTimeAgo(calculateTimeAgo());

        const interval = setInterval(() => {
            setTimeAgo(calculateTimeAgo());
        }, 60000);

        return () => clearInterval(interval);
    }, [date]);

    return <span className="time-ago">{timeAgo}</span>;
}
