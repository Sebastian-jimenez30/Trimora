import { NextResponse } from 'next/server';
import { generateText, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { createAppointmentFromAI } from '@/modules/appointments/actions';
import { db } from '@/core/database/db';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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
    // fromNumber en WhatsApp lo usábamos para guardar el teléfono, aquí podemos guardar el username de Telegram
    // o el ID como string temporalmente.
    const fromName = body.message.from?.first_name || body.message.from?.username || "Usuario";
    const telegramUserId = body.message.from?.id?.toString() || chatId.toString();

    // Obtener la primera organización (Para nuestra prueba single-tenant)
    const org = await db.query.organizations.findFirst();
    if (!org) {
      throw new Error("No organization found");
    }

    // Obtener los servicios activos de la organización para inyectarlos en el prompt
    const orgServices = await db.query.services.findMany({
      where: (services, { eq, and }) => and(eq(services.organizationId, org.id), eq(services.isActive, true))
    });
    
    const servicesListText = orgServices.length > 0 
      ? orgServices.map(s => `- ${s.name} ($${s.price})`).join('\n')
      : "No hay servicios disponibles en este momento.";

    // --- EL CEREBRO DEL AGENTE ---
    const result = await generateText({
      model: google('gemini-flash-latest'),
      system: `Eres el recepcionista virtual de Trimora, una barbería. Eres súper amable, conciso y usas emojis moderadamente.
Tu objetivo principal es ayudar a los clientes a agendar citas. 
El cliente con el que hablas se llama ${fromName}.

SERVICIOS DISPONIBLES:
${servicesListText}

Si el cliente quiere agendar, asegúrate de tener el servicio exacto que quiere (DEBE ser uno de los servicios disponibles) y la fecha/hora (no le pidas el nombre, ya sabes que es ${fromName}).
Cuando tengas esos datos, EJECUTA la herramienta 'agendar_cita'. NO inventes confirmaciones si no has llamado a la herramienta.
Si el usuario solo saluda, devuélvele el saludo amablemente y menciónale los servicios disponibles.
IMPORTANTE: Hoy es ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })} (Zona horaria GMT-5)`,
      prompt: message,
      tools: {
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
                customerPhone: telegramUserId, // Guardamos el ID de telegram como "teléfono" para enlazar la cuenta
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
      }
    });

    // Enviamos la respuesta final generada por Gemini de vuelta al Telegram del cliente
    console.log("Gemini Result:", {
      text: result.text,
      toolCalls: result.toolCalls,
      toolResults: result.toolResults
    });

    let finalResponse = "";

    if (result.toolResults && result.toolResults.length > 0) {
      const toolRes = result.toolResults[0];
      finalResponse = (toolRes as any).result ? String((toolRes as any).result) : `La herramienta se ejecutó pero no devolvió texto. Argumentos: ${JSON.stringify((result.toolCalls?.[0] as any)?.args)}`;
    } else if (result.text) {
      finalResponse = result.text;
    } else {
      finalResponse = "Lo siento, procesé tu solicitud pero no pude generar una respuesta de texto.";
    }

    if (finalResponse) {
      await sendTelegramMessage(chatId, finalResponse);
    }
    
    // Telegram exige responder 200 OK para no reintentar
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 200 });
  }
}
