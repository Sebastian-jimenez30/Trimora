import type { WebhookEventDescriptor } from "./types";

export type WebhookEventStore = {
  claim: (event: WebhookEventDescriptor) => Promise<string | null>;
  complete: (eventId: string) => Promise<void>;
  fail: (eventId: string, failureCode?: string) => Promise<void>;
};

export async function processWebhookOnce(
  event: WebhookEventDescriptor,
  processEvent: () => Promise<void>,
  store: WebhookEventStore,
) {
  const eventId = await store.claim(event);
  if (!eventId) return { duplicate: true } as const;

  try {
    await processEvent();
    await store.complete(eventId);
    return { duplicate: false } as const;
  } catch (error: unknown) {
    await store.fail(eventId);
    throw error;
  }
}
