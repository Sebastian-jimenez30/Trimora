import { NextResponse } from "next/server";
import { generateText, isStepCount, type AssistantContent, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { db } from "@/core/database/db";
import { chatMessages, services } from "@/core/database/schema";
import { getAiTools } from "@/modules/ai/tools";
import { AuthorizationError, requireActor } from "@/core/auth/server/actor";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { getErrorMessage } from "@/core/errors";

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});
const storedToolResponseSchema = z.object({
  type: z.literal("tool-response"),
  text: z.string().optional(),
  toolCalls: z
    .array(
      z.object({
        toolCallId: z.string(),
        toolName: z.string(),
        input: z.unknown().optional(),
        args: z.unknown().optional(),
      }),
    )
    .optional(),
});

export async function POST(req: Request) {
  try {
    const actor = await requireActor();
    const { organizationId } = actor;
    const isAdmin = actor.role === "ADMIN";
    const orgName = actor.organizationName;
    const parsedBody = chatRequestSchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json({ success: false, error: "Mensaje inválido" }, { status: 400 });
    }
    const { message } = parsedBody.data;
    const fromName = actor.displayName;
    const chatKey = `web_${actor.userId}`;

    // Obtener servicios activos de la organización
    const orgServices = await db.query.services.findMany({
      where: and(eq(services.organizationId, organizationId), eq(services.isActive, true)),
    });

    const servicesListText =
      orgServices.length > 0
        ? orgServices.map((s) => `- ${s.name} ($${s.price})`).join("\n")
        : "No hay servicios registrados actualmente.";

    const systemPrompt = `Eres el asistente inteligente oficial de "${orgName}" en la plataforma Trimora. Eres amable, profesional, conciso y usas emojis moderadamente.
Estás hablando con ${fromName} (${isAdmin ? "Administrador" : "Barbero/Personal"}).

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
      isAdmin,
    });

    // --- GUARDAR MENSAJE DEL USUARIO ---
    await db.insert(chatMessages).values({
      organizationId,
      telegramUserId: chatKey,
      role: "user",
      content: message,
    });

    // --- RECUPERAR HISTORIAL RECIENTE (Últimos 10 mensajes) ---
    const history = await db.query.chatMessages.findMany({
      where: and(
        eq(chatMessages.organizationId, organizationId),
        eq(chatMessages.telegramUserId, chatKey),
      ),
      orderBy: [desc(chatMessages.createdAt)],
      limit: 10,
    });

    const chronologicalHistory = history.reverse();
    const coreMessages: ModelMessage[] = [];

    for (const m of chronologicalHistory) {
      if (m.role === "assistant") {
        try {
          const parsed = storedToolResponseSchema.parse(JSON.parse(m.content));
          if (parsed.type === "tool-response") {
            const assistantContent: AssistantContent = [];
            if (parsed.text) assistantContent.push({ type: "text", text: parsed.text });
            if (parsed.toolCalls?.length) {
              parsed.toolCalls.forEach((tc) => {
                assistantContent.push({
                  type: "tool-call",
                  toolCallId: tc.toolCallId,
                  toolName: tc.toolName,
                  input: tc.input ?? tc.args ?? {},
                });
              });
            }
            if (assistantContent.length > 0) {
              coreMessages.push({ role: "assistant", content: assistantContent });
            }
            if (parsed.toolCalls?.length) {
              coreMessages.push({
                role: "tool",
                content: parsed.toolCalls.map((tc) => ({
                  type: "tool-result",
                  toolCallId: tc.toolCallId,
                  toolName: tc.toolName,
                  output: { type: "json", value: { result: "Executed" } },
                })),
              });
            }
            continue;
          }
        } catch {}
      }
      coreMessages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      });
    }

    // Modelo de OpenAI
    const openaiModel = openai("o4-mini");

    let result;
    try {
      result = await generateText({
        model: openaiModel,
        system: systemPrompt,
        messages: coreMessages,
        tools: tools,
        stopWhen: isStepCount(5),
      });
    } catch (error: unknown) {
      console.error("Error from OpenAI API:", error);
      return NextResponse.json(
        { success: false, error: "Error conectando con la IA: " + getErrorMessage(error) },
        { status: 500 },
      );
    }

    let finalResponse = "";
    let textPart = "";
    if (!result) {
      finalResponse =
        "Lo siento, hubo un problema procesando tu solicitud. Por favor intenta de nuevo.";
    } else {
      textPart = result.text || "";
      textPart = textPart.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

      let toolsPart = "";
      if (result.toolResults && result.toolResults.length > 0) {
        toolsPart = result.toolResults
          .map((t) => {
            const resMsg = t.output;
            return typeof resMsg === "string" ? resMsg : JSON.stringify(resMsg);
          })
          .filter(Boolean)
          .join("\n\n");
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
        toolCalls: result.toolCalls.map((tc) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.input ?? {},
        })),
        toolResults: result.toolResults,
      });
    }

    await db.insert(chatMessages).values({
      organizationId,
      telegramUserId: chatKey,
      role: "assistant",
      content: dbContent,
    });

    return NextResponse.json({
      success: true,
      message: finalResponse,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    console.error("Chat API error:", error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, "Internal Server Error") },
      { status: 500 },
    );
  }
}
