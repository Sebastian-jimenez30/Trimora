import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/core/database/db", () => ({ db: {} }));

import { resolveAnalyticsPeriod } from "../queries";

describe("periodos analiticos en America/Bogota", () => {
  it("convierte el inicio y fin de mes a UTC sin cambiar el dia local", () => {
    const period = resolveAnalyticsPeriod({ type: "month", year: "2026", segment: "7" });

    expect(period.start.toISOString()).toBe("2026-07-01T05:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-08-01T05:00:00.000Z");
    expect(period.granularity).toBe("day");
  });

  it("calcula trimestre, semestre y periodo anterior completos", () => {
    const quarter = resolveAnalyticsPeriod({ type: "quarter", year: "2026", segment: "3" });
    const semester = resolveAnalyticsPeriod({ type: "semester", year: "2026", segment: "2" });

    expect(quarter.start.toISOString()).toBe("2026-07-01T05:00:00.000Z");
    expect(quarter.end.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(quarter.previousStart.toISOString()).toBe("2026-04-01T05:00:00.000Z");
    expect(semester.start.toISOString()).toBe("2026-07-01T05:00:00.000Z");
    expect(semester.end.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });
});
