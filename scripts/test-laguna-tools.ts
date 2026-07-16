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
    console.log("Probando soporte de herramientas en Laguna...");
    const result = await generateText({
      model: nvidiaModel,
      prompt: 'Agenda una cita para corte de cabello el viernes a las 5pm',
      tools: {
        agendar_cita: tool({
          description: 'Agenda una cita en la barbería.',
          inputSchema: z.object({
            serviceName: z.string(),
            date: z.string(),
          }),
          execute: async (args) => {
            console.log("HERRAMIENTA LLAMADA CON:", args);
            return "Cita agendada";
          }
        })
      }
    });
    console.log("TOOL CALLS:", result.toolCalls);
    console.log("TEXT:", result.text);
  } catch (error) {
    console.error("ERROR EN LAGUNA:", error);
  }
}

main();
