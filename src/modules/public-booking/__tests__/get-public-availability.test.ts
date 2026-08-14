import { describe, expect, it, vi } from "vitest";
import { getPublicAvailability } from "../application/get-public-availability";
import type { PublicAvailabilityReader } from "../domain/availability-source";

describe("consulta pública de espacios", () => {
  it("devuelve únicamente el contrato mínimo y agrupa capacidad simultánea", async () => {
    const reader: PublicAvailabilityReader = {
      findAvailabilitySource: vi.fn().mockResolvedValue({
        timeZone: "America/Bogota",
        service: { id: "71000000-0000-4000-8000-000000000001", name: "Corte", durationMinutes: 30 },
        policy: {
          minimumNoticeMinutes: 0,
          maximumAdvanceDays: 60,
          slotIntervalMinutes: 30,
          bufferMinutes: 0,
        },
        professionals: [{ id: "staff-a" }, { id: "staff-b" }],
        windows: [{ staffId: null, dayOfWeek: 1, startMinute: 540, endMinute: 600 }],
        blocks: [],
        appointments: [],
      }),
    };

    const result = await getPublicAvailability(
      reader,
      "BARBERIA-DEMO",
      { serviceId: "71000000-0000-4000-8000-000000000001", date: "2026-08-17" },
      new Date("2026-08-16T12:00:00.000Z"),
    );

    expect(result?.slots[0]).toEqual({
      startsAt: "2026-08-17T14:00:00.000Z",
      endsAt: "2026-08-17T14:30:00.000Z",
      availableStaffCount: 2,
    });
    expect(result).not.toHaveProperty("organizationId");
    expect(JSON.stringify(result)).not.toContain("staff-a");
    expect(JSON.stringify(result)).not.toContain("appointments");
  });

  it("responde igual a entradas inválidas y recursos no disponibles", async () => {
    const reader: PublicAvailabilityReader = {
      findAvailabilitySource: vi.fn().mockResolvedValue(null),
    };

    await expect(
      getPublicAvailability(reader, "slug inválido", { serviceId: "no", date: "ayer" }),
    ).resolves.toBeNull();
    await expect(
      getPublicAvailability(reader, "barberia-demo", {
        serviceId: "71000000-0000-4000-8000-000000000001",
        date: "2026-08-17",
      }),
    ).resolves.toBeNull();
    expect(reader.findAvailabilitySource).toHaveBeenCalledOnce();
  });
});
