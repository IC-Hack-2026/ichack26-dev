// Article generation service using Claude
// Transforms Polymarket events into news articles

const config = require('../../config');
const db = require('../../db');
const { findRelatedNews } = require('../rag');

// Track in-flight article generation with promise-based locking
const inFlightArticles = new Map();  // eventId -> Promise<article>

// Parse JSON from Claude's response, handling markdown code blocks and control characters
function parseClaudeJSON(text) {
    // Extract JSON from markdown code blocks if present
    let jsonStr = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
    }

    // Replace actual newlines/tabs inside string values with escape sequences
    // This regex properly handles escaped characters like \" within strings
    // Pattern: [^"\\] matches any char that's NOT " or \
    //          \\. matches any escaped sequence (\", \\, \n, etc.)
    jsonStr = jsonStr.replace(/:\s*"((?:[^"\\]|\\.)*)"/g, (match, content) => {
        const escaped = content
            .replace(/\r\n/g, '\\n')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\n')
            .replace(/\t/g, '\\t');
        return `: "${escaped}"`;
    });

    return JSON.parse(jsonStr.trim());
}

// Valid categories for articles
const VALID_CATEGORIES = ['Politics', 'World', 'Finance', 'Technology', 'Sports', 'Entertainment', 'Crypto', 'Other'];

// Generate article using Claude
async function generateArticle(event, prediction) {
    const probability = prediction?.adjustedProbability || event.probability || 0.5;
    const probabilityPercent = Math.round(probability * 100);

    // Skip low probability events (less than 70%)
    if (probability < 0.7) {
        return null;
    }

    // Fetch related news for context enrichment
    let relatedNews = [];
    try {
        const eventTitle = event.title || event.question;
        const ragResult = await findRelatedNews(eventTitle, {
            limit: 5,
            generateSummaries: false  // Use raw descriptions to save API calls
        });
        relatedNews = ragResult.relatedArticles || [];
        if (relatedNews.length > 0) {
            console.log(`[ArticleGenerator] Found ${relatedNews.length} related news articles for context`);
        }
    } catch (err) {
        console.warn('[ArticleGenerator] RAG search failed, continuing without context:', err.message);
    }

    // Check if Anthropic is configured
    if (!config.anthropic.apiKey) {
        // Fallback: generate a simple article without AI
        return generateFallbackArticle(event, probabilityPercent);
    }

    try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

        const prompt = buildPrompt(event, probabilityPercent, relatedNews);

        const response = await anthropic.messages.create({
            model: config.anthropic.model,
            system: `You are a professional news writer reporting LIVE. Write EVERYTHING in PRESENT TENSE - this is non-negotiable. The event is happening RIGHT NOW as you write.

CORRECT: "signs", "announces", "launches", "defeats", "wins", "passes"
WRONG: "signed", "announced", "will sign", "is expected to", "has announced"

Write in a serious, journalistic tone similar to Reuters or AP News. Be factual and objective. Never mention prediction markets or probabilities. If related news context is provided, incorporate relevant background information and facts. Do not directly quote or cite the sources.`,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 1000,
            temperature: 0.7
        });

        const result = parseClaudeJSON(response.content[0].text);

        // Filter out meaningless outcomes (non-events, absences)
        if (result.isMeaningful === false) {
            return null;
        }

        // Validate and assign category
        const category = VALID_CATEGORIES.includes(result.category) ? result.category : (event.category || 'Other');

        return {
            headline: result.headline,
            summary: result.summary,
            body: result.body,
            category,
            eventId: event.id,
            probability,
            totalVolume: event.totalVolume || 0,
            imageUrl: event.image,
            expiresAt: event.endDate
        };
    } catch (error) {
        console.error('Claude generation failed:', error.message);
        return generateFallbackArticle(event, probabilityPercent);
    }
}

// Interpret Yes/No outcome from question text
function interpretBinaryOutcome(question, outcomeName) {
    if (!question || (outcomeName !== 'Yes' && outcomeName !== 'No')) {
        return null;
    }

    // Clean up the question
    let interpreted = question
        .replace(/\?$/, '')  // Remove trailing ?
        .replace(/^Will\s+/i, '')  // "Will X happen" -> "X happen"
        .replace(/^Does\s+/i, '')  // "Does X happen" -> "X happen"
        .replace(/^Is\s+/i, '');   // "Is X true" -> "X true"

    if (outcomeName === 'No') {
        // Negate the outcome
        // "Trump win" -> "Trump does not win"
        const words = interpreted.split(' ');
        if (words.length >= 2) {
            interpreted = words[0] + ' does not ' + words.slice(1).join(' ');
        }
    }

    return interpreted;
}

