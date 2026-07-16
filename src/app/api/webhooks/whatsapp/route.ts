import { NextResponse } from 'next/server';
import { generateText, tool } from 'ai';
import { groq } from '@ai-sdk/groq';
import { z } from 'zod';
import { createAppointmentFromAI } from '@/modules/appointments/actions';
import { db } from '@/core/database/db';

const KAPSO_API_KEY = process.env.KAPSO_API_KEY;

// Función auxiliar para enviar un mensaje usando la API directa de Kapso
async function sendWhatsAppMessage(phoneNumberId: string, to: string, text: string) {
  const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-API-Key': KAPSO_API_KEY || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "text",
      text: {
        body: text
      }
    })
  });
  
  if (!response.ok) {
    console.error("Failed to send WhatsApp message:", await response.text());
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Kapso Webhook Payload:", JSON.stringify(body, null, 2));
    
    // Kapso envía webhooks en lote (batch) o individuales.
    let events = [];
    if (body.batch && Array.isArray(body.data)) {
      events = body.data;
    } else {
      events = [body];
    }
    
    for (const event of events) {
      // Kapso v2 a veces manda el payload directo sin campo `type` cuando no está en batch.
      const eventData = event.data || event;
      
      // Si no es un mensaje entrante, lo saltamos
      if (!eventData.message) continue;
      
      const message = eventData.message?.kapso?.content;
      const fromNumber = eventData.conversation?.phone_number;
      const phoneNumberId = eventData.phone_number_id;
      
      if (!message || !fromNumber || !phoneNumberId) {
        console.log("Ignorando webhook porque faltan datos esenciales.", {
          message: !!message,
          fromNumber: !!fromNumber,
          phoneNumberId: !!phoneNumberId
        });
        continue;
      }

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
          ? orgServices.map(s => `- ${s.name} ($${s.price})`).join('\\n')
          : "No hay servicios disponibles en este momento.";

        // --- EL CEREBRO DEL AGENTE ---
        // Procesamos el mensaje con Groq Llama 3.1 y le damos la herramienta de agendar
        const result = await generateText({
          model: groq('llama-3.1-8b-instant'),
          system: `Eres el recepcionista virtual de Trimora. Eres súper amable, conciso y usas emojis moderadamente.
Tu objetivo principal es ayudar a los clientes a agendar citas. 

SERVICIOS DISPONIBLES:
${servicesListText}

Si el cliente quiere agendar, asegúrate de tener su nombre completo, el servicio exacto que quiere (DEBE ser uno de los servicios disponibles) y la fecha/hora.
Cuando tengas esos 3 datos, EJECUTA la herramienta 'agendar_cita'. NO inventes confirmaciones si no has llamado a la herramienta.
Si el usuario solo saluda, devuélvele el saludo amablemente y menciónale los servicios disponibles.
IMPORTANTE: Hoy es ${new Date().toLocaleString()}`,
          prompt: message,
          tools: {
            agendar_cita: tool({
              description: 'Agenda una cita en la barbería con los datos proporcionados por el cliente.',
              inputSchema: z.object({
                customerName: z.string().describe('El nombre completo del cliente.'),
                serviceName: z.string().describe('El nombre exacto del servicio, ej. "Corte de cabello". Solo pon el nombre, NO oraciones completas.'),
                date: z.string().describe('La fecha y hora de la cita en formato ISO 8601, ej. "2026-07-16T15:00:00".'),
              }),
              execute: async (args: { customerName: string; serviceName: string; date: string }) => {
                const { customerName, serviceName, date } = args;
                try {
                  const res = await createAppointmentFromAI({
                    organizationId: org.id,
                    customerName,
                    customerPhone: fromNumber,
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

        // Enviamos la respuesta final generada por Gemini de vuelta al WhatsApp del cliente
        if (result.toolResults && result.toolResults.length > 0) {
          // Si ejecutó una herramienta, le enviamos el resultado
          const message = (result.toolResults[0] as any).result as string;
          await sendWhatsAppMessage(phoneNumberId, fromNumber, message);
        } else if (result.text) {
          // Si solo respondió con texto
          await sendWhatsAppMessage(phoneNumberId, fromNumber, result.text);
        }
    }
    
    // Siempre respondemos 200 OK a Kapso dentro de 10 segundos para que no reintente
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 200 });
  }
}
