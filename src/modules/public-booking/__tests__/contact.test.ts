import { describe, expect, it } from "vitest";
import { maskContact, normalizeContact, splitCustomerName } from "../domain/contact";

describe("contactos de identidad pública", () => {
  it("normaliza correo sin alterar su semántica", () => {
    expect(normalizeContact("EMAIL", "  Cliente@Ejemplo.COM ")).toEqual({
      channel: "EMAIL",
      value: "cliente@ejemplo.com",
    });
    expect(normalizeContact("EMAIL", "correo-invalido")).toBeNull();
  });

  it("normaliza teléfonos colombianos locales y acepta E.164", () => {
    expect(normalizeContact("PHONE", "300 123 4567")?.value).toBe("+573001234567");
    expect(normalizeContact("PHONE", "+1 (305) 555-1234")?.value).toBe("+13055551234");
    expect(normalizeContact("PHONE", "123")).toBeNull();
  });

  it("enmascara el contacto y separa un nombre sin guardar espacios accidentales", () => {
    const contact = normalizeContact("EMAIL", "cliente@ejemplo.com")!;
    expect(maskContact(contact)).toBe("cl***@ejemplo.com");
    expect(splitCustomerName("  Ana   María Pérez ")).toEqual({
      firstName: "Ana",
      lastName: "María Pérez",
    });
  });
});
