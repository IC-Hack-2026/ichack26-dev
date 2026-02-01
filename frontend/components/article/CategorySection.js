'use client';

import Link from 'next/link';
import ArticleCard from './ArticleCard';

export default function CategorySection({ category, articles, maxArticles = 4 }) {
    if (!articles || articles.length === 0) return null;

    const displayedArticles = articles.slice(0, maxArticles);
    const categorySlug = category.toLowerCase();

    return (
        <section className="category-section">
            <div className="category-section-header">
                <h2 className="category-section-title">{category}</h2>
                <Link href={`/category/${categorySlug}`} className="category-section-link">
                    See all
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                    </svg>
                </Link>
            </div>

            <div className="category-section-grid">
                {displayedArticles.map((article, index) => (
                    <ArticleCard
                        key={article.id}
                        article={article}
                        index={index}
                    />
                ))}
            </div>
        </section>
    );
}
