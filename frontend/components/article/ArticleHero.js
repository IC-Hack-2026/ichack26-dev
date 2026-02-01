'use client';

import Link from 'next/link';
import ProbabilityBadge from '../common/ProbabilityBadge';
import CategoryPill from '../common/CategoryPill';

function formatResolutionDate(dateString) {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

export default function ArticleHero({ article }) {
    if (!article) return null;

    const resolutionDate = formatResolutionDate(article.expiresAt);

    return (
        <Link href={`/article/${article.slug}`} className="article-hero">
            <div className="article-hero-content">
                <div className="article-hero-meta">
                    {(article.adjustedProbability ?? article.probability) >= 0.8 && (
                        <span className="hero-breaking">BREAKING</span>
                    )}
                    <CategoryPill category={article.category} clickable={false} />
                </div>

                {resolutionDate && (
                    <span className="article-hero-dateline">{resolutionDate}</span>
                )}

                <h2 className="article-hero-headline">{article.headline}</h2>

                {article.summary && (
                    <p className="article-hero-summary">{article.summary}</p>
                )}

                <div className="article-hero-footer">
                    <ProbabilityBadge probability={article.adjustedProbability ?? article.probability} size="large" />
                </div>
            </div>

            <div className="article-hero-image">
                {article.imageUrl && (
                    <img src={article.imageUrl} alt="" />
                )}
            </div>
        </Link>
    );
}
