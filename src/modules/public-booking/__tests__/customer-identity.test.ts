import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  beginVerificationAttempt: vi.fn(),
  createIdentityChallenge: vi.fn(),
  findIdentityOrganization: vi.fn(),
  linkVerifiedCustomer: vi.fn(),
  registerIdentityEvent: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../server/public-auth-client", () => ({
  createPublicAuthClient: vi.fn(async () => ({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      signOut: mocks.signOut,
      verifyOtp: mocks.verifyOtp,
    },
  })),
}));
vi.mock("../server/identity-security", () => ({
  identityFingerprint: vi.fn(() => "a".repeat(64)),
  isPhoneOtpEnabled: vi.fn(() => true),
}));
vi.mock("../server/identity-repository", () => {
  class IdentityConflictError extends Error {}
  return {
    IdentityConflictError,
    beginVerificationAttempt: mocks.beginVerificationAttempt,
    createIdentityChallenge: mocks.createIdentityChallenge,
    findIdentityOrganization: mocks.findIdentityOrganization,
    linkVerifiedCustomer: mocks.linkVerifiedCustomer,
    registerIdentityEvent: mocks.registerIdentityEvent,
  };
});

import { requestCustomerIdentity, verifyCustomerIdentity } from "../application/customer-identity";
import { IdentityConflictError } from "../server/identity-repository";

const organization = {
  organizationId: "31000000-0000-4000-8000-000000000001",
  displayName: "Demo",
};
const challengeId = "41000000-0000-4000-8000-000000000001";

describe("casos de uso de identidad pública", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findIdentityOrganization.mockResolvedValue(organization);
    mocks.createIdentityChallenge.mockResolvedValue({ id: challengeId });
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.beginVerificationAttempt.mockResolvedValue({ accepted: true, outcome: "ACCEPTED" });
    mocks.verifyOtp.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
    mocks.linkVerifiedCustomer.mockResolvedValue({ id: "identity-id" });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("solicita el OTP sin devolver si el contacto ya existía", async () => {
    const result = await requestCustomerIdentity(
      "barberia-demo",
      { channel: "EMAIL", contact: "Cliente@Ejemplo.com" },
      "b".repeat(64),
    );

    expect(result).toMatchObject({ success: true, data: { challengeId } });
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "cliente@ejemplo.com",
      options: { shouldCreateUser: true },
    });
    expect(JSON.stringify(result)).not.toContain("organizationId");
  });

  it("mantiene una respuesta neutral cuando el límite impide enviar otro código", async () => {
    mocks.createIdentityChallenge.mockResolvedValue(null);

    const result = await requestCustomerIdentity(
      "barberia-demo",
      { channel: "EMAIL", contact: "cliente@ejemplo.com" },
      null,
    );

    expect(result.success).toBe(true);
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    if (result.success) expect(result.data.challengeId).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("no expone una caída del proveedor ni la existencia del contacto", async () => {
    mocks.signInWithOtp.mockRejectedValue(new Error("provider unavailable"));

    const result = await requestCustomerIdentity(
      "barberia-demo",
      { channel: "EMAIL", contact: "cliente@ejemplo.com" },
      null,
    );

    expect(result).toMatchObject({ success: true, data: { challengeId } });
    expect(mocks.registerIdentityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "REJECTED" }),
    );
  });

  it("verifica el OTP y vincula sólo la identidad autenticada", async () => {
    const result = await verifyCustomerIdentity("barberia-demo", {
      challengeId,
      channel: "PHONE",
      contact: "300 123 4567",
      name: "Ana Pérez",
      token: "123456",
    });

    expect(result).toEqual({
      success: true,
      data: { authenticated: true, customer: { displayName: "Ana Pérez" } },
    });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      phone: "+573001234567",
      token: "123456",
      type: "sms",
    });
    expect(mocks.linkVerifiedCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ authUserId: "user-id", challengeId }),
    );
  });

  it("no llama al proveedor con un desafío vencido o reutilizado", async () => {
    mocks.beginVerificationAttempt.mockResolvedValue({ accepted: false, outcome: "EXPIRED" });

    const result = await verifyCustomerIdentity("barberia-demo", {
      challengeId,
      channel: "EMAIL",
      contact: "cliente@ejemplo.com",
      name: "Ana Pérez",
      token: "123456",
    });

    expect(result).toEqual({ success: false, code: "VERIFICATION_FAILED" });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("responde igual ante un código incorrecto sin vincular clientes", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: null }, error: new Error("invalid otp") });

    const result = await verifyCustomerIdentity("barberia-demo", {
      challengeId,
      channel: "EMAIL",
      contact: "cliente@ejemplo.com",
      name: "Ana Pérez",
      token: "999999",
    });

    expect(result).toEqual({ success: false, code: "VERIFICATION_FAILED" });
    expect(mocks.linkVerifiedCustomer).not.toHaveBeenCalled();
    expect(mocks.registerIdentityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "REJECTED" }),
    );
  });

  it("cierra sólo la sesión pública si la vinculación encuentra un conflicto", async () => {
    mocks.linkVerifiedCustomer.mockRejectedValue(new IdentityConflictError());

    await expect(
      verifyCustomerIdentity("barberia-demo", {
        challengeId,
        channel: "EMAIL",
        contact: "cliente@ejemplo.com",
        name: "Ana Pérez",
        token: "123456",
      }),
    ).resolves.toEqual({ success: false, code: "VERIFICATION_FAILED" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.registerIdentityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "CONFLICT" }),
    );
  });
});
