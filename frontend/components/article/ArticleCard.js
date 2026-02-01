'use client';

import Link from 'next/link';
import ProbabilityBadge from '../common/ProbabilityBadge';
import CategoryPill from '../common/CategoryPill';
import { formatRelativeDate } from '../../lib/dateUtils';

export default function ArticleCard({ article, index = 0 }) {
    const resolutionDate = formatRelativeDate(article.expiresAt);

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
                {resolutionDate && (
                    <span className="article-card-dateline">{resolutionDate}</span>
                )}

                <h3 className="article-card-headline">{article.headline}</h3>

                {article.summary && (
                    <p className="article-card-summary">{article.summary}</p>
                )}

                <div className="article-card-footer">
                    <CategoryPill category={article.category} clickable={false} />
                    <ProbabilityBadge probability={article.adjustedProbability ?? article.probability} size="small" />
                </div>
            </div>
        </Link>
    );
}
