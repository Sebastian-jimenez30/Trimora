import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  getKapsoConfig,
  getTelegramConfig,
  hashWebhookPayload,
  readWebhookBody,
  verifyKapsoSignature,
  verifyTelegramSecret,
} from "../security";

describe("webhook security", () => {
  it("acepta solamente el secreto exacto de Telegram", () => {
    expect(verifyTelegramSecret("secret-token-1234", "secret-token-1234")).toBe(true);
    expect(verifyTelegramSecret("secret-token-1235", "secret-token-1234")).toBe(false);
    expect(verifyTelegramSecret(null, "secret-token-1234")).toBe(false);
  });

  it("valida la firma HMAC SHA256 de Kapso sobre el cuerpo sin transformar", () => {
    const rawBody = '{"event":"whatsapp.message.received"}';
    const secret = "kapso-webhook-secret";
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    expect(verifyKapsoSignature(rawBody, signature, secret)).toBe(true);
    expect(verifyKapsoSignature(`${rawBody} `, signature, secret)).toBe(false);
  });

  it("calcula una huella estable sin conservar el payload", () => {
    expect(hashWebhookPayload("same-event")).toMatch(/^[a-f0-9]{64}$/u);
    expect(hashWebhookPayload("same-event")).toBe(hashWebhookPayload("same-event"));
  });

  it("rechaza cuerpos que exceden el limite aunque usen transferencia por chunks", async () => {
    const request = new Request("https://trimora.test/webhook", {
      method: "POST",
      body: "123456",
    });

    await expect(readWebhookBody(request, 5)).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("asocia cada proveedor con una organizacion definida por el servidor", () => {
    const organizationId = "10000000-0000-4000-8000-000000000020";
    expect(
      getTelegramConfig({
        TELEGRAM_ORGANIZATION_ID: organizationId,
        TELEGRAM_WEBHOOK_SECRET: "telegram-secret-1234",
        TELEGRAM_BOT_TOKEN: "123456789:telegram-bot-token-value",
      }),
    ).toMatchObject({ organizationId });
    expect(
      getKapsoConfig({
        KAPSO_ORGANIZATION_ID: organizationId,
        KAPSO_WEBHOOK_SECRET: "kapso-secret-12345",
        KAPSO_API_KEY: "kapso-api-key-12345",
        KAPSO_PHONE_NUMBER_ID: "phone-channel-1",
      }),
    ).toMatchObject({ organizationId, phoneNumberId: "phone-channel-1" });
  });
});
