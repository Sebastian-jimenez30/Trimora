import { NextResponse } from 'next/server';
import { generateText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from '@/core/database/db';
import { chatMessages } from '@/core/database/schema';
import { getAiTools } from '@/modules/ai/tools';

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
    
    const coreMessages: { role: 'user' | 'assistant'; content: string }[] = chronologicalHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    // --- ESTRATEGIA DE FALLBACK ---
    // Inicializar el modelo NVIDIA principal (Laguna)
    const nvidiaModel = nvidia.chat('poolside/laguna-xs-2.1');
    // Inicializar el modelo NVIDIA secundario (Qwen)
    const qwenModel = nvidia.chat('qwen/qwen3.5-122b-a10b');

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
        console.error("Fallo Qwen (NVIDIA) también. Lanzando error para ver en logs...", qwenError);
        // En lugar de usar Gemini, lanzamos el error para que Vercel lo muestre en sus logs de producción.
        result = null;
        throw qwenError;
      }
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
        finalResponse = "He ejecutado la herramienta, pero no obtuve un mensaje de retorno claro.";
      } else {
        finalResponse = "Lo siento, procesé tu solicitud pero no pude generar una respuesta de texto.";
      }
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
