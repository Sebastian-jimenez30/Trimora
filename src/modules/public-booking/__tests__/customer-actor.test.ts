import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findCustomerActor: vi.fn(),
  findIdentityOrganization: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../server/public-auth-client", () => ({
  createPublicAuthClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("../server/identity-repository", () => ({
  findCustomerActor: mocks.findCustomerActor,
  findIdentityOrganization: mocks.findIdentityOrganization,
}));

import { CustomerAuthorizationError, requireCustomerActor } from "../server/customer-actor";

describe("actor de cliente separado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findIdentityOrganization.mockResolvedValue({
      organizationId: "organization-id",
      displayName: "Barbería Demo",
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-user-id" } } });
    mocks.findCustomerActor.mockResolvedValue({
      identityId: "identity-id",
      clientId: "client-id",
      firstName: "Ana",
      lastName: "Pérez",
    });
  });

  it("resuelve la organización y el cliente únicamente desde la sesión pública", async () => {
    await expect(requireCustomerActor("barberia-demo")).resolves.toMatchObject({
      authUserId: "auth-user-id",
      organizationId: "organization-id",
      clientId: "client-id",
      displayName: "Ana Pérez",
    });
  });

  it("rechaza una sesión sin identidad vinculada en esa organización", async () => {
    mocks.findCustomerActor.mockResolvedValue(null);
    await expect(requireCustomerActor("barberia-demo")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("no consulta identidades cuando Supabase no autentica la cookie pública", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireCustomerActor("barberia-demo")).rejects.toBeInstanceOf(
      CustomerAuthorizationError,
    );
    expect(mocks.findCustomerActor).not.toHaveBeenCalled();
  });
});
