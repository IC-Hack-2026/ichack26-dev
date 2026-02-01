'use client';

import Link from 'next/link';
import ProbabilityBadge from '../common/ProbabilityBadge';
import CategoryPill from '../common/CategoryPill';
import TimeAgo from '../common/TimeAgo';

export default function ArticleCard({ article, index = 0 }) {
    return (
        <Link
            href={`/article/${article.slug}`}
            className="article-card"
            style={{ animationDelay: `${index * 50}ms` }}
        >
            {article.imageUrl && (
                <div className="article-card-image">
                    <img src={article.imageUrl} alt="" />
                </div>
            )}

            <div className="article-card-content">
                <div className="article-card-meta">
                    <CategoryPill category={article.category} clickable={false} />
                    <TimeAgo date={article.publishedAt} />
                </div>

                <h3 className="article-card-headline">{article.headline}</h3>

                {article.summary && (
                    <p className="article-card-summary">{article.summary}</p>
                )}

                <div className="article-card-footer">
                    <ProbabilityBadge probability={article.adjustedProbability ?? article.probability} size="small" />
                </div>
            </div>
        </Link>
    );
}
