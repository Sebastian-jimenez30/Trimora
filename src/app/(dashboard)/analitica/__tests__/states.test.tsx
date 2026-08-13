import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AnalyticsError from "../error";
import AnalyticsLoading from "../loading";

describe("estados de analítica", () => {
  it("anuncia la carga a tecnologías de asistencia", () => {
    render(<AnalyticsLoading />);
    expect(screen.getByRole("status", { name: "Cargando analítica" })).toBeInTheDocument();
  });

  it("presenta el error y permite reintentar", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<AnalyticsError error={new Error("database unavailable")} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar la analítica");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
