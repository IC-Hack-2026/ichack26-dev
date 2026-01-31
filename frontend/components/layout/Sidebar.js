'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Sidebar() {
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await fetch(`${API_URL}/api/categories`);
            const data = await res.json();
            setCategories(data.categories || []);
        } catch (error) {
            console.error('Failed to fetch categories:', error);
            // Default categories
            setCategories([
                { name: 'Politics', count: 0 },
                { name: 'Crypto', count: 0 },
                { name: 'Sports', count: 0 },
                { name: 'Finance', count: 0 },
                { name: 'Technology', count: 0 },
                { name: 'World', count: 0 }
            ]);
        }
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-section">
                <h2 className="sidebar-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M6 12h12M9 18h6" />
                    </svg>
                    Categories
                </h2>
                <nav className="sidebar-nav">
                    {categories.map(cat => (
                        <Link
                            key={cat.name}
                            href={`/category/${encodeURIComponent(cat.name.toLowerCase())}`}
                            className="sidebar-link"
                        >
                            <span>{cat.name}</span>
                            {cat.count > 0 && <span className="sidebar-count">{cat.count}</span>}
                        </Link>
                    ))}
                </nav>
            </div>

            <div className="sidebar-section sidebar-footer">
                <div className="powered-by">
                    <span>Powered by</span>
                    <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="polymarket-link">
                        Polymarket
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                    </a>
                </div>
            </div>
        </aside>
    );
}
