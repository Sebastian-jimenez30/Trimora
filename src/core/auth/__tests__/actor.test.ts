import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/core/database/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/core/database/db", () => ({
  db: {
    select: mocks.select,
  },
}));

import { AuthorizationError, requireActor, requirePlatformAdmin } from "../server/actor";

const membership = {
  membershipId: "membership-id",
  organizationId: "organization-id",
  organizationName: "Trimora Test",
  role: "ADMIN",
};

describe("requireActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-id",
          email: "admin@example.com",
          user_metadata: { full_name: "Admin Test" },
        },
      },
    });
    mocks.limit.mockResolvedValue([membership]);
    mocks.orderBy.mockReturnValue({ limit: mocks.limit });
    mocks.where.mockReturnValue({ orderBy: mocks.orderBy, limit: mocks.limit });
    mocks.select.mockReturnValue({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({ where: mocks.where })),
        where: mocks.where,
      })),
    });
  });

  it("resuelve organización y rol exclusivamente desde la membresía", async () => {
    const actor = await requireActor({ roles: ["ADMIN"] });

    expect(actor).toMatchObject({
      userId: "user-id",
      organizationId: "organization-id",
      role: "ADMIN",
    });
  });

  it("rechaza un rol que no satisface la política", async () => {
    mocks.limit.mockResolvedValue([{ ...membership, role: "BARBER" }]);

    await expect(requireActor({ roles: ["ADMIN"] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rechaza usuarios sin membresía", async () => {
    mocks.limit.mockResolvedValue([]);

    await expect(requireActor()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rechaza llamadas directas sin una sesión autenticada", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(requireActor()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("exige que la membresía coincida con la organización solicitada", async () => {
    await requireActor({
      organizationId: "organization-id",
      roles: ["ADMIN"],
    });

    expect(mocks.where).toHaveBeenCalledTimes(1);
  });

  it("autoriza superadministración mediante una concesión persistida", async () => {
    mocks.limit.mockResolvedValue([{ id: "platform-grant-id" }]);

    await expect(requirePlatformAdmin()).resolves.toMatchObject({
      userId: "user-id",
      grantId: "platform-grant-id",
    });
  });
});