// Interpret multi-outcome questions by combining question context with outcome name
function interpretMultiOutcome(question, outcomeName) {
    if (!question || !outcomeName) {
        return null;
    }

    // Handle "Who will..." questions (elections, appointments)
    const whoMatch = question.match(/^Who will (.+?)\??$/i);
    if (whoMatch) {
        // "Who will win the German election?" + "Merz" -> "Merz wins the German election"
        const action = whoMatch[1]
            .replace(/^be\s+/i, 'becomes ')  // "be president" -> "becomes president"
            .replace(/\s+in\s+\d{4}$/i, ''); // Remove year suffix
        return `${outcomeName} ${action}`;
    }

    // Handle "Which..." questions
    const whichMatch = question.match(/^Which (.+?) will (.+?)\??$/i);
    if (whichMatch) {
        // "Which party will win?" + "CDU" -> "CDU wins"
        return `${outcomeName} ${whichMatch[2]}`;
    }

    // Handle "What will..." questions
    const whatMatch = question.match(/^What will (.+?)\??$/i);
    if (whatMatch) {
        // "What will happen in Ukraine?" + "Ceasefire" -> "Ceasefire in Ukraine"
        const context = whatMatch[1].replace(/^happen\s+(in|to|with)\s*/i, '');
        return `${outcomeName} ${context ? 'in ' + context : ''}`.trim();
    }

    // Fallback: return null to use the generic format
    return null;
}

function buildPrompt(event, probabilityPercent, relatedNews = []) {
    const eventTitle = event.title || event.question;
    const eventDescription = event.description || '';

    // Include outcome details so Claude knows the favored outcome
    let outcomesContext = '';
    if (event.outcomes && event.outcomes.length > 0) {
        const sorted = [...event.outcomes].sort((a, b) => (b.probability || 0) - (a.probability || 0));
        const favorite = sorted[0];
        const favoritePercent = Math.round((favorite.probability || 0) * 100);

        // Check if this is a binary Yes/No question
        const isBinaryQuestion = event.outcomes.length === 2 &&
            event.outcomes.some(o => o.name === 'Yes') &&
            event.outcomes.some(o => o.name === 'No');

        if (isBinaryQuestion) {
            const interpreted = interpretBinaryOutcome(eventTitle, favorite.name);
            if (interpreted) {
                outcomesContext = `

PREDICTED OUTCOME (${favoritePercent}% probability):
${interpreted}

IMPORTANT: Write the headline stating this outcome as fact. Be specific about WHO or WHAT.`;
            }
        }

        // Fall back to original format for non-binary or if interpretation failed
        if (!outcomesContext) {
            // Try to interpret multi-outcome questions
            const interpretedMulti = interpretMultiOutcome(eventTitle, favorite.name);

            if (interpretedMulti) {
                outcomesContext = `

PREDICTED OUTCOME (${favoritePercent}% probability):
${interpretedMulti}

IMPORTANT: Write the headline stating this outcome as fact. Be specific about WHO wins or WHAT happens.`;
            } else {
                // Final fallback with explicit instruction
                outcomesContext = `

OUTCOME DATA (use this for the headline):
- FAVORED OUTCOME: ${favorite.name} (${favoritePercent}% probability)
- Question context: ${eventTitle}
- Other outcomes: ${sorted.slice(1).map(o => `${o.name} (${Math.round((o.probability || 0) * 100)}%)`).join(', ')}

IMPORTANT: Write the headline stating "${favorite.name}" as the answer to "${eventTitle}". Be decisive and specific - name WHO or WHAT.`;
            }
        }
    }

    // Build related news context section (descriptions only, no titles to avoid influencing headlines)
    let relatedNewsContext = '';
    if (relatedNews.length > 0) {
        relatedNewsContext = '\n\nRELATED REAL-WORLD NEWS (use for background context and facts):';
        relatedNews.slice(0, 5).forEach((article, i) => {
            if (article.description) {
                const trimmedDesc = article.description.slice(0, 300);
                relatedNewsContext += `\n${i + 1}. ${trimmedDesc}${article.description.length > 300 ? '...' : ''} (${article.source})`;
            }
        });
    }

    return `Write a news article about this event:

EVENT: ${eventTitle}
CONTEXT: ${eventDescription}${outcomesContext}${relatedNewsContext}
SUGGESTED CATEGORY: ${event.category || 'General'}

Write as if this is happening RIGHT NOW. Use present tense throughout.

Return a valid JSON object (no markdown, no code blocks) with these fields:
- headline: A compelling news headline in present tense (max 80 characters, no probability mention, no dates)
- summary: A 1-2 sentence summary for preview cards (max 150 characters)
- body: The full article (2-3 paragraphs, ~200-300 words). MUST use present tense throughout - write as live breaking news. Use \\n for paragraph breaks.
- category: One of: Politics, World, Finance, Technology, Sports, Entertainment, Crypto, Other
- isMeaningful: boolean - true if headline describes a positive action (e.g., "Deal Signed", "Stock Surges"), false if it describes absence/non-event (e.g., "No Storms", "Nothing Happens", "Fails to Occur")

IMPORTANT: Return ONLY the JSON object, no other text. Use \\n for newlines in the body field.

TENSE RULES (CRITICAL):
- Use ONLY present tense: "The president signs" NOT "signed" or "will sign"
- Write as LIVE news: "Markets react" NOT "Markets reacted" or "Markets are expected to react"
- No hedging language: "announces" NOT "is set to announce" or "has announced"

Write as if you are a professional journalist reporting on this event NOW. Use present tense verbs (announces, signs, reveals, launches). Include relevant context and implications. Do not mention prediction markets or probabilities in the article text.`;
}

