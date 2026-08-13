import { NextResponse } from "next/server";
import { WebhookHttpError } from "./security";

export function webhookSuccess(result: "processed" | "duplicate" | "ignored" = "processed") {
  return NextResponse.json({ success: true, result });
}

export function webhookErrorResponse(error: unknown, provider: "telegram" | "kapso") {
  if (error instanceof WebhookHttpError) {
    console.warn("Webhook rejected", { provider, code: error.code, status: error.status });
    return NextResponse.json({ success: false, error: error.code }, { status: error.status });
  }

  console.error("Webhook processing failed", { provider, code: "PROCESSING_FAILED" });
  return NextResponse.json({ success: false, error: "PROCESSING_FAILED" }, { status: 500 });
}
