'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '../../../components/layout/Header';
import ArticleFull from '../../../components/article/ArticleFull';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ArticlePage() {
    const params = useParams();
    const [article, setArticle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (params.slug) {
            fetchArticle(params.slug);
        }
    }, [params.slug]);

    const fetchArticle = async (slug) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/api/articles/${encodeURIComponent(slug)}`);
            if (!res.ok) {
                if (res.status === 404) {
                    setError('Article not found');
                } else {
                    throw new Error('Failed to fetch article');
                }
                return;
            }
            const data = await res.json();
            setArticle(data);
        } catch (err) {
            console.error('Failed to fetch article:', err);
            setError('Failed to load article');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page">
            <Header />

            <main className="main article-main">
                <div className="article-container">
                    <nav className="article-breadcrumb">
                        <Link href="/" className="breadcrumb-link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                            Back to News
                        </Link>
                    </nav>

                    {loading ? (
                        <div className="loading">
                            <div className="loading-spinner"></div>
                            <span>Loading article...</span>
                        </div>
                    ) : error ? (
                        <div className="error-state">
                            <h2>Article Not Found</h2>
                            <p>{error}</p>
                            <Link href="/" className="back-link">
                                Return to Homepage
                            </Link>
                        </div>
                    ) : (
                        <ArticleFull article={article} />
                    )}
                </div>
            </main>
        </div>
    );
}
