// Check OpenAI API key organization and billing status
require('dotenv').config({ override: true });

async function checkOrganization() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        console.error('ERROR: No API key found');
        return;
    }

    console.log('API Key type:', apiKey.startsWith('sk-proj-') ? 'Project-scoped' : 'Organization-scoped');
    console.log('');

    try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey });

        // Try to get models (this will fail with 429 if no quota)
        console.log('Checking API access...');
        const models = await openai.models.list();

        console.log('✅ API key is working!');
        console.log('Available models:', models.data.slice(0, 3).map(m => m.id).join(', '));

    } catch (error) {
        console.error('❌ API Error:', error.status, '-', error.message);
        console.error('');
        console.error('🔍 DIAGNOSIS:');

        if (error.code === 'insufficient_quota') {
            console.error('Your API key does not have access to billing credits.');
            console.error('');
            console.error('SOLUTION:');
            console.error('1. Visit: https://platform.openai.com/settings/organization/billing');
            console.error('2. Check which organization has your $25 credits');
            console.error('3. Visit: https://platform.openai.com/api-keys');
            console.error('4. Create a NEW key from the organization with credits');
            console.error('5. If using project keys, ensure the project has billing enabled');
            console.error('');
            console.error('TIP: Use an organization-level key (not project-scoped) to avoid this issue');
        }
    }
}

checkOrganization();
