import { describe, expect, it } from "vitest";
import { resolveDatabasePoolConfig } from "../pool-config";

describe("limites del pool PostgreSQL", () => {
  it("usa una conexion conservadora por instancia serverless", () => {
    expect(resolveDatabasePoolConfig({})).toEqual({
      max: 1,
      idleTimeout: 20,
      connectTimeout: 10,
    });
  });

  it("permite ajustes explicitos dentro de limites seguros", () => {
    expect(
      resolveDatabasePoolConfig({
        DATABASE_POOL_MAX: "4",
        DATABASE_IDLE_TIMEOUT_SECONDS: "15",
        DATABASE_CONNECT_TIMEOUT_SECONDS: "5",
      }),
    ).toEqual({ max: 4, idleTimeout: 15, connectTimeout: 5 });
  });

  it.each([
    ["DATABASE_POOL_MAX", "0"],
    ["DATABASE_POOL_MAX", "11"],
    ["DATABASE_IDLE_TIMEOUT_SECONDS", "0"],
    ["DATABASE_CONNECT_TIMEOUT_SECONDS", "not-a-number"],
  ])("rechaza %s=%s", (name, value) => {
    expect(() => resolveDatabasePoolConfig({ [name]: value })).toThrow(name);
  });
});
