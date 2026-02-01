'use client';

import { useState, useEffect } from 'react';
import Header from '../components/layout/Header';
import ArticleHero from '../components/article/ArticleHero';
import ArticleCard from '../components/article/ArticleCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
    const [featured, setFeatured] = useState(null);
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('publishedAt');
    const [probabilityFilter, setProbabilityFilter] = useState('0.6');

    useEffect(() => {
        fetchArticles();
    }, [sortBy, probabilityFilter]);

    const fetchArticles = async () => {
        setLoading(true);
        try {
            // Fetch featured article
            const featuredRes = await fetch(`${API_URL}/api/articles/featured?limit=1`);
            const featuredData = await featuredRes.json();
            setFeatured(featuredData.articles?.[0] || null);

            // Fetch all articles
            const articlesRes = await fetch(`${API_URL}/api/articles?limit=20&sort=${sortBy}`);
            const articlesData = await articlesRes.json();

            // Filter out the featured article from the list
            const featuredId = featuredData.articles?.[0]?.id;
            let filteredArticles = articlesData.articles?.filter(a => a.id !== featuredId) || [];

            // Apply probability filter
            const threshold = parseFloat(probabilityFilter);
            filteredArticles = filteredArticles.filter(a => a.probability >= threshold);

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
                            <h1 className="content-title">Tomorrow's News Today</h1>
                            <p className="content-subtitle">AI-generated articles about future events with probability predictions</p>
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
                                    className={`filter-btn ${probabilityFilter === '0.6' ? 'active' : ''}`}
                                    onClick={() => setProbabilityFilter('0.6')}
                                >
                                    60%+
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
                            {featured && (
                                <div className="hero-section">
                                    <ArticleHero article={featured} />
                                </div>
                            )}

                            <div className="articles-grid">
                                {articles.map((article, index) => (
                                    <ArticleCard
                                        key={article.id}
                                        article={article}
                                        index={index}
                                    />
                                ))}
                            </div>

                            {articles.length === 0 && !featured && (
                                <div className="empty-state">
                                    <p>No articles yet. Articles will be generated from prediction markets.</p>
                                </div>
                            )}
                        </>
                    )}
                </section>
            </main>
        </div>
    );
}
