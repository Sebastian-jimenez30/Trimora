import { NextResponse } from 'next/server';
import { generateText, tool } from 'ai';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from '@/core/database/db';
import { chatMessages } from '@/core/database/schema';
import { getAiTools } from '@/modules/ai/tools';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Configuración de OpenAI (por defecto usa process.env.OPENAI_API_KEY)
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

    const systemPrompt = `Eres el asistente inteligente de Trimora, una barbería moderna. Eres amable, conciso y usas emojis moderadamente.
El usuario con el que hablas se llama ${fromName}.

CATÁLOGO DE SERVICIOS Y PRECIOS:
${servicesListText}

ROLES Y CAPACIDADES:
- Si el usuario te pide agendar una cita o preguntar sobre servicios, ayúdalo usando las herramientas 'agendar_cita' o 'listar_servicios'.
- Tienes acceso directo a la base de datos de Trimora. Eres capaz de registrar transacciones en caja, consultar ingresos/gastos de hoy, ver toda la agenda del día, y crear productos o servicios.
- SIEMPRE que te pidan registrar o consultar algo (agenda, caja, productos, ingresos), **USA TUS HERRAMIENTAS**. No digas que no puedes, tienes permisos para hacerlo.
- Usa los precios del CATÁLOGO para saber cuánto registrar en ingresos si te mencionan un servicio.
- IMPORTANTE: Hoy es ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })} (Zona horaria GMT-5).
- REGLA ESTRICTA: NUNCA inventes o simules en texto que "agendaste una cita" o "creaste un servicio". DEBES obligatoriamente usar la herramienta correspondiente. Si no usas la herramienta, la base de datos no se actualiza.
`;

    // Verifica si el usuario es el administrador (ID de prueba)
    const isAdmin = telegramUserId === '5190604908'; 

    const tools = getAiTools({
      organizationId: org.id,
      telegramUserId,
      fromName,
      isAdmin
    });

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
    const coreMessages: any[] = [];
    for (const m of chronologicalHistory) {
      if (m.role === 'assistant') {
        try {
          const parsed = JSON.parse(m.content);
          if (parsed.type === 'tool-response') {
             const assistantContent: any[] = [];
             if (parsed.text) {
                assistantContent.push({ type: 'text', text: parsed.text });
             }
             if (parsed.toolCalls && parsed.toolCalls.length > 0) {
                 parsed.toolCalls.forEach((tc: any) => {
                     assistantContent.push({ type: 'tool-call', toolCallId: tc.toolCallId, toolName: tc.toolName, args: tc.args || {} });
                 });
             }
             
             if (assistantContent.length > 0) {
                 coreMessages.push({ role: 'assistant', content: assistantContent });
             }

             if (parsed.toolCalls && parsed.toolCalls.length > 0) {
                 if (parsed.toolResults && parsed.toolResults.length > 0) {
                     coreMessages.push({
                       role: 'tool',
                       content: parsed.toolResults.map((tr: any) => ({ type: 'tool-result', toolCallId: tr.toolCallId, toolName: tr.toolName, result: tr.result || "Executed", output: tr.result || "Executed" }))
                     });
                 } else {
                     coreMessages.push({
                       role: 'tool',
                       content: parsed.toolCalls.map((tc: any) => ({ type: 'tool-result', toolCallId: tc.toolCallId, toolName: tc.toolName, result: "Executed", output: "Executed" }))
                     });
                 }
             }
             continue;
          }
        } catch (e) {
          // Ignorar y caer al comportamiento normal
        }
      }
      coreMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
    }

    // Inicializar el modelo OpenAI principal (o4-mini)
    const openaiModel = openai('o4-mini');

    let result;
    try {
      result = await generateText({
        model: openaiModel,
        system: systemPrompt,
        messages: coreMessages,
        tools: tools,
      });
    } catch (error) {
      console.error("Error from OpenAI (o4-mini)...", error);
      throw error;
    }

    // --- ENVIAR RESPUESTA ---
    let finalResponse = "";
    if (!result) {
      finalResponse = "Lo siento, nuestros servidores están muy ocupados o en mantenimiento en este momento. Por favor, intenta de nuevo en unos minutos. 🙏";
    } else {
      let textPart = result.text || "";
      // Limpiar etiquetas <think>...</think> si el modelo las incluye
      textPart = textPart.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      
      let toolsPart = "";
      if (result.toolResults && result.toolResults.length > 0) {
        toolsPart = result.toolResults
          .map(t => {
            const resMsg = (t as any).result || (t as any).output;
            return typeof resMsg === 'string' ? resMsg : JSON.stringify(resMsg);
          })
          .filter(Boolean)
          .join('\n\n');
      }

      if (textPart && toolsPart) {
        finalResponse = `${textPart}\n\n${toolsPart}`;
      } else if (textPart) {
        finalResponse = textPart;
      } else if (toolsPart) {
        finalResponse = toolsPart;
      } else if (result.toolCalls && result.toolCalls.length > 0) {
        finalResponse = "He ejecutado la herramienta correctamente.";
      } else {
        finalResponse = "Listo, he ejecutado la acción correctamente en el sistema.";
      }
    }

    if (finalResponse) {
      await sendTelegramMessage(chatId, finalResponse);
      
      let dbContent = finalResponse;
      if (result && result.toolCalls && result.toolCalls.length > 0) {
        dbContent = JSON.stringify({
          type: "tool-response",
          text: finalResponse,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults
        });
      }

      // Guardar la respuesta del bot
      await db.insert(chatMessages).values({
        organizationId: org.id,
        telegramUserId,
        role: 'assistant',
        content: dbContent,
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 200 });
  }
}
