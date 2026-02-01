// Article generation service using Claude
// Transforms Polymarket events into news articles

const config = require('../../config');
const db = require('../../db');

// Parse JSON from Claude's response, handling markdown code blocks and control characters
function parseClaudeJSON(text) {
    // Extract JSON from markdown code blocks if present
    let jsonStr = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
    }

    // Remove control characters that break JSON parsing
    // Replace actual newlines inside string values with \n escape sequences
    jsonStr = jsonStr.replace(/:\s*"([^"]*?)"/g, (match, content) => {
        const escaped = content
            .replace(/\r\n/g, '\\n')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\n')
            .replace(/\t/g, '\\t');
        return `: "${escaped}"`;
    });

    return JSON.parse(jsonStr.trim());
}

// Generate article using Claude
async function generateArticle(event, prediction) {
    const probability = prediction?.adjustedProbability || event.probability || 0.5;
    const probabilityPercent = Math.round(probability * 100);

    // Check if Anthropic is configured
    if (!config.anthropic.apiKey) {
        // Fallback: generate a simple article without AI
        return generateFallbackArticle(event, probabilityPercent);
    }

    try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

        const prompt = buildPrompt(event, probabilityPercent);

        const response = await anthropic.messages.create({
            model: config.anthropic.model,
            system: `You are a professional news writer for a publication that reports on future events as if they have already happened. Write in a serious, journalistic tone similar to Reuters or AP News. Be factual and objective. Never use phrases like "prediction market" or "probability" in the article body - write as if reporting actual news.`,
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

        return {
            headline: result.headline,
            summary: result.summary,
            body: result.body,
            category: event.category,
            eventId: event.id,
            probability,
            imageUrl: event.image,
            expiresAt: event.endDate
        };
    } catch (error) {
        console.error('Claude generation failed:', error.message);
        return generateFallbackArticle(event, probabilityPercent);
    }
}

function buildPrompt(event, probabilityPercent) {
    const eventTitle = event.title || event.question;
    const eventDescription = event.description || '';

    // Determine tense and framing based on probability
    let framing;
    if (probabilityPercent >= 80) {
        framing = 'This event is highly likely to occur. Write as if it has just happened.';
    } else if (probabilityPercent >= 60) {
        framing = 'This event is likely to occur. Write as if developments strongly suggest it will happen soon.';
    } else if (probabilityPercent >= 40) {
        framing = 'This event has moderate chances. Write about growing momentum or mixed signals.';
    } else {
        framing = 'This event is unlikely but possible. Write about factors that could still make it happen.';
    }

    return `Write a news article about this future event:

EVENT: ${eventTitle}
CONTEXT: ${eventDescription}
CATEGORY: ${event.category || 'General'}
${framing}

Return a valid JSON object (no markdown, no code blocks) with these fields:
- headline: A compelling news headline (max 80 characters, no probability mention)
- summary: A 1-2 sentence summary for preview cards (max 150 characters)
- body: The full article (2-3 paragraphs, ~200-300 words). Use \\n for paragraph breaks, not actual newlines.

IMPORTANT: Return ONLY the JSON object, no other text. Use \\n for newlines in the body field.

Write as if you are a professional journalist reporting on this event. Include relevant context and implications. Do not mention prediction markets or probabilities in the article text.`;
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

    const summary = `${headline}. Analysts closely watching developments in the ${event.category || 'global'} sector.`;

    let body;
    if (probabilityPercent >= 70) {
        body = `${headline}, according to market analysts tracking the development closely.

The event, which has garnered significant attention from investors and observers alike, appears increasingly likely to materialize based on current market conditions and emerging signals.

Industry experts suggest that recent developments have strengthened the case for this outcome, with multiple indicators pointing in this direction. Stakeholders are advised to monitor the situation as it evolves.`;
    } else if (probabilityPercent >= 40) {
        body = `Questions remain about whether ${eventTitle.toLowerCase().replace(/^will\s+/i, '').replace(/\?$/, '')}, as analysts continue to debate the likelihood of this outcome.

The situation remains fluid, with competing factors pulling in different directions. While some observers see positive signals, others urge caution given the inherent uncertainties involved.

Market participants are divided on the ultimate outcome, suggesting that significant developments could shift the calculus in either direction in the coming period.`;
    } else {
        body = `Despite skepticism from many analysts, attention continues to focus on whether ${eventTitle.toLowerCase().replace(/^will\s+/i, '').replace(/\?$/, '')}.

While current indicators suggest this outcome faces significant headwinds, proponents point to potential catalysts that could change the equation. The development bears watching as circumstances continue to evolve.

Observers note that while the probability appears low, the potential impact of such an outcome warrants continued monitoring of the situation.`;
    }

    return {
        headline,
        summary: summary.substring(0, 150),
        body,
        category: event.category || 'Other',
        eventId: event.id,
        probability: probabilityPercent / 100,
        imageUrl: event.image,
        expiresAt: event.endDate
    };
}

// Create and save article to database
async function createArticle(event, prediction) {
    // Check if article already exists for this event
    const existing = await db.articles.getByEventId(event.id);
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

    // Save to database
    return db.articles.create(articleData);
}

// Batch generate articles for multiple events
async function generateArticlesForEvents(events, predictions = {}) {
    const articles = [];

    for (const event of events) {
        try {
            const prediction = predictions[event.id];
            const article = await createArticle(event, prediction);
            articles.push(article);
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

    if (existingArticle) {
        // Update the existing article with new content
        const updatedArticle = await db.articles.update(existingArticle.id, {
            headline: articleData.headline,
            summary: articleData.summary,
            body: articleData.body,
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
