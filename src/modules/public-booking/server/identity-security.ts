import "server-only";

import { createHmac } from "node:crypto";

const MAX_BODY_BYTES = 4_096;

export function isPhoneOtpEnabled() {
  return process.env.PUBLIC_PHONE_OTP_ENABLED === "true";
}

function fingerprintSecret() {
  const secret = process.env.PUBLIC_IDENTITY_HASH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "test") return "trimora-public-identity-test-secret";
  throw new Error("Falta PUBLIC_IDENTITY_HASH_SECRET");
}

export function identityFingerprint(value: string) {
  return createHmac("sha256", fingerprintSecret()).update(value).digest("hex");
}

export function requestIpFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim();
  return ip ? identityFingerprint(`ip:${ip}`) : null;
}

export function isTrustedPublicMutation(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return false;

  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function readPublicJsonBody(request: Request): Promise<unknown> {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
  return JSON.parse(body) as unknown;
}
