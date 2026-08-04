export const WEBHOOK_PROVIDERS = ["TELEGRAM", "KAPSO"] as const;

export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[number];

export type WebhookEventDescriptor = {
  organizationId: string;
  provider: WebhookProvider;
  externalEventId: string;
  payloadHash: string;
};
