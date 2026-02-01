const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Fetch all order books summary
 */
export async function fetchAllOrderBooks() {
    const res = await fetch(`${API_URL}/api/orderbook`);
    if (!res.ok) {
        throw new Error(`Failed to fetch order books: ${res.status}`);
    }
    return res.json();
}

/**
 * Fetch a single order book by asset ID
 */
export async function fetchOrderBook(assetId) {
    const res = await fetch(`${API_URL}/api/orderbook/${encodeURIComponent(assetId)}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch order book: ${res.status}`);
    }
    return res.json();
}

/**
 * Fetch top N levels of an order book
 */
export async function fetchOrderBookDepth(assetId, levels = 10) {
    const res = await fetch(`${API_URL}/api/orderbook/${encodeURIComponent(assetId)}/depth?levels=${levels}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch order book depth: ${res.status}`);
    }
    return res.json();
}
