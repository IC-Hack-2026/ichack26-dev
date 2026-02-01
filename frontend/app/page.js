'use client';

import { useState, useEffect } from 'react';
import Header from '../components/layout/Header';
import FeaturedCarousel from '../components/article/FeaturedCarousel';
import CategorySection from '../components/article/CategorySection';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function groupByCategory(articles) {
    return articles.reduce((acc, article) => {
        const cat = article.category || 'Other';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(article);
        return acc;
    }, {});
}

const timeHorizonConfig = {
    tomorrow: { minDays: 0, maxDays: 1 },
    week: { minDays: 0, maxDays: 7 },
    month: { minDays: 0, maxDays: 30 }
};

export default function Home() {
    const [featuredArticles, setFeaturedArticles] = useState([]);
    const [categoryGroups, setCategoryGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('publishedAt');
    const [probabilityFilter, setProbabilityFilter] = useState('0.6');
    const [timeHorizon, setTimeHorizon] = useState('month');

    useEffect(() => {
        fetchArticles();
    }, [sortBy, probabilityFilter, timeHorizon]);

    const fetchArticles = async () => {
        setLoading(true);
        try {
            const { minDays, maxDays } = timeHorizonConfig[timeHorizon];

            // Fetch featured articles (3 for carousel)
            const featuredRes = await fetch(`${API_URL}/api/articles/featured?limit=3&minDays=${minDays}&maxDays=${maxDays}`);
            const featuredData = await featuredRes.json();
            const featured = featuredData.articles || [];
            setFeaturedArticles(featured);

            // Get featured article IDs to exclude from category sections
            const featuredIds = new Set(featured.map(a => a.id));

            // Fetch all articles
            const articlesRes = await fetch(`${API_URL}/api/articles?limit=50&sort=${sortBy}&minDays=${minDays}&maxDays=${maxDays}`);
            const articlesData = await articlesRes.json();

            // Filter out featured articles and apply probability filter
            const threshold = parseFloat(probabilityFilter);
            const filteredArticles = (articlesData.articles || [])
                .filter(a => !featuredIds.has(a.id))
                .filter(a => a.probability >= threshold);

            // Group by category
            const grouped = groupByCategory(filteredArticles);

            // Sort categories by article count (descending)
            const sortedCategories = Object.entries(grouped)
                .sort((a, b) => b[1].length - a[1].length)
                .map(([category, articles]) => ({ category, articles }));

            setCategoryGroups(sortedCategories);
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
                            <div className="filter-controls">
                                <span className="filter-label">Resolution:</span>
                                <button
                                    className={`filter-btn ${timeHorizon === 'tomorrow' ? 'active' : ''}`}
                                    onClick={() => setTimeHorizon('tomorrow')}
                                >
                                    Tomorrow
                                </button>
                                <button
                                    className={`filter-btn ${timeHorizon === 'week' ? 'active' : ''}`}
                                    onClick={() => setTimeHorizon('week')}
                                >
                                    This Week
                                </button>
                                <button
                                    className={`filter-btn ${timeHorizon === 'month' ? 'active' : ''}`}
                                    onClick={() => setTimeHorizon('month')}
                                >
                                    This Month
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
                            {featuredArticles.length > 0 && (
                                <FeaturedCarousel articles={featuredArticles} />
                            )}

                            {categoryGroups.map(({ category, articles }) => (
                                <CategorySection
                                    key={category}
                                    category={category}
                                    articles={articles}
                                />
                            ))}

                            {categoryGroups.length === 0 && featuredArticles.length === 0 && (
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
