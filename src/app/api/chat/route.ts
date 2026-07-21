import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { db } from '@/core/database/db';
import { chatMessages, organizationMembers, organizations, services } from '@/core/database/schema';
import { getAiTools } from '@/modules/ai/tools';
import { createClient } from '@/core/database/server';
import { eq, and, desc } from 'drizzle-orm';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "No autenticado" }, { status: 401 });
    }

    // Buscar la organización y rol del usuario
    const members = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, user.id)).limit(1);
    if (!members[0]) {
      return NextResponse.json({ success: false, error: "El usuario no pertenece a ninguna organización" }, { status: 403 });
    }

    const member = members[0];
    const organizationId = member.organizationId;
    const isAdmin = member.role === 'ADMIN';

    // Obtener detalles de la organización
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId)
    });
    const orgName = org?.name || "Trimora";

    const body = await req.json();
    const message = body.message;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ success: false, error: "Mensaje vacío" }, { status: 400 });
    }

    const metadataName = user.user_metadata?.full_name;
    const emailName = user.email?.split("@")[0] || "Usuario";
    const fromName = metadataName || emailName;
    const chatKey = `web_${user.id}`;

    // Obtener servicios activos de la organización
    const orgServices = await db.query.services.findMany({
      where: and(eq(services.organizationId, organizationId), eq(services.isActive, true))
    });

    const servicesListText = orgServices.length > 0 
      ? orgServices.map(s => `- ${s.name} ($${s.price})`).join('\n')
      : "No hay servicios registrados actualmente.";

    const systemPrompt = `Eres el asistente inteligente oficial de "${orgName}" en la plataforma Trimora. Eres amable, profesional, conciso y usas emojis moderadamente.
Estás hablando con ${fromName} (${isAdmin ? 'Administrador' : 'Barbero/Personal'}).

CATÁLOGO DE SERVICIOS Y PRECIOS DE ${orgName.toUpperCase()}:
${servicesListText}

CAPACIDADES Y ROLES:
- Si el usuario te pide agendar una cita o preguntar sobre servicios, ayúdalo usando las herramientas 'agendar_cita' o 'listar_servicios'.
- Tienes acceso directo a la base de datos de ${orgName}. Puedes:
  * Consultar inventario/productos → 'consultar_productos'
  * Consultar clientes → 'consultar_clientes'
  * Consultar historial de transacciones → 'consultar_transacciones'
  * Consultar la agenda de citas → 'consultar_citas' o 'consultar_agenda_hoy'
  * Consultar resumen financiero → 'consultar_finanzas_hoy'
  * Registrar ventas de productos → 'registrar_venta_producto'
  * Registrar movimientos de caja → 'registrar_transaccion_caja'
  * Crear nuevos productos/servicios → 'crear_producto', 'crear_servicio'
- SIEMPRE que te pidan registrar o consultar algo (agenda, caja, productos, ingresos, clientes), **USA TUS HERRAMIENTAS**. No digas que no puedes.
- IMPORTANTE: Hoy es ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })} (Zona horaria GMT-5).
- REGLA ESTRICTA: NUNCA inventes o simules en texto que registraste o agendaste algo. DEBES ejecutar la herramienta correspondiente.
`;

    const tools = getAiTools({
      organizationId,
      telegramUserId: chatKey,
      fromName,
      isAdmin
    });

    // --- GUARDAR MENSAJE DEL USUARIO ---
    await db.insert(chatMessages).values({
      organizationId,
      telegramUserId: chatKey,
      role: 'user',
      content: message,
    });

    // --- RECUPERAR HISTORIAL RECIENTE (Últimos 10 mensajes) ---
    const history = await db.query.chatMessages.findMany({
      where: and(
        eq(chatMessages.organizationId, organizationId), 
        eq(chatMessages.telegramUserId, chatKey)
      ),
      orderBy: [desc(chatMessages.createdAt)],
      limit: 10
    });

    const chronologicalHistory = history.reverse();
    const coreMessages: any[] = [];

    for (const m of chronologicalHistory) {
      if (m.role === 'assistant') {
        try {
          const parsed = JSON.parse(m.content);
          if (parsed.type === 'tool-response') {
            const assistantContent: any[] = [];
            if (parsed.text) assistantContent.push({ type: 'text', text: parsed.text });
            if (parsed.toolCalls?.length) {
              parsed.toolCalls.forEach((tc: any) => {
                assistantContent.push({ type: 'tool-call', toolCallId: tc.toolCallId, toolName: tc.toolName, input: tc.input ?? tc.args ?? {} });
              });
            }
            if (assistantContent.length > 0) {
              coreMessages.push({ role: 'assistant', content: assistantContent });
            }
            if (parsed.toolCalls?.length) {
              coreMessages.push({
                role: 'tool',
                content: parsed.toolCalls.map((tc: any) => ({
                  type: 'tool-result',
                  toolCallId: tc.toolCallId,
                  toolName: tc.toolName,
                  output: { type: 'json', value: { result: 'Executed' } }
                }))
              });
            }
            continue;
          }
        } catch (_) {}
      }
      coreMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
    }

    // Modelo de OpenAI
    const openaiModel = openai('o4-mini');

    let result;
    try {
      result = await generateText({
        model: openaiModel,
        system: systemPrompt,
        messages: coreMessages,
        tools: tools,
      });
    } catch (error: any) {
      console.error("Error from OpenAI API:", error);
      return NextResponse.json({ success: false, error: "Error conectando con la IA: " + error.message }, { status: 500 });
    }

    let finalResponse = "";
    let textPart = "";
    if (!result) {
      finalResponse = "Lo siento, hubo un problema procesando tu solicitud. Por favor intenta de nuevo.";
    } else {
      textPart = result.text || "";
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
      } else {
        finalResponse = "Acción ejecutada correctamente en el sistema.";
      }
    }

    // --- GUARDAR RESPUESTA DEL ASISTENTE ---
    let dbContent = finalResponse;
    if (result && result.toolCalls && result.toolCalls.length > 0) {
      dbContent = JSON.stringify({
        type: "tool-response",
        text: textPart,
        toolCalls: result.toolCalls.map((tc: any) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.input ?? tc.args ?? {},
        })),
        toolResults: result.toolResults
      });
    }

    await db.insert(chatMessages).values({
      organizationId,
      telegramUserId: chatKey,
      role: 'assistant',
      content: dbContent,
    });

    return NextResponse.json({
      success: true,
      message: finalResponse
    });

  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
