import { describe, expect, it } from "vitest";
import { parseKapsoMessages, parseTelegramUpdate } from "../contracts";

const kapsoMessage = {
  event: "whatsapp.message.received",
  data: {
    phone_number_id: "channel-1",
    conversation: { phone_number: "573001112233" },
    message: { kapso: { content: "Quiero un corte" } },
  },
};

describe("provider contracts", () => {
  it("normaliza un mensaje de texto oficial de Telegram", () => {
    expect(
      parseTelegramUpdate({
        update_id: 99,
        message: {
          message_id: 10,
          text: "Hola",
          chat: { id: 123 },
          from: { id: 456, first_name: "Ana" },
        },
      }),
    ).toEqual({
      updateId: "99",
      chatId: "123",
      senderId: "456",
      senderName: "Ana",
      text: "Hola",
    });
  });

  it("acepta mensajes Kapso individuales y en lote", () => {
    expect(parseKapsoMessages(kapsoMessage, "channel-1")).toHaveLength(1);
    const batchMessages = parseKapsoMessages({ batch: true, data: [kapsoMessage] }, "channel-1");
    expect(batchMessages).toHaveLength(1);
  });

  it("rechaza un evento perteneciente a otro canal", () => {
    expect(() => parseKapsoMessages(kapsoMessage, "channel-2")).toThrowError("CHANNEL_MISMATCH");
  });

  it("rechaza mensajes entrantes incompletos", () => {
    expect(() =>
      parseKapsoMessages(
        {
          event: "whatsapp.message.received",
          data: { phone_number_id: "channel-1", message: {} },
        },
        "channel-1",
      ),
    ).toThrowError("INCOMPLETE_KAPSO_MESSAGE");
  });
});
