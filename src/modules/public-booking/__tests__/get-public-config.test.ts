import { describe, expect, it, vi } from "vitest";
import { getPublicBookingConfig } from "../application/get-public-config";
import type { PublicOrganizationProfileReader } from "../domain/config";
import { timeZoneSchema } from "../domain/schemas";

function reader(
  profile: Awaited<ReturnType<PublicOrganizationProfileReader["findEnabledBySlug"]>>,
): PublicOrganizationProfileReader {
  return { findEnabledBySlug: vi.fn().mockResolvedValue(profile) };
}

describe("configuración pública de una organización", () => {
  it("acepta zonas horarias IANA y rechaza valores desconocidos", () => {
    expect(timeZoneSchema.parse(" America/Bogota ")).toBe("America/Bogota");
    expect(timeZoneSchema.safeParse("Zona/Inventada").success).toBe(false);
  });

  it("normaliza el slug y entrega únicamente el DTO público", async () => {
    const profileReader = reader({
      organizationId: "31000000-0000-0000-0000-000000000001",
      slug: "barberia-demo",
      displayName: "Barbería Demo",
      timeZone: "America/Bogota",
      features: {
        catalog: true,
        booking: false,
        identity: false,
        selfService: false,
        chat: false,
        reminders: false,
      },
    });

    const result = await getPublicBookingConfig(profileReader, " BARBERIA-DEMO ");

    expect(profileReader.findEnabledBySlug).toHaveBeenCalledWith("barberia-demo");
    expect(result).toEqual({
      organization: {
        slug: "barberia-demo",
        displayName: "Barbería Demo",
        timeZone: "America/Bogota",
      },
      features: {
        catalog: true,
        booking: false,
        identity: false,
        selfService: false,
        chat: false,
        reminders: false,
      },
    });
    expect(result).not.toHaveProperty("organizationId");
  });

  it("responde igual ante un slug inválido o un perfil deshabilitado", async () => {
    const profileReader = reader(null);

    await expect(getPublicBookingConfig(profileReader, "slug con espacios")).resolves.toBeNull();
    await expect(getPublicBookingConfig(profileReader, "barberia-inactiva")).resolves.toBeNull();
    expect(profileReader.findEnabledBySlug).toHaveBeenCalledOnce();
  });
});
