import { z } from "zod";
import { WebhookHttpError } from "./security";

const telegramMessageSchema = z.object({
  message_id: z.number().int().nonnegative(),
  text: z.string().trim().min(1).max(4096),
  chat: z.object({ id: z.union([z.number().int(), z.string().min(1).max(64)]) }).passthrough(),
  from: z
    .object({
      id: z.number().int().nonnegative(),
      first_name: z.string().max(128).optional(),
      username: z.string().max(64).optional(),
    })
    .passthrough()
    .optional(),
});

const telegramUpdateSchema = z
  .object({
    update_id: z.number().int().nonnegative(),
    message: z.unknown().optional(),
  })
  .passthrough();

const kapsoMessageDataSchema = z
  .object({
    phone_number_id: z.string().min(1).max(64),
    conversation: z.object({ phone_number: z.string().min(5).max(32) }).passthrough(),
    message: z
      .object({
        kapso: z.object({ content: z.string().trim().min(1).max(4096) }).passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const kapsoEnvelopeSchema = z
  .object({
    event: z.string().max(128).optional(),
    data: z.unknown().optional(),
    phone_number_id: z.string().max(64).optional(),
    conversation: z.unknown().optional(),
    message: z.unknown().optional(),
  })
  .passthrough();

const kapsoDeliverySchema = z
  .object({
    batch: z.boolean().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

export type TelegramTextUpdate = {
  updateId: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
};

export type KapsoIncomingMessage = {
  phoneNumberId: string;
  fromNumber: string;
  text: string;
};

export function parseTelegramUpdate(payload: unknown): TelegramTextUpdate | null {
  const parsed = telegramUpdateSchema.safeParse(payload);
  if (!parsed.success) throw new WebhookHttpError(400, "INVALID_TELEGRAM_PAYLOAD");
  if (!parsed.data.message) return null;

  const parsedMessage = telegramMessageSchema.safeParse(parsed.data.message);
  if (!parsedMessage.success) {
    const hasText =
      typeof parsed.data.message === "object" &&
      parsed.data.message !== null &&
      "text" in parsed.data.message;
    if (hasText) throw new WebhookHttpError(400, "INVALID_TELEGRAM_PAYLOAD");
    return null;
  }

  const message = parsedMessage.data;
  const chatId = String(message.chat.id);
  return {
    updateId: String(parsed.data.update_id),
    chatId,
    senderId: String(message.from?.id ?? chatId),
    senderName: message.from?.first_name ?? message.from?.username ?? "Usuario",
    text: message.text,
  };
}

export function parseKapsoMessages(
  payload: unknown,
  expectedPhoneNumberId: string,
): KapsoIncomingMessage[] {
  const delivery = kapsoDeliverySchema.safeParse(payload);
  if (!delivery.success) throw new WebhookHttpError(400, "INVALID_KAPSO_PAYLOAD");

  const candidates =
    delivery.data.batch === true
      ? z.array(kapsoEnvelopeSchema).min(1).max(10).safeParse(delivery.data.data)
      : z.array(kapsoEnvelopeSchema).safeParse([delivery.data]);
  if (!candidates.success) throw new WebhookHttpError(400, "INVALID_KAPSO_PAYLOAD");

  const messages: KapsoIncomingMessage[] = [];
  for (const candidate of candidates.data) {
    if (candidate.event && candidate.event !== "whatsapp.message.received") continue;
    const eventPayload = candidate.data ?? candidate;
    const parsedMessage = kapsoMessageDataSchema.safeParse(eventPayload);
    if (!parsedMessage.success) throw new WebhookHttpError(400, "INCOMPLETE_KAPSO_MESSAGE");
    if (parsedMessage.data.phone_number_id !== expectedPhoneNumberId) {
      throw new WebhookHttpError(403, "CHANNEL_MISMATCH");
    }
    messages.push({
      phoneNumberId: parsedMessage.data.phone_number_id,
      fromNumber: parsedMessage.data.conversation.phone_number,
      text: parsedMessage.data.message.kapso.content,
    });
  }

  return messages;
}
