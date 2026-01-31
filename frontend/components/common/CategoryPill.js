'use client';

import Link from 'next/link';

const categoryColors = {
    Politics: 'category-politics',
    Crypto: 'category-crypto',
    Sports: 'category-sports',
    Finance: 'category-finance',
    Technology: 'category-tech',
    Entertainment: 'category-entertainment',
    World: 'category-world',
    Other: 'category-other'
};

export default function CategoryPill({ category, clickable = true }) {
    const colorClass = categoryColors[category] || 'category-other';

    if (clickable) {
        return (
            <Link href={`/category/${encodeURIComponent(category.toLowerCase())}`} className={`category-pill ${colorClass}`}>
                {category}
            </Link>
        );
    }

    return (
        <span className={`category-pill ${colorClass}`}>
            {category}
        </span>
    );
}
