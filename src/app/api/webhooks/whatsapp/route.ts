import { generateText, isStepCount, tool } from "ai";
import { google } from "@ai-sdk/google";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/core/database/db";
import { services } from "@/core/database/schema";
import { createAppointmentFromAI } from "@/modules/appointments/actions";
import { parseKapsoMessages } from "@/modules/ai/webhooks/contracts";
import { processWebhookOnce } from "@/modules/ai/webhooks/processor";
import { webhookErrorResponse, webhookSuccess } from "@/modules/ai/webhooks/responses";
import {
  getKapsoConfig,
  hashWebhookPayload,
  parseJsonBody,
  readWebhookBody,
  verifyKapsoSignature,
  WebhookHttpError,
} from "@/modules/ai/webhooks/security";
import { enforceWebhookRateLimit, persistentWebhookEventStore } from "@/modules/ai/webhooks/store";

export const maxDuration = 10;

async function sendWhatsAppMessage(
  apiKey: string,
  phoneNumberId: string,
  recipient: string,
  text: string,
  signal: AbortSignal,
) {
  const response = await fetch(
    `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "text",
        text: { body: text },
      }),
      signal,
    },
  );

  if (!response.ok) throw new Error("KAPSO_SEND_FAILED");
}

export async function POST(request: Request) {
  try {
    const config = getKapsoConfig();
    const rawBody = await readWebhookBody(request);
    if (
      !verifyKapsoSignature(
        rawBody,
        request.headers.get("x-webhook-signature"),
        config.webhookSecret,
      )
    ) {
      throw new WebhookHttpError(401, "INVALID_SIGNATURE");
    }

    const idempotencyKey = request.headers.get("x-idempotency-key");
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new WebhookHttpError(400, "MISSING_IDEMPOTENCY_KEY");
    }
    const messages = parseKapsoMessages(parseJsonBody(rawBody), config.phoneNumberId);
    if (messages.length === 0) return webhookSuccess("ignored");

    await enforceWebhookRateLimit(config.organizationId, "KAPSO");
    const processing = await processWebhookOnce(
      {
        organizationId: config.organizationId,
        provider: "KAPSO",
        externalEventId: idempotencyKey,
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

        await Promise.all(
          messages.map(async (incomingMessage) => {
            const result = await generateText({
              model: google("gemini-flash-latest"),
              system: `Eres el recepcionista virtual de Trimora. Solo puedes orientar sobre servicios y agendar citas.
No tienes acceso a caja, finanzas, inventario, clientes ni administracion.

SERVICIOS DISPONIBLES:
${servicesList}

Antes de agendar confirma nombre completo, servicio exacto y fecha/hora. Nunca confirmes una cita sin ejecutar agendar_cita.
Hoy es ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}.`,
              prompt: incomingMessage.text,
              tools: {
                agendar_cita: tool({
                  description: "Agenda una cita con los datos proporcionados por el cliente.",
                  inputSchema: z.object({
                    customerName: z.string().trim().min(2).max(160),
                    serviceName: z.string().trim().min(2).max(160),
                    date: z.iso.datetime({ offset: true }),
                  }),
                  execute: async ({ customerName, serviceName, date }) => {
                    const appointment = await createAppointmentFromAI({
                      organizationId: config.organizationId,
                      customerName,
                      customerPhone: incomingMessage.fromNumber,
                      serviceName,
                      date,
                    });
                    return appointment.message;
                  },
                }),
              },
              stopWhen: isStepCount(3),
              abortSignal: signal,
            });
            const toolOutput = result.toolResults[0]?.output;
            const responseText =
              typeof toolOutput === "string"
                ? toolOutput
                : result.text || "No pude procesar tu solicitud en este momento.";

            await sendWhatsAppMessage(
              config.apiKey,
              incomingMessage.phoneNumberId,
              incomingMessage.fromNumber,
              responseText,
              signal,
            );
          }),
        );
      },
      persistentWebhookEventStore,
    );

    return webhookSuccess(processing.duplicate ? "duplicate" : "processed");
  } catch (error: unknown) {
    return webhookErrorResponse(error, "kapso");
  }
}
