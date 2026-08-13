import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const MAX_WEBHOOK_BYTES = 256 * 1024;

type WebhookEnvironment = Readonly<Record<string, string | undefined>>;

const telegramConfigSchema = z.object({
  organizationId: z.uuid(),
  webhookSecret: z
    .string()
    .min(16)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/u),
  botToken: z.string().min(20).max(256),
});

const kapsoConfigSchema = z.object({
  organizationId: z.uuid(),
  webhookSecret: z.string().min(16).max(512),
  apiKey: z.string().min(16).max(512),
  phoneNumberId: z.string().min(1).max(64),
});

export class WebhookHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "WebhookHttpError";
  }
}

export function getTelegramConfig(environment: WebhookEnvironment = process.env) {
  const result = telegramConfigSchema.safeParse({
    organizationId: environment.TELEGRAM_ORGANIZATION_ID,
    webhookSecret: environment.TELEGRAM_WEBHOOK_SECRET,
    botToken: environment.TELEGRAM_BOT_TOKEN,
  });
  if (!result.success) throw new WebhookHttpError(503, "TELEGRAM_NOT_CONFIGURED");
  return result.data;
}

export function getKapsoConfig(environment: WebhookEnvironment = process.env) {
  const result = kapsoConfigSchema.safeParse({
    organizationId: environment.KAPSO_ORGANIZATION_ID,
    webhookSecret: environment.KAPSO_WEBHOOK_SECRET,
    apiKey: environment.KAPSO_API_KEY,
    phoneNumberId: environment.KAPSO_PHONE_NUMBER_ID,
  });
  if (!result.success) throw new WebhookHttpError(503, "KAPSO_NOT_CONFIGURED");
  return result.data;
}

function constantTimeEquals(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function verifyTelegramSecret(receivedSecret: string | null, expectedSecret: string) {
  return constantTimeEquals(receivedSecret, expectedSecret);
}

export function verifyKapsoSignature(
  rawBody: string,
  receivedSignature: string | null,
  secret: string,
) {
  const expectedSignature = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return constantTimeEquals(receivedSignature?.toLowerCase() ?? null, expectedSignature);
}

export function hashWebhookPayload(rawBody: string) {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export function parseJsonBody(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new WebhookHttpError(400, "INVALID_JSON");
  }
}

export async function readWebhookBody(request: Request, maxBytes = MAX_WEBHOOK_BYTES) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new WebhookHttpError(413, "PAYLOAD_TOO_LARGE");
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new WebhookHttpError(413, "PAYLOAD_TOO_LARGE");
    }
    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}
