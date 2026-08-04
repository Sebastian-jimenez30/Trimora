import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/core/database/db";
import { webhookEvents, webhookRateLimits } from "@/core/database/schema";
import { WebhookHttpError } from "./security";
import type { WebhookEventDescriptor, WebhookProvider } from "./types";

const REQUESTS_PER_MINUTE = 60;

function currentMinute(now: Date) {
  const bucket = new Date(now);
  bucket.setUTCSeconds(0, 0);
  return bucket;
}

export async function enforceWebhookRateLimit(
  organizationId: string,
  provider: WebhookProvider,
  now = new Date(),
) {
  const [bucket] = await db
    .insert(webhookRateLimits)
    .values({ organizationId, provider, bucketStart: currentMinute(now) })
    .onConflictDoUpdate({
      target: [
        webhookRateLimits.organizationId,
        webhookRateLimits.provider,
        webhookRateLimits.bucketStart,
      ],
      set: { requestCount: sql`${webhookRateLimits.requestCount} + 1` },
    })
    .returning({ requestCount: webhookRateLimits.requestCount });

  if (bucket.requestCount > REQUESTS_PER_MINUTE) {
    throw new WebhookHttpError(429, "RATE_LIMITED");
  }
}

export async function claimWebhookEvent(event: WebhookEventDescriptor) {
  const [claimed] = await db
    .insert(webhookEvents)
    .values(event)
    .onConflictDoNothing({
      target: [webhookEvents.provider, webhookEvents.externalEventId],
    })
    .returning({ id: webhookEvents.id });

  return claimed?.id ?? null;
}

export async function completeWebhookEvent(eventId: string) {
  await db
    .update(webhookEvents)
    .set({ status: "PROCESSED", processedAt: new Date(), failureCode: null })
    .where(sql`${webhookEvents.id} = ${eventId}`);
}

export async function failWebhookEvent(eventId: string, failureCode = "PROCESSING_FAILED") {
  await db
    .update(webhookEvents)
    .set({ status: "FAILED", processedAt: new Date(), failureCode })
    .where(sql`${webhookEvents.id} = ${eventId}`);
}

export const persistentWebhookEventStore = {
  claim: claimWebhookEvent,
  complete: completeWebhookEvent,
  fail: failWebhookEvent,
};
