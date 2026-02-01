'use client';

import ProbabilityBadge from '../common/ProbabilityBadge';
import CategoryPill from '../common/CategoryPill';
import TimeAgo from '../common/TimeAgo';
import RelatedArticles from './RelatedArticles';

export default function ArticleFull({ article }) {
    if (!article) return null;

    return (
        <article className="article-full">
            {article.imageUrl && (
                <div className="article-full-image">
                    <img src={article.imageUrl} alt="" />
                </div>
            )}

            <div className="article-full-header">
                <div className="article-full-meta">
                    <CategoryPill category={article.category} />
                    <TimeAgo date={article.publishedAt} />
                </div>

                <h1 className="article-full-headline">{article.headline}</h1>

                <div className="article-full-probability">
                    <ProbabilityBadge probability={article.adjustedProbability ?? article.probability} size="large" />
                    <span className="probability-context">
                        Based on market analysis and predictive signals
                    </span>
                </div>
            </div>

            <div className="article-full-body">
                {article.body?.split('\n\n').map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                ))}
            </div>

            <div className="article-full-footer">
                {article.expiresAt && (
                    <div className="article-expiry">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v6l4 2" />
                        </svg>
                        <span>
                            Resolution: {new Date(article.expiresAt).toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                            })}
                        </span>
                    </div>
                )}

                <div className="article-disclaimer">
                    This article represents a prediction about a future event. The probability shown
                    is based on market data and signal analysis. Actual outcomes may differ.
                </div>
            </div>

            {article.slug && (
                <RelatedArticles articleSlug={article.slug} />
            )}
        </article>
    );
}
