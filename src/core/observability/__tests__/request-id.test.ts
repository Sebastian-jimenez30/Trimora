import { describe, expect, it } from "vitest";
import { normalizeRequestId, resolveRequestId } from "../request-id";

describe("correlacion de solicitudes", () => {
  it("conserva identificadores validos de la infraestructura", () => {
    expect(resolveRequestId("edge-request_2026-08-11")).toBe("edge-request_2026-08-11");
  });

  it.each([null, "short", "contains spaces", "<script>alert(1)</script>"])(
    "reemplaza un identificador no confiable: %s",
    (candidate) => {
      expect(normalizeRequestId(candidate)).toBeNull();
      expect(resolveRequestId(candidate)).toMatch(/^[0-9a-f-]{36}$/u);
    },
  );
});
