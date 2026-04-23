import * as dotenv from 'dotenv';
dotenv.config();

async function testConnection() {
    const url = `${process.env.OPENAI_BASE_URL}chat/completions`;
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gemini-2.5-flash';

    console.log(`Connecting to: ${url}`);
    console.log(`Using model: ${model}`);

    const payload = {
        model: model,
        messages: [
            { role: 'user', content: 'Say hello world' }
        ]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        console.log(`Status: ${response.status}`);
        const responseText = await response.text();
        console.log(`Response body: ${responseText}`);
        
    } catch (e) {
        console.error('Fetch failed:', e);
    }
}

testConnection();
