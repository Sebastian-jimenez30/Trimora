import { generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const nvidia = createOpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
});

const qwenModel = nvidia.chat('qwen/qwen3.5-122b-a10b');

async function main() {
  try {
    const result = await generateText({
      model: qwenModel,
      prompt: "Hola",
    });
    console.log("SUCCESS QWEN:", result.text);
  } catch (error) {
    console.error("ERROR QWEN:", error);
  }
}
main();
