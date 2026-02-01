// API client for fetching from backend

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function fetchArticles({ category, limit = 20, offset = 0, sort = 'publishedAt' } = {}) {
    const params = new URLSearchParams({ limit, offset, sort });
    if (category) params.set('category', category);

    const res = await fetch(`${API_URL}/api/articles?${params}`);
    if (!res.ok) throw new Error('Failed to fetch articles');
    return res.json();
}

export async function fetchFeaturedArticles(limit = 5) {
    const res = await fetch(`${API_URL}/api/articles/featured?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch featured articles');
    return res.json();
}

export async function fetchArticle(slug) {
    const res = await fetch(`${API_URL}/api/articles/${encodeURIComponent(slug)}`);
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch article');
    }
    return res.json();
}

export async function fetchCategories() {
    const res = await fetch(`${API_URL}/api/categories`);
    if (!res.ok) throw new Error('Failed to fetch categories');
    return res.json();
}

// Legacy market endpoints (for backward compatibility)
export async function fetchMarkets({ limit = 20, sortBy = 'probability' } = {}) {
    const res = await fetch(`${API_URL}/api/markets?limit=${limit}&sortBy=${sortBy}`);
    if (!res.ok) throw new Error('Failed to fetch markets');
    return res.json();
}

export async function fetchMarket(slug) {
    const res = await fetch(`${API_URL}/api/markets/${encodeURIComponent(slug)}`);
    if (!res.ok) throw new Error('Failed to fetch market');
    return res.json();
}

// Internal API endpoints for developer panel
export async function fetchRealtimeSignals({ limit = 50, type = null } = {}) {
    const params = new URLSearchParams({ limit });
    if (type) params.set('type', type);

    const res = await fetch(`${API_URL}/api/internal/signals/realtime?${params}`, {
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to fetch realtime signals');
    return res.json();
}

export async function fetchSuspiciousWallets({ limit = 20 } = {}) {
    const res = await fetch(`${API_URL}/api/internal/wallets/suspicious?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch suspicious wallets');
    return res.json();
}

export async function fetchStreamStatus() {
    const res = await fetch(`${API_URL}/api/internal/stream/status`, {
        cache: 'no-store'
    });
    if (!res.ok) throw new Error('Failed to fetch stream status');
    return res.json();
}
