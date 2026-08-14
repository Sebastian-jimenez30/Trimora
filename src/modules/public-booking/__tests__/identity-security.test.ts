import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  identityFingerprint,
  isTrustedPublicMutation,
  readPublicJsonBody,
} from "../server/identity-security";

describe("frontera de seguridad de identidad pública", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("genera huellas estables sin devolver el valor original", () => {
    vi.stubEnv("PUBLIC_IDENTITY_HASH_SECRET", "test");
    const first = identityFingerprint("contact:EMAIL:ana@example.com");
    expect(first).toHaveLength(64);
    expect(first).toBe(identityFingerprint("contact:EMAIL:ana@example.com"));
    expect(first).not.toContain("ana@example.com");
  });

  it("rechaza otro origen y cuerpos mayores al límite real", async () => {
    const crossOrigin = new Request("https://trimora.test/api/public/identity", {
      method: "POST",
      headers: { Origin: "https://attacker.test" },
    });
    expect(isTrustedPublicMutation(crossOrigin)).toBe(false);

    const oversized = new Request("https://trimora.test/api/public/identity", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(4_096) }),
    });
    await expect(readPublicJsonBody(oversized)).rejects.toThrow("PAYLOAD_TOO_LARGE");
  });
});
