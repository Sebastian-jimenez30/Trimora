import { NextResponse } from 'next/server';
import { generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { createAppointmentFromAI } from '@/modules/appointments/actions';
import { db } from '@/core/database/db';
import { chatMessages } from '@/core/database/schema';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Configuración de NVIDIA
const nvidia = createOpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
});

// Función auxiliar para enviar un mensaje usando la API directa de Telegram
async function sendTelegramMessage(chatId: string | number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN is not configured.");
    return;
  }
  
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
    })
  });
  
  if (!response.ok) {
    console.error("Failed to send Telegram message:", await response.text());
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Telegram Webhook Payload:", JSON.stringify(body, null, 2));
    
    // Si no es un mensaje normal de texto, ignoramos
    if (!body.message || !body.message.text) {
      return NextResponse.json({ success: true });
    }
    
    const message = body.message.text;
    const chatId = body.message.chat.id;
    const fromName = body.message.from?.first_name || body.message.from?.username || "Usuario";
    const telegramUserId = body.message.from?.id?.toString() || chatId.toString();

    // Obtener la primera organización (Para nuestra prueba single-tenant)
    const org = await db.query.organizations.findFirst();
    if (!org) {
      throw new Error("No organization found");
    }

    // Obtener los servicios activos de la organización
    const orgServices = await db.query.services.findMany({
      where: (services, { eq, and }) => and(eq(services.organizationId, org.id), eq(services.isActive, true))
    });
    
    const servicesListText = orgServices.length > 0 
      ? orgServices.map(s => `- ${s.name} ($${s.price})`).join('\n')
      : "No hay servicios disponibles en este momento.";

    const systemPrompt = `Eres el recepcionista virtual de Trimora, una barbería. Eres súper amable, conciso y usas emojis moderadamente.
Tu objetivo principal es ayudar a los clientes a agendar citas. 
El cliente con el que hablas se llama ${fromName}.

SERVICIOS DISPONIBLES:
${servicesListText}

Si el cliente quiere agendar, asegúrate de tener el servicio exacto que quiere (DEBE ser uno de los servicios disponibles) y la fecha/hora (no le pidas el nombre, ya sabes que es ${fromName}).
Cuando tengas esos datos, EJECUTA la herramienta 'agendar_cita'. NO inventes confirmaciones si no has llamado a la herramienta.
Si el usuario solo saluda, devuélvele el saludo amablemente y menciónale los servicios disponibles.
IMPORTANTE: Hoy es ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })} (Zona horaria GMT-5)`;

    const tools = {
      agendar_cita: tool({
        description: 'Agenda una cita en la barbería con los datos proporcionados por el cliente.',
        inputSchema: z.object({
          serviceName: z.string().describe('El nombre exacto del servicio, ej. "Corte de cabello". Solo pon el nombre, NO oraciones completas.'),
          date: z.string().describe('La fecha y hora de la cita en formato ISO 8601 incluyendo la zona horaria GMT-5, ej. "2026-07-16T19:00:00-05:00" para las 7pm.'),
        }),
        execute: async (args: { serviceName: string; date: string }) => {
          const { serviceName, date } = args;
          try {
            const res = await createAppointmentFromAI({
              organizationId: org.id,
              customerName: fromName,
              customerPhone: telegramUserId,
              serviceName,
              date
            });
            return res.message;
          } catch (error: any) {
            console.error("Error creating AI appointment:", error);
            return `Lo siento, hubo un problema al agendar: ${error.message}. ¿Podrías intentar con otro servicio o darnos más detalles?`;
          }
        },
      }),
    };

    // --- MANEJO DE MEMORIA ---
    // Guardar el mensaje del usuario
    await db.insert(chatMessages).values({
      organizationId: org.id,
      telegramUserId,
      role: 'user',
      content: message,
    });

    // Recuperar últimos 10 mensajes
    const history = await db.query.chatMessages.findMany({
      where: (msgs, { eq, and }) => and(
        eq(msgs.organizationId, org.id), 
        eq(msgs.telegramUserId, telegramUserId)
      ),
      orderBy: (msgs, { desc }) => [desc(msgs.createdAt)],
      limit: 10
    });
    
    // Order chronological
    const chronologicalHistory = history.reverse();
    
    const coreMessages: { role: 'user' | 'assistant'; content: string }[] = chronologicalHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    // --- ESTRATEGIA DE FALLBACK ---
    // Inicializar el modelo NVIDIA principal (Laguna)
    const nvidiaModel = nvidia.chat('poolside/laguna-xs-2.1');
    // Inicializar el modelo NVIDIA secundario (Qwen)
    const qwenModel = nvidia.chat('qwen/qwen3.5-122b-a10b');
    // Inicializar Gemini como último recurso
    const googleModel = google('gemini-flash-latest');

    let result;
    try {
      result = await generateText({
        model: nvidiaModel,
        system: systemPrompt,
        messages: coreMessages,
        tools: tools,
      });
    } catch (error) {
      console.error("Fallo Laguna (NVIDIA), intentando Qwen (NVIDIA)...", error);
      try {
        result = await generateText({
          model: qwenModel,
          system: systemPrompt,
          messages: coreMessages,
          tools: tools,
        });
      } catch (qwenError) {
        console.error("Fallo Qwen (NVIDIA), usando Fallback final (Gemini)...", qwenError);
        try {
          result = await generateText({
            model: googleModel,
            system: systemPrompt,
            messages: coreMessages,
            tools: tools,
          });
        } catch (geminiError) {
          console.error("Fallo Gemini también...", geminiError);
          // Todos fallaron
          result = null;
        }
      }
    }

    // --- ENVIAR RESPUESTA ---
    let finalResponse = "";
    if (!result) {
      finalResponse = "Lo siento, nuestros servidores están muy ocupados o en mantenimiento en este momento. Por favor, intenta de nuevo en unos minutos. 🙏";
    } else if (result.text && result.text.trim().length > 0) {
      finalResponse = result.text;
    } else if (result.toolResults && result.toolResults.length > 0) {
      const toolRes = result.toolResults[0];
      const resultMessage = (toolRes as any).result;
      if (resultMessage && typeof resultMessage === 'string') {
        finalResponse = resultMessage;
      } else {
        finalResponse = "¡Perfecto! He procesado tu solicitud para la cita exitosamente. 🎉";
      }
    } else if (result.toolCalls && result.toolCalls.length > 0) {
      finalResponse = "¡Perfecto! He procesado tu solicitud de cita. 🎉";
    } else {
      finalResponse = "Lo siento, procesé tu solicitud pero no pude generar una respuesta de texto.";
    }

    if (finalResponse) {
      await sendTelegramMessage(chatId, finalResponse);
      
      // Guardar la respuesta del bot
      await db.insert(chatMessages).values({
        organizationId: org.id,
        telegramUserId,
        role: 'assistant',
        content: finalResponse,
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 200 });
  }
}
