// Test OpenAI API key directly
require('dotenv').config({ override: true });

async function testOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY;

    console.log('API Key (first 20 chars):', apiKey?.substring(0, 20) + '...');
    console.log('API Key length:', apiKey?.length);
    console.log('');

    if (!apiKey) {
        console.error('ERROR: No API key found in environment');
        return;
    }

    try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey });

        console.log('Testing OpenAI API with gpt-4o-mini...');
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'user', content: 'Say "test successful" and nothing else.' }
            ],
            max_tokens: 10
        });

        console.log('✅ SUCCESS!');
        console.log('Response:', response.choices[0].message.content);
        console.log('Usage:', response.usage);

    } catch (error) {
        console.error('❌ ERROR:');
        console.error('Status:', error.status);
        console.error('Message:', error.message);
        console.error('Type:', error.type);
        console.error('Code:', error.code);
        console.error('');

        if (error.status === 429) {
            console.error('This is a rate limit or quota error. Details:');
            console.error('- Check: https://platform.openai.com/account/limits');
            console.error('- Check: https://platform.openai.com/settings/organization/billing');
            console.error('- Your API key might be associated with a different org than your credits');
            console.error('- Try generating a new API key from the org that has credits');
        }
    }
}

testOpenAI();
