import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const apiKey = process.env.NVIDIA_API_KEY;
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'poolside/laguna-xs-2.1',
      messages: [{ role: 'user', content: 'Hola, dime qué tipo de modelo eres y en qué te especializas' }],
      max_tokens: 200
    })
  });
  
  const text = await response.text();
  console.log(`Status: ${response.status}`);
  console.log(`Response: ${text}`);
}

main();
