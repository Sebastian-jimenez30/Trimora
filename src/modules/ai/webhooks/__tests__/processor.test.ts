import { describe, expect, it, vi } from "vitest";
import { processWebhookOnce, type WebhookEventStore } from "../processor";

const descriptor = {
  organizationId: "10000000-0000-4000-8000-000000000020",
  provider: "KAPSO" as const,
  externalEventId: "event-1",
  payloadHash: "a".repeat(64),
};

function createStore(claimedId: string | null): WebhookEventStore {
  return {
    claim: vi.fn().mockResolvedValue(claimedId),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}

describe("webhook idempotency", () => {
  it("no procesa de nuevo un evento ya reclamado", async () => {
    const store = createStore(null);
    const processEvent = vi.fn();

    await expect(processWebhookOnce(descriptor, processEvent, store)).resolves.toEqual({
      duplicate: true,
    });
    expect(processEvent).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("marca como completado un evento nuevo", async () => {
    const store = createStore("internal-event-id");
    const processEvent = vi.fn().mockResolvedValue(undefined);

    await expect(processWebhookOnce(descriptor, processEvent, store)).resolves.toEqual({
      duplicate: false,
    });
    expect(store.complete).toHaveBeenCalledWith("internal-event-id");
  });

  it("marca el evento como fallido sin exponer el error en el registro", async () => {
    const store = createStore("internal-event-id");
    const processEvent = vi.fn().mockRejectedValue(new Error("sensitive provider detail"));

    await expect(processWebhookOnce(descriptor, processEvent, store)).rejects.toThrow();
    expect(store.fail).toHaveBeenCalledWith("internal-event-id");
  });
});
