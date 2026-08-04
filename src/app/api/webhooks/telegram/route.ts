import { generateText, isStepCount, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/core/database/db";
import { chatMessages, services } from "@/core/database/schema";
import { CUSTOMER_AI_CAPABILITIES } from "@/modules/ai/capabilities";
import { getAiTools } from "@/modules/ai/tools";
import { parseTelegramUpdate } from "@/modules/ai/webhooks/contracts";
import {
  getTelegramConfig,
  hashWebhookPayload,
  parseJsonBody,
  readWebhookBody,
  verifyTelegramSecret,
  WebhookHttpError,
} from "@/modules/ai/webhooks/security";
import { webhookErrorResponse, webhookSuccess } from "@/modules/ai/webhooks/responses";
import { processWebhookOnce } from "@/modules/ai/webhooks/processor";
import { enforceWebhookRateLimit, persistentWebhookEventStore } from "@/modules/ai/webhooks/store";

export const maxDuration = 10;

function readableStoredMessage(content: string) {
  try {
    const parsed = JSON.parse(content) as { text?: unknown };
    return typeof parsed.text === "string" ? parsed.text : null;
  } catch {
    return content;
  }
}

function buildFinalResponse(result: {
  text: string;
  toolResults: ReadonlyArray<{ output: unknown }>;
}) {
  const text = result.text.replace(/<think>[\s\S]*?<\/think>/giu, "").trim();
  const toolOutput = result.toolResults
    .map((toolResult) =>
      typeof toolResult.output === "string" ? toolResult.output : JSON.stringify(toolResult.output),
    )
    .filter(Boolean)
    .join("\n\n");

  if (text && toolOutput) return `${text}\n\n${toolOutput}`;
  return text || toolOutput || "Listo, procese tu solicitud correctamente.";
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  signal: AbortSignal,
) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal,
  });

  if (!response.ok) throw new Error("TELEGRAM_SEND_FAILED");
}

export async function POST(request: Request) {
  try {
    const config = getTelegramConfig();
    if (
      !verifyTelegramSecret(
        request.headers.get("x-telegram-bot-api-secret-token"),
        config.webhookSecret,
      )
    ) {
      throw new WebhookHttpError(401, "INVALID_SIGNATURE");
    }

    const rawBody = await readWebhookBody(request);
    const update = parseTelegramUpdate(parseJsonBody(rawBody));
    if (!update) return webhookSuccess("ignored");

    await enforceWebhookRateLimit(config.organizationId, "TELEGRAM");
    const processing = await processWebhookOnce(
      {
        organizationId: config.organizationId,
        provider: "TELEGRAM",
        externalEventId: update.updateId,
        payloadHash: hashWebhookPayload(rawBody),
      },
      async () => {
        const signal = AbortSignal.timeout(8_000);
        const organizationServices = await db.query.services.findMany({
          where: and(
            eq(services.organizationId, config.organizationId),
            eq(services.isActive, true),
          ),
        });
        const serviceLines = organizationServices.map((service) => {
          return `- ${service.name} ($${service.price})`;
        });
        const servicesList = serviceLines.join("\n") || "No hay servicios disponibles.";

        await db.insert(chatMessages).values({
          organizationId: config.organizationId,
          telegramUserId: update.senderId,
          role: "user",
          content: update.text,
        });

        const storedHistory = await db.query.chatMessages.findMany({
          where: and(
            eq(chatMessages.organizationId, config.organizationId),
            eq(chatMessages.telegramUserId, update.senderId),
          ),
          orderBy: [desc(chatMessages.createdAt)],
          limit: 10,
        });
        const messages: ModelMessage[] = [];
        for (const storedMessage of storedHistory.reverse()) {
          const content = readableStoredMessage(storedMessage.content);
          if (!content) continue;
          messages.push({
            role: storedMessage.role === "assistant" ? "assistant" : "user",
            content,
          });
        }

        const result = await generateText({
          model: openai("o4-mini"),
          system: `Eres el recepcionista virtual de Trimora. Atiendes a ${update.senderName} de forma amable y concisa.
Solo puedes consultar el catalogo y agendar citas; no tienes acceso a caja, finanzas, inventario, clientes ni administracion.

SERVICIOS DISPONIBLES:
${servicesList}

Usa agendar_cita o listar_servicios cuando corresponda. Nunca afirmes que agendaste algo sin ejecutar la herramienta.
Hoy es ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}.`,
          messages,
          tools: getAiTools({
            organizationId: config.organizationId,
            telegramUserId: update.senderId,
            fromName: update.senderName,
            capabilities: CUSTOMER_AI_CAPABILITIES,
          }),
          stopWhen: isStepCount(5),
          abortSignal: signal,
        });
        const responseText = buildFinalResponse(result);

        await sendTelegramMessage(config.botToken, update.chatId, responseText, signal);
        await db.insert(chatMessages).values({
          organizationId: config.organizationId,
          telegramUserId: update.senderId,
          role: "assistant",
          content: responseText,
        });
      },
      persistentWebhookEventStore,
    );

    return webhookSuccess(processing.duplicate ? "duplicate" : "processed");
  } catch (error: unknown) {
    return webhookErrorResponse(error, "telegram");
  }
}
