import { generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const nvidia = createOpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
});
const nvidiaModel = nvidia.chat('poolside/laguna-xs-2.1');

async function main() {
  const result = await generateText({
    model: nvidiaModel,
    prompt: "Dame las finanzas de hoy porfavor",
    tools: {
      consultar_finanzas_hoy: tool({
        description: 'Consulta las finanzas',
        inputSchema: z.object({}),
        execute: async () => {
          console.log("TOOL EXECUTED!");
          return "Tus finanzas son 500 USD.";
        }
      })
    }
  });

  console.log("TEXT:", result.text);
  console.log("TOOL CALLS:", JSON.stringify(result.toolCalls, null, 2));
  console.log("TOOL RESULTS:", JSON.stringify(result.toolResults, null, 2));
}
main();
