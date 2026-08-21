import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isTrustedPublicMutation: vi.fn(),
  requestCustomerIdentity: vi.fn(),
  requestIpFingerprint: vi.fn(),
  readPublicJsonBody: vi.fn(),
}));

vi.mock("@/modules/public-booking/application/customer-identity", () => ({
  requestCustomerIdentity: mocks.requestCustomerIdentity,
}));
vi.mock("@/modules/public-booking/server/identity-security", () => ({
  isTrustedPublicMutation: mocks.isTrustedPublicMutation,
  requestIpFingerprint: mocks.requestIpFingerprint,
  readPublicJsonBody: mocks.readPublicJsonBody,
}));

import { POST } from "../route";

const context = { params: Promise.resolve({ slug: "barberia-demo" }) };

describe("POST solicitud de identidad pública", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTrustedPublicMutation.mockReturnValue(true);
    mocks.requestIpFingerprint.mockReturnValue("ip-hash");
    mocks.readPublicJsonBody.mockResolvedValue({
      channel: "EMAIL",
      contact: "ana@example.com",
    });
    mocks.requestCustomerIdentity.mockResolvedValue({
      success: true,
      data: { challengeId: "challenge-id", message: "Mensaje neutral" },
    });
  });

  it("rechaza mutaciones de otro origen antes de leer el cuerpo", async () => {
    mocks.isTrustedPublicMutation.mockReturnValue(false);
    const response = await POST(
      new Request("https://trimora.test/api/public/organizations/barberia-demo/identity/request", {
        method: "POST",
      }),
      context,
    );
    expect(response.status).toBe(403);
    expect(mocks.requestCustomerIdentity).not.toHaveBeenCalled();
  });

  it("devuelve una respuesta neutral sin almacenar el contacto en el contrato", async () => {
    const response = await POST(
      new Request("https://trimora.test/api/public/organizations/barberia-demo/identity/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://trimora.test" },
        body: JSON.stringify({ channel: "EMAIL", contact: "ana@example.com" }),
      }),
      context,
    );
    const body = await response.json();
    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(body).toEqual({
      success: true,
      data: { challengeId: "challenge-id", message: "Mensaje neutral" },
    });
    expect(JSON.stringify(body)).not.toContain("ana@example.com");
  });
});
