const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/u;

export const REQUEST_ID_HEADER = "x-request-id";

export function normalizeRequestId(value: string | null | undefined) {
  const candidate = value?.trim();
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : null;
}

export function resolveRequestId(value: string | null | undefined) {
  return normalizeRequestId(value) ?? crypto.randomUUID();
}
