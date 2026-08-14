import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findAvailabilitySource: vi.fn() }));

vi.mock("@/modules/public-booking/server/availability-repository", () => ({
  publicAvailabilityRepository: {
    findAvailabilitySource: mocks.findAvailabilitySource,
  },
}));

import { GET } from "../route";

const serviceId = "71000000-0000-4000-8000-000000000001";

describe("GET disponibilidad pública", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
    mocks.findAvailabilitySource.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("responde 404 neutral ante parámetros o recursos inválidos", async () => {
    mocks.findAvailabilitySource.mockResolvedValue(null);
    const invalid = await GET(
      new Request("https://trimora.test/api/public/organizations/demo/availability?date=x"),
      { params: Promise.resolve({ slug: "slug inválido" }) },
    );
    const unavailable = await GET(
      new Request(
        `https://trimora.test/api/public/organizations/demo/availability?date=2026-08-17&serviceId=${serviceId}`,
      ),
      { params: Promise.resolve({ slug: "barberia-demo" }) },
    );

    expect(invalid.status).toBe(404);
    expect(unavailable.status).toBe(404);
    await expect(invalid.json()).resolves.toEqual({
      success: false,
      error: "Disponibilidad no disponible",
    });
    expect(mocks.findAvailabilitySource).toHaveBeenCalledOnce();
  });

  it("entrega espacios libres sin caché ni datos de citas", async () => {
    mocks.findAvailabilitySource.mockResolvedValue({
      timeZone: "America/Bogota",
      service: { id: serviceId, name: "Corte", durationMinutes: 30 },
      policy: {
        minimumNoticeMinutes: 0,
        maximumAdvanceDays: 60,
        slotIntervalMinutes: 30,
        bufferMinutes: 0,
      },
      professionals: [{ id: "staff-a" }],
      windows: [{ staffId: null, dayOfWeek: 1, startMinute: 540, endMinute: 600 }],
      blocks: [],
      appointments: [],
    });
    const response = await GET(
      new Request(
        `https://trimora.test/api/public/organizations/demo/availability?date=2026-08-17&serviceId=${serviceId}`,
      ),
      { params: Promise.resolve({ slug: "barberia-demo" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.data.slots[0]).toEqual({
      startsAt: "2026-08-17T14:00:00.000Z",
      endsAt: "2026-08-17T14:30:00.000Z",
      availableStaffCount: 1,
    });
    expect(JSON.stringify(body)).not.toContain("staff-a");
  });
});
