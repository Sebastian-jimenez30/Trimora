import type { Instrumentation } from "next";
import { normalizeRequestId, REQUEST_ID_HEADER } from "@/core/observability/request-id";

function getHeader(headers: Record<string, string | string[] | undefined>, name: string) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getErrorIdentity(error: unknown) {
  if (typeof error !== "object" || error === null) return { name: "UnknownError" };
  const name = "name" in error && typeof error.name === "string" ? error.name : "Error";
  const digest = "digest" in error && error.digest ? String(error.digest) : undefined;
  return { name, digest };
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const requestId =
    normalizeRequestId(getHeader(request.headers, REQUEST_ID_HEADER)) ?? "request-id-unavailable";
  const pathname = new URL(request.path, "http://trimora.internal").pathname;

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "server_request_failed",
      requestId,
      method: request.method,
      pathname,
      routePath: context.routePath,
      routeType: context.routeType,
      ...getErrorIdentity(error),
    }),
  );
};
