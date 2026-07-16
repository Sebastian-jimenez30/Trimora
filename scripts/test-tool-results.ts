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
  try {
    const result = await generateText({
      model: nvidiaModel,
      prompt: 'Agenda una cita para corte de cabello el viernes a las 5pm',
      tools: {
        agendar_cita: tool({
          description: 'Agenda una cita.',
          inputSchema: z.object({
            serviceName: z.string(),
            date: z.string(),
          }),
          execute: async (args) => {
            return "RESULTADO_EXITOSO";
          }
        })
      }
    });
    console.log("TOOL_RESULTS:", JSON.stringify(result.toolResults, null, 2));
  } catch (error) {
    console.error("ERROR:", error);
  }
}
main();
