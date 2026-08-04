import { describe, expect, it } from "vitest";
import { canManageOrganization, hasAnyRole } from "../application/policies";

describe("políticas de autorización", () => {
  it("limita la administración de la organización al rol ADMIN", () => {
    expect(canManageOrganization("ADMIN")).toBe(true);
    expect(canManageOrganization("BARBER")).toBe(false);
    expect(canManageOrganization("RECEPTIONIST")).toBe(false);
  });

  it("evalúa una matriz explícita de roles permitidos", () => {
    expect(hasAnyRole("RECEPTIONIST", ["ADMIN", "RECEPTIONIST"])).toBe(true);
    expect(hasAnyRole("BARBER", ["ADMIN", "RECEPTIONIST"])).toBe(false);
    expect(hasAnyRole("BARBER", [])).toBe(true);
  });
});
