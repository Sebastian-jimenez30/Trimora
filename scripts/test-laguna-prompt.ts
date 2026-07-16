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
      prompt: "Ahora quiero agendar para un amigo que se llama emiliano, agendale una cita a emiliano para el 16 de julio a las 7 de la noche porfavor para corte clasico, agr¿endalo de una vez",
      tools: {
        agendar_cita: tool({
          description: 'Agenda una cita.',
          inputSchema: z.object({
            serviceName: z.string(),
            date: z.string(),
          }),
          execute: async () => "ok"
        })
      }
    });
    console.log("SUCCESS LAGUNA:", result.text);
    console.log("TOOL CALLS:", result.toolCalls);
  } catch (error) {
    console.error("ERROR LAGUNA:", error);
  }
}
main();
