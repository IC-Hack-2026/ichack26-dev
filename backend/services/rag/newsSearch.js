// RAG News Search Service
// Searches for related news articles using web search APIs and generates summaries

const config = require('../../config');

// Extract key terms from headline for better search
function extractSearchQuery(headline) {
    // Remove common stop words and clean up the headline for search
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'that', 'which', 'who',
        'whom', 'this', 'these', 'those', 'it', 'its'
    ]);

    const words = headline
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

    // Take the most important words (up to 6)
    return words.slice(0, 6).join(' ');
}

// Search using Brave Search API
async function searchBrave(query, limit = 5) {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
        throw new Error('BRAVE_SEARCH_API_KEY not configured');
    }

    const params = new URLSearchParams({
        q: query,
        count: limit.toString(),
        search_lang: 'en',
        freshness: 'pw', // Past week
        text_decorations: 'false'
    });

    const response = await fetch(
        `https://api.search.brave.com/res/v1/news/search?${params}`,
        {
            headers: {
                'Accept': 'application/json',
                'X-Subscription-Token': apiKey
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Brave Search failed: ${response.status}`);
    }

    const data = await response.json();

    return (data.results || []).map(result => ({
        title: result.title,
        url: result.url,
        description: result.description,
        source: result.meta_url?.hostname || new URL(result.url).hostname,
        publishedAt: result.age || result.page_age || null
    }));
}

// Search using Tavily API (alternative, designed for RAG)
async function searchTavily(query, limit = 5) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        throw new Error('TAVILY_API_KEY not configured');
    }

    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            api_key: apiKey,
            query: query,
            search_depth: 'basic',
            include_answer: false,
            include_raw_content: false,
            max_results: limit,
            topic: 'news'
        })
    });

    if (!response.ok) {
        throw new Error(`Tavily Search failed: ${response.status}`);
    }

    const data = await response.json();

    return (data.results || []).map(result => ({
        title: result.title,
        url: result.url,
        description: result.content,
        source: new URL(result.url).hostname,
        publishedAt: result.published_date || null
    }));
}

// Generate summary for a related article using OpenAI
async function generateSummary(articleTitle, articleDescription, mainHeadline) {
    if (!config.openai.apiKey) {
        // Fallback: use the description as-is, trimmed
        return articleDescription?.substring(0, 200) || 'Related news story.';
    }

    try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: config.openai.apiKey });

        const response = await openai.chat.completions.create({
            model: config.openai.model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a news editor. Write a brief 1-2 sentence summary explaining how this related article connects to the main story. Be concise and informative.'
                },
                {
                    role: 'user',
                    content: `Main Story Headline: ${mainHeadline}

Related Article: ${articleTitle}
Description: ${articleDescription}

Write a brief summary (max 100 words) explaining the connection and key points from this related article.`
                }
            ],
            max_tokens: 150,
            temperature: 0.5
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('Failed to generate summary:', error.message);
        return articleDescription?.substring(0, 200) || 'Related news story.';
    }
}

// Main function: search for related news and generate summaries
async function findRelatedNews(headline, options = {}) {
    const {
        limit = 5,
        generateSummaries = true
    } = options;

    const query = extractSearchQuery(headline);
    console.log(`[RAG] Searching for: "${query}" (from headline: "${headline}")`);

    let searchResults = [];
    let searchProvider = 'none';

    // Try Brave Search first
    if (process.env.BRAVE_SEARCH_API_KEY) {
        try {
            searchResults = await searchBrave(query, limit);
            searchProvider = 'brave';
            console.log(`[RAG] Brave Search returned ${searchResults.length} results`);
        } catch (error) {
            console.error('[RAG] Brave Search failed:', error.message);
        }
    }

    // Fall back to Tavily if Brave didn't work
    if (searchResults.length === 0 && process.env.TAVILY_API_KEY) {
        try {
            searchResults = await searchTavily(query, limit);
            searchProvider = 'tavily';
            console.log(`[RAG] Tavily Search returned ${searchResults.length} results`);
        } catch (error) {
            console.error('[RAG] Tavily Search failed:', error.message);
        }
    }

    // If no search APIs configured, return empty
    if (searchResults.length === 0) {
        console.log('[RAG] No search results found or no API configured');
        return {
            query,
            provider: searchProvider,
            relatedArticles: []
        };
    }

    // Generate summaries for each result if requested
    if (generateSummaries) {
        const articlesWithSummaries = await Promise.all(
            searchResults.map(async (article) => {
                const summary = await generateSummary(
                    article.title,
                    article.description,
                    headline
                );
                return {
                    ...article,
                    summary
                };
            })
        );

        return {
            query,
            provider: searchProvider,
            relatedArticles: articlesWithSummaries
        };
    }

    return {
        query,
        provider: searchProvider,
        relatedArticles: searchResults.map(article => ({
            ...article,
            summary: article.description
        }))
    };
}

module.exports = {
    findRelatedNews,
    extractSearchQuery,
    searchBrave,
    searchTavily
};
