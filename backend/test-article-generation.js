// Test actual article generation like the app does
require('dotenv').config({ override: true });

async function testArticleGeneration() {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!apiKey) {
        console.error('ERROR: No API key found');
        return;
    }

    console.log('Testing article generation with model:', model);
    console.log('');

    try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey });

        // Simulate actual article generation request
        const response = await openai.chat.completions.create({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a journalist writing predictive news articles.'
                },
                {
                    role: 'user',
                    content: 'Write a short news article about Bitcoin reaching $100k. Return JSON with: headline, summary, body'
                }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 1000,
            temperature: 0.7
        });

        console.log('✅ SUCCESS! Article generation works');
        console.log('');
        console.log('Usage:', response.usage);
        console.log('Cost estimate: $', (
            response.usage.prompt_tokens * 0.00000015 +
            response.usage.completion_tokens * 0.0000006
        ).toFixed(6));
        console.log('');
        console.log('Response preview:', response.choices[0].message.content.substring(0, 200) + '...');

    } catch (error) {
        console.error('❌ ERROR during article generation:');
        console.error('Status:', error.status);
        console.error('Code:', error.code);
        console.error('Message:', error.message);
        console.error('');

        if (error.status === 429) {
            console.error('🔍 429 ERROR DIAGNOSIS:');
            console.error('');

            if (error.code === 'insufficient_quota') {
                console.error('ISSUE: No quota/credits available');
                console.error('- Your key has no billing credits attached');
                console.error('- Create a new key from the org with credits');
            } else if (error.code === 'rate_limit_exceeded') {
                console.error('ISSUE: Rate limit exceeded (requests per minute)');
                console.error('- You are making too many requests too quickly');
                console.error('- Wait a minute and try again');
                console.error('- Consider implementing rate limiting in your app');
            } else {
                console.error('ISSUE: Unknown 429 error');
                console.error('- Check: https://platform.openai.com/account/limits');
            }
        }
    }
}

testArticleGeneration();
