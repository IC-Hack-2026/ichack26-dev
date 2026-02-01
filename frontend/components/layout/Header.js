'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { fetchCategories } from '../../lib/api';

export default function Header() {
    const [date, setDate] = useState('');
    const [categories, setCategories] = useState([]);

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

    useEffect(() => {
        fetchCategories()
            .then(data => setCategories(data.categories || []))
            .catch(() => setCategories([]));
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
                {categories.map(cat => (
                    <Link key={cat.name} href={`/category/${cat.name.toLowerCase()}`} className="nav-link">
                        {cat.name}
                    </Link>
                ))}
                <Link href="/dev" className="nav-link nav-link-dev">Anomalies</Link>
            </nav>
        </header>
    );
}