function generateFallbackArticle(event, probabilityPercent) {
    const eventTitle = event.title || event.question;

    // Clean up the question into a headline
    let headline = eventTitle
        .replace(/^Will\s+/i, '')
        .replace(/\?$/, '')
        .replace(/\s+by\s+\d{4}$/i, '')
        .replace(/\s+before\s+.+$/i, '');

    // Capitalize first letter
    headline = headline.charAt(0).toUpperCase() + headline.slice(1);

    // Keep it concise
    if (headline.length > 80) {
        headline = headline.substring(0, 77) + '...';
    }

    const summary = `${headline}. Analysts closely watch developments in the ${event.category || 'global'} sector.`;

    // Present tense body - write as if it's happening now
    const body = `${headline}, according to market analysts tracking the development closely.

The situation draws significant attention from investors and observers alike. Current market conditions and emerging signals point to this development materializing.

Industry experts note that recent developments strengthen the case for this outcome, with multiple indicators pointing in this direction. Stakeholders continue to monitor the situation as it evolves.`;

    return {
        headline,
        summary: summary.substring(0, 150),
        body,
        category: event.category || 'Other',
        eventId: event.id,
        probability: probabilityPercent / 100,
        totalVolume: event.totalVolume || 0,
        imageUrl: event.image,
        expiresAt: event.endDate
    };
}

// Create and save article to database
async function createArticle(event, prediction) {
    const eventId = event.id;

    // If already generating, wait for that promise instead of creating a duplicate
    if (inFlightArticles.has(eventId)) {
        return inFlightArticles.get(eventId);
    }

    // Create a promise for this generation and store it
    const generationPromise = (async () => {
        try {
            // Check if article already exists for this event
            const existing = await db.articles.getByEventId(eventId);
            if (existing) {
                // Update probability if needed
                const newProbability = prediction?.adjustedProbability || event.probability;
                if (existing.probability !== newProbability) {
                    return db.articles.update(existing.id, { probability: newProbability });
                }
                return existing;
            }

            // Generate new article
            const articleData = await generateArticle(event, prediction);

            // Skip if article generation returned null (filtered out)
            if (!articleData) {
                return null;
            }

            // Save to database
            return db.articles.create(articleData);
        } finally {
            inFlightArticles.delete(eventId);
        }
    })();

    inFlightArticles.set(eventId, generationPromise);
    return generationPromise;
}

// Batch generate articles for multiple events
async function generateArticlesForEvents(events, predictions = {}) {
    const articles = [];

    for (const event of events) {
        try {
            const prediction = predictions[event.id];
            const article = await createArticle(event, prediction);
            // Skip null results (filtered out by probability or meaningfulness)
            if (article) {
                articles.push(article);
            }
        } catch (error) {
            console.error(`Failed to generate article for event ${event.id}:`, error.message);
        }
    }

    return articles;
}

// Regenerate article for a specific event (used for real-time signal updates)
async function regenerateArticleForEvent(eventId) {
    // Fetch the event from the database
    const event = await db.events.getById(eventId);
    if (!event) {
        console.warn(`[ArticleGenerator] Event not found for regeneration: ${eventId}`);
        return null;
    }

    // Get the latest prediction for the event
    const prediction = await db.predictions.getLatestByEventId(eventId);

    // Check if an article already exists for this event
    const existingArticle = await db.articles.getByEventId(eventId);

    // Generate new article content
    const articleData = await generateArticle(event, prediction);

    // If article was filtered out (low probability or meaningless)
    if (!articleData) {
        console.log(`[ArticleGenerator] Skipping event ${eventId}: filtered out by probability or meaningfulness`);
        return null;
    }

    if (existingArticle) {
        // Update the existing article with new content
        const updatedArticle = await db.articles.update(existingArticle.id, {
            headline: articleData.headline,
            summary: articleData.summary,
            body: articleData.body,
            category: articleData.category,
            probability: articleData.probability,
            updatedAt: new Date().toISOString()
        });
        console.log(`[ArticleGenerator] Regenerated article for event ${eventId}: "${articleData.headline}"`);
        return updatedArticle;
    } else {
        // Create a new article if one doesn't exist
        const newArticle = await db.articles.create(articleData);
        console.log(`[ArticleGenerator] Created new article for event ${eventId}: "${articleData.headline}"`);
        return newArticle;
    }
}

module.exports = {
    generateArticle,
    createArticle,
    generateArticlesForEvents,
    generateFallbackArticle,
    regenerateArticleForEvent
};
