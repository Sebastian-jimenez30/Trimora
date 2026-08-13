import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findEnabledBySlug: vi.fn() }));

vi.mock("@/modules/public-booking/server/profile-repository", () => ({
  publicOrganizationProfileRepository: {
    findEnabledBySlug: mocks.findEnabledBySlug,
  },
}));

import { GET } from "../route";

const request = new Request("https://trimora.test/api/public/organizations/demo/config");

describe("GET configuracion publica", () => {
  beforeEach(() => {
    mocks.findEnabledBySlug.mockReset();
  });

  it("no distingue entre un slug invalido y una organizacion no disponible", async () => {
    mocks.findEnabledBySlug.mockResolvedValue(null);

    const invalidResponse = await GET(request, {
      params: Promise.resolve({ slug: "slug invalido" }),
    });
    const disabledResponse = await GET(request, {
      params: Promise.resolve({ slug: "barberia-inactiva" }),
    });

    expect(invalidResponse.status).toBe(404);
    expect(disabledResponse.status).toBe(404);
    await expect(invalidResponse.json()).resolves.toEqual({
      success: false,
      error: "Página pública no disponible",
    });
    await expect(disabledResponse.json()).resolves.toEqual({
      success: false,
      error: "Página pública no disponible",
    });
    expect(mocks.findEnabledBySlug).toHaveBeenCalledOnce();
  });

  it("entrega solo configuracion expresamente habilitada", async () => {
    mocks.findEnabledBySlug.mockResolvedValue({
      organizationId: "31000000-0000-0000-0000-000000000001",
      slug: "barberia-demo",
      displayName: "Barberia Demo",
      timeZone: "America/Bogota",
      features: {
        catalog: false,
        booking: false,
        selfService: false,
        chat: false,
        reminders: false,
      },
    });

    const response = await GET(request, {
      params: Promise.resolve({ slug: "barberia-demo" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({
      success: true,
      data: {
        organization: {
          slug: "barberia-demo",
          displayName: "Barberia Demo",
          timeZone: "America/Bogota",
        },
        features: {
          catalog: false,
          booking: false,
          selfService: false,
          chat: false,
          reminders: false,
        },
      },
    });
    expect(body.data).not.toHaveProperty("organizationId");
  });
});
