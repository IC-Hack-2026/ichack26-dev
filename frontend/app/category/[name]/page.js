'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Header from '../../../components/layout/Header';
import ArticleCard from '../../../components/article/ArticleCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Capitalize category name for display
function formatCategoryName(name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

export default function CategoryPage() {
    const params = useParams();
    const categoryName = formatCategoryName(params.name || '');

    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('publishedAt');
    const [probabilityFilter, setProbabilityFilter] = useState('all');

    useEffect(() => {
        if (params.name) {
            fetchArticles();
        }
    }, [params.name, sortBy, probabilityFilter]);

    const fetchArticles = async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `${API_URL}/api/articles?category=${encodeURIComponent(categoryName)}&limit=30&sort=${sortBy}`
            );
            const data = await res.json();
            let filteredArticles = data.articles || [];

            // Apply probability filter
            if (probabilityFilter !== 'all') {
                const threshold = parseFloat(probabilityFilter);
                filteredArticles = filteredArticles.filter(a => a.probability >= threshold);
            }

            setArticles(filteredArticles);
        } catch (error) {
            console.error('Failed to fetch articles:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page">
            <Header />

            <main className="main">
                <section className="content">
                    <div className="content-header">
                        <div>
                            <h1 className="content-title">{categoryName}</h1>
                            <p className="content-subtitle">Predictions and forecasts in {categoryName.toLowerCase()}</p>
                        </div>
                        <div className="controls-group">
                            <div className="sort-controls">
                                <button
                                    className={`sort-btn ${sortBy === 'publishedAt' ? 'active' : ''}`}
                                    onClick={() => setSortBy('publishedAt')}
                                >
                                    Latest
                                </button>
                                <button
                                    className={`sort-btn ${sortBy === 'probability' ? 'active' : ''}`}
                                    onClick={() => setSortBy('probability')}
                                >
                                    Most Likely
                                </button>
                            </div>
                            <div className="filter-controls">
                                <span className="filter-label">Show:</span>
                                <button
                                    className={`filter-btn ${probabilityFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setProbabilityFilter('all')}
                                >
                                    All
                                </button>
                                <button
                                    className={`filter-btn ${probabilityFilter === '0.5' ? 'active' : ''}`}
                                    onClick={() => setProbabilityFilter('0.5')}
                                >
                                    50%+
                                </button>
                                <button
                                    className={`filter-btn ${probabilityFilter === '0.7' ? 'active' : ''}`}
                                    onClick={() => setProbabilityFilter('0.7')}
                                >
                                    70%+
                                </button>
                                <button
                                    className={`filter-btn ${probabilityFilter === '0.9' ? 'active' : ''}`}
                                    onClick={() => setProbabilityFilter('0.9')}
                                >
                                    90%+
                                </button>
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="loading">
                            <div className="loading-spinner"></div>
                            <span>Loading articles...</span>
                        </div>
                    ) : (
                        <>
                            <div className="articles-grid">
                                {articles.map((article, index) => (
                                    <ArticleCard
                                        key={article.id}
                                        article={article}
                                        index={index}
                                    />
                                ))}
                            </div>

                            {articles.length === 0 && (
                                <div className="empty-state">
                                    <p>No articles in {categoryName} yet.</p>
                                </div>
                            )}
                        </>
                    )}
                </section>
            </main>
        </div>
    );
}
