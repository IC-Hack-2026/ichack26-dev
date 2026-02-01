'use client';

import { useState, useEffect, useCallback } from 'react';
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

export default function FeaturedCarousel({ articles, autoPlayInterval = 5000 }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    const goToSlide = useCallback((index) => {
        setCurrentIndex(index);
    }, []);

    const goToNext = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % articles.length);
    }, [articles.length]);

    useEffect(() => {
        if (isPaused || articles.length <= 1) return;

        const interval = setInterval(goToNext, autoPlayInterval);
        return () => clearInterval(interval);
    }, [isPaused, goToNext, autoPlayInterval, articles.length]);

    if (!articles || articles.length === 0) return null;

    return (
        <div
            className="featured-carousel"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            <div
                className="carousel-track"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }}
            >
                {articles.map((article) => {
                    const resolutionDate = formatResolutionDate(article.expiresAt);
                    const probability = article.adjustedProbability ?? article.probability;

                    return (
                        <Link
                            key={article.id}
                            href={`/article/${article.slug}`}
                            className="carousel-slide"
                        >
                            <div className="carousel-slide-content">
                                <div className="carousel-slide-meta">
                                    {probability >= 0.8 && (
                                        <span className="hero-breaking">BREAKING</span>
                                    )}
                                    <CategoryPill category={article.category} clickable={false} />
                                </div>

                                {resolutionDate && (
                                    <span className="carousel-slide-dateline">{resolutionDate}</span>
                                )}

                                <h2 className="carousel-slide-headline">{article.headline}</h2>

                                {article.summary && (
                                    <p className="carousel-slide-summary">{article.summary}</p>
                                )}

                                <div className="carousel-slide-footer">
                                    <ProbabilityBadge probability={probability} size="large" />
                                </div>
                            </div>

                            <div className="carousel-slide-image">
                                {article.imageUrl && (
                                    <img src={article.imageUrl} alt="" />
                                )}
                            </div>
                        </Link>
                    );
                })}
            </div>

            {articles.length > 1 && (
                <div className="carousel-dots">
                    {articles.map((_, index) => (
                        <button
                            key={index}
                            className={`carousel-dot ${index === currentIndex ? 'active' : ''}`}
                            onClick={(e) => {
                                e.preventDefault();
                                goToSlide(index);
                            }}
                            aria-label={`Go to slide ${index + 1}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
