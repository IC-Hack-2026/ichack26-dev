'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function Header() {
    const [time, setTime] = useState('');

    useEffect(() => {
        const updateTime = () => {
            setTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
        };
        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <header className="header">
            <div className="header-left">
                <Link href="/" className="logo">
                    <span className="logo-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v6l4 2" />
                        </svg>
                    </span>
                    FUTURO<span className="logo-accent">.</span>
                </Link>
            </div>

            <nav className="header-nav">
                <Link href="/" className="nav-link">Home</Link>
                <Link href="/category/politics" className="nav-link">Politics</Link>
                <Link href="/category/crypto" className="nav-link">Crypto</Link>
                <Link href="/category/sports" className="nav-link">Sports</Link>
                <Link href="/category/finance" className="nav-link">Finance</Link>
            </nav>

            <div className="header-right">
                <div className="status-badge">
                    <span className="status-dot"></span>
                    <span>LIVE</span>
                </div>
                <span className="header-time">{time}</span>
            </div>
        </header>
    );
}
