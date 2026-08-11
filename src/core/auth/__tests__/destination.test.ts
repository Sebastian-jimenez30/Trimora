import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  limit: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/core/database/db", () => ({
  db: { select: mocks.select },
}));

import { getAuthenticatedHome } from "../server/destination";

describe("getAuthenticatedHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockReturnValue({ limit: mocks.limit });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.select.mockReturnValue({ from: mocks.from });
  });

  it("envía al superadministrador cuando existe una concesión activa", async () => {
    mocks.limit.mockResolvedValue([{ id: "platform-grant-id" }]);

    await expect(getAuthenticatedHome("user-id")).resolves.toBe("/superadmin");
  });

  it("envía al dashboard cuando el usuario no tiene una concesión", async () => {
    mocks.limit.mockResolvedValue([]);

    await expect(getAuthenticatedHome("user-id")).resolves.toBe("/dashboard");
  });

  it("niega privilegios de plataforma mientras la migración de la tabla está pendiente", async () => {
    const relationError = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    mocks.limit.mockRejectedValue(new Error("Failed query", { cause: relationError }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(getAuthenticatedHome("user-id")).resolves.toBe("/dashboard");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("platform_admin_schema_pending"),
    );
  });

  it("no oculta otros errores de base de datos", async () => {
    const connectionError = Object.assign(new Error("connection unavailable"), { code: "08006" });
    mocks.limit.mockRejectedValue(new Error("Failed query", { cause: connectionError }));

    await expect(getAuthenticatedHome("user-id")).rejects.toThrow("Failed query");
  });
});
