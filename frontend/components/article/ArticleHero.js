'use client';

import Link from 'next/link';
import ProbabilityBadge from '../common/ProbabilityBadge';
import CategoryPill from '../common/CategoryPill';
import TimeAgo from '../common/TimeAgo';

export default function ArticleHero({ article }) {
    if (!article) return null;

    return (
        <Link href={`/article/${article.slug}`} className="article-hero">
            <div className="article-hero-content">
                <div className="article-hero-meta">
                    {(article.adjustedProbability ?? article.probability) >= 0.8 && (
                        <span className="hero-breaking">BREAKING</span>
                    )}
                    <CategoryPill category={article.category} clickable={false} />
                    <TimeAgo date={article.publishedAt} />
                </div>

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
