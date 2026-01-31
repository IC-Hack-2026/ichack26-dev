'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function Header() {
    const [date, setDate] = useState('');

    useEffect(() => {
        const updateDate = () => {
            setDate(new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }));
        };
        updateDate();
        const interval = setInterval(updateDate, 60000);
        return () => clearInterval(interval);
    }, []);

    return (
        <header className="header">
            <div className="header-top">
                <Link href="/" className="logo">FUTURO</Link>
                <div className="header-top-right">
                    <button type="button" className="live-button">Live</button>
                    <span className="header-date">{date}</span>
                </div>
            </div>

            <nav className="header-nav">
                <Link href="/" className="nav-link">Home</Link>
                <Link href="/category/politics" className="nav-link">Politics</Link>
                <Link href="/category/crypto" className="nav-link">Crypto</Link>
                <Link href="/category/sports" className="nav-link">Sports</Link>
                <Link href="/category/finance" className="nav-link">Finance</Link>
            </nav>
        </header>
    );
}
