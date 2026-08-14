import { formatInTimeZone } from "date-fns-tz";
import { describe, expect, it } from "vitest";
import { calculateAvailability, type AvailabilityInput } from "../domain/availability";

const baseInput: AvailabilityInput = {
  date: "2026-08-17",
  timeZone: "America/Bogota",
  durationMinutes: 40,
  policy: {
    minimumNoticeMinutes: 0,
    maximumAdvanceDays: 60,
    slotIntervalMinutes: 15,
    bufferMinutes: 0,
  },
  professionals: [{ id: "staff-a" }],
  windows: [{ staffId: null, dayOfWeek: 1, startMinute: 540, endMinute: 1080 }],
  blocks: [],
  appointments: [],
  now: new Date("2026-08-16T12:00:00.000Z"),
};

const localTimes = (input: AvailabilityInput) =>
  calculateAvailability(input).map((slot) =>
    formatInTimeZone(slot.startsAt, input.timeZone, "yyyy-MM-dd HH:mm"),
  );

describe("motor público de disponibilidad", () => {
  it("admite duraciones arbitrarias, intervalos configurables y límites diarios", () => {
    const slots = calculateAvailability(baseInput);

    expect(localTimes(baseInput).slice(0, 3)).toEqual([
      "2026-08-17 09:00",
      "2026-08-17 09:15",
      "2026-08-17 09:30",
    ]);
    expect(formatInTimeZone(slots.at(-1)!.startsAt, baseInput.timeZone, "HH:mm")).toBe("17:15");
    expect(
      slots.every((slot) => slot.endsAt.getTime() - slot.startsAt.getTime() === 40 * 60_000),
    ).toBe(true);
  });

  it("elimina bloqueos y citas activas, incluyendo el margen entre citas", () => {
    const input: AvailabilityInput = {
      ...baseInput,
      durationMinutes: 30,
      policy: { ...baseInput.policy, slotIntervalMinutes: 30, bufferMinutes: 15 },
      blocks: [
        {
          staffId: null,
          startsAt: new Date("2026-08-17T15:00:00.000Z"),
          endsAt: new Date("2026-08-17T16:00:00.000Z"),
        },
      ],
      appointments: [
        {
          staffId: "staff-a",
          startsAt: new Date("2026-08-17T17:00:00.000Z"),
          endsAt: new Date("2026-08-17T17:30:00.000Z"),
        },
      ],
    };

    expect(localTimes(input)).not.toEqual(expect.arrayContaining(["2026-08-17 10:00"]));
    expect(localTimes(input)).not.toEqual(expect.arrayContaining(["2026-08-17 11:30"]));
    expect(localTimes(input)).not.toEqual(expect.arrayContaining(["2026-08-17 12:30"]));
  });

  it("agrupa profesionales simultáneos sin exponer citas ni nombres", () => {
    const input: AvailabilityInput = {
      ...baseInput,
      professionals: [{ id: "staff-a" }, { id: "staff-b" }],
      blocks: [
        {
          staffId: "staff-a",
          startsAt: new Date("2026-08-17T14:00:00.000Z"),
          endsAt: new Date("2026-08-17T15:00:00.000Z"),
        },
      ],
    };

    const slots = calculateAvailability(input);
    expect(
      slots.find((slot) => slot.startsAt.toISOString() === "2026-08-17T14:00:00.000Z")?.staffIds,
    ).toEqual(["staff-b"]);
    expect(
      slots.find((slot) => slot.startsAt.toISOString() === "2026-08-17T15:00:00.000Z")?.staffIds,
    ).toEqual(["staff-a", "staff-b"]);
  });

  it("cruza el horario profesional con el horario general", () => {
    const input: AvailabilityInput = {
      ...baseInput,
      windows: [
        ...baseInput.windows,
        { staffId: "staff-a", dayOfWeek: 1, startMinute: 600, endMinute: 720 },
      ],
    };

    expect(localTimes(input).at(0)).toBe("2026-08-17 10:00");
    expect(localTimes(input).at(-1)).toBe("2026-08-17 11:15");
  });

  it("continúa horarios nocturnos en el día siguiente", () => {
    const input: AvailabilityInput = {
      ...baseInput,
      date: "2026-08-18",
      durationMinutes: 30,
      policy: { ...baseInput.policy, slotIntervalMinutes: 30 },
      windows: [{ staffId: null, dayOfWeek: 1, startMinute: 1320, endMinute: 120 }],
    };

    expect(localTimes(input)).toEqual([
      "2026-08-18 00:00",
      "2026-08-18 00:30",
      "2026-08-18 01:00",
      "2026-08-18 01:30",
    ]);
  });

  it("omite horas locales inexistentes durante un cambio DST", () => {
    const input: AvailabilityInput = {
      ...baseInput,
      date: "2026-03-08",
      timeZone: "America/New_York",
      durationMinutes: 30,
      policy: { ...baseInput.policy, maximumAdvanceDays: 90, slotIntervalMinutes: 30 },
      windows: [{ staffId: null, dayOfWeek: 7, startMinute: 60, endMinute: 240 }],
      now: new Date("2026-03-01T12:00:00.000Z"),
    };

    const times = localTimes(input);
    expect(times).toContain("2026-03-08 01:00");
    expect(times).toContain("2026-03-08 03:00");
    expect(times.some((time) => time.includes(" 02:"))).toBe(false);
  });

  it("no publica dos veces la misma hora local cuando termina el DST", () => {
    const input: AvailabilityInput = {
      ...baseInput,
      date: "2026-11-01",
      timeZone: "America/New_York",
      durationMinutes: 30,
      policy: { ...baseInput.policy, maximumAdvanceDays: 300, slotIntervalMinutes: 30 },
      windows: [{ staffId: null, dayOfWeek: 7, startMinute: 0, endMinute: 180 }],
      now: new Date("2026-03-01T12:00:00.000Z"),
    };

    const times = localTimes(input);
    expect(new Set(times).size).toBe(times.length);
    expect(times.filter((time) => time === "2026-11-01 01:30")).toHaveLength(1);
  });

  it("respeta anticipación mínima, fechas pasadas y horizonte máximo", () => {
    expect(
      calculateAvailability({
        ...baseInput,
        policy: { ...baseInput.policy, minimumNoticeMinutes: 36 * 60 },
      }),
    ).toHaveLength(0);
    expect(calculateAvailability({ ...baseInput, date: "2026-08-15" })).toHaveLength(0);
    expect(
      calculateAvailability({
        ...baseInput,
        date: "2026-08-24",
        policy: { ...baseInput.policy, maximumAdvanceDays: 7 },
      }),
    ).toHaveLength(0);
  });
});
