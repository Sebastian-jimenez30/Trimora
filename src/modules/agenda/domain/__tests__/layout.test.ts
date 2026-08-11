import { describe, expect, it } from "vitest";
import { getAppointmentLayouts } from "../layout";

describe("distribucion de citas simultaneas", () => {
  it("ubica al lado las citas que se superponen", () => {
    const layouts = getAppointmentLayouts([
      { id: "a", startTime: "2026-08-11T19:20:00.000Z", endTime: "2026-08-11T20:05:00.000Z" },
      { id: "b", startTime: "2026-08-11T20:00:00.000Z", endTime: "2026-08-11T20:30:00.000Z" },
    ]);

    expect(layouts.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(layouts.get("b")).toEqual({ lane: 1, lanes: 2 });
  });

  it("reorganiza los carriles cuando una duracion deja de superponerse", () => {
    const layouts = getAppointmentLayouts([
      { id: "a", startTime: "2026-08-11T19:20:00.000Z", endTime: "2026-08-11T20:00:00.000Z" },
      { id: "b", startTime: "2026-08-11T20:00:00.000Z", endTime: "2026-08-11T20:30:00.000Z" },
    ]);

    expect(layouts.get("a")).toEqual({ lane: 0, lanes: 1 });
    expect(layouts.get("b")).toEqual({ lane: 0, lanes: 1 });
  });

  it("rechaza intervalos corruptos", () => {
    expect(() =>
      getAppointmentLayouts([
        { id: "a", startTime: "2026-08-11T20:00:00.000Z", endTime: "2026-08-11T19:00:00.000Z" },
      ]),
    ).toThrow("intervalo invalido");
  });
});
