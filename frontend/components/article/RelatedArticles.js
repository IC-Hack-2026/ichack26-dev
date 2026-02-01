'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function RelatedArticles({ articleSlug }) {
    const [relatedData, setRelatedData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (articleSlug) {
            fetchRelatedArticles(articleSlug);
        }
    }, [articleSlug]);

    const fetchRelatedArticles = async (slug) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/api/articles/${encodeURIComponent(slug)}/related`);
            if (!res.ok) {
                throw new Error('Failed to fetch related articles');
            }
            const data = await res.json();
            setRelatedData(data);
        } catch (err) {
            console.error('Failed to fetch related articles:', err);
            setError('Failed to load related news');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="related-articles">
                <h2 className="related-articles-title">Related News</h2>
                <div className="related-articles-loading">
                    <div className="loading-spinner"></div>
                    <span>Searching for related news...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="related-articles">
                <h2 className="related-articles-title">Related News</h2>
                <div className="related-articles-error">
                    {error}
                </div>
            </div>
        );
    }

    if (!relatedData || relatedData.relatedArticles?.length === 0) {
        if (relatedData?.message) {
            return (
                <div className="related-articles">
                    <h2 className="related-articles-title">Related News</h2>
                    <div className="related-articles-empty">
                        RAG search is not configured for this instance.
                    </div>
                </div>
            );
        }
        return (
            <div className="related-articles">
                <h2 className="related-articles-title">Related News</h2>
                <div className="related-articles-empty">
                    No related news found.
                </div>
            </div>
        );
    }

    return (
        <div className="related-articles">
            <h2 className="related-articles-title">Related News</h2>
            <p className="related-articles-subtitle">
                Real-world coverage related to this prediction
            </p>

            <div className="related-articles-list">
                {relatedData.relatedArticles.map((article, index) => (
                    <a
                        key={index}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="related-article-item"
                    >
                        <div className="related-article-source">
                            {article.source}
                            {article.publishedAt && (
                                <span className="related-article-time">
                                    {article.publishedAt}
                                </span>
                            )}
                        </div>
                        <h3 className="related-article-headline">{article.title}</h3>
                        <p className="related-article-summary">{article.summary}</p>
                        <span className="related-article-link">
                            Read full article
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M7 17L17 7M17 7H7M17 7V17" />
                            </svg>
                        </span>
                    </a>
                ))}
            </div>
        </div>
    );
}
