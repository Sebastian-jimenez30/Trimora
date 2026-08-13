import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AnalyticsDashboard from "../AnalyticsDashboard";
import { buildAnalyticsData, buildAnalyticsMovement } from "@/test/factories";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("AnalyticsDashboard", () => {
  it("presenta el estado vacío y navega al período seleccionado", async () => {
    const user = userEvent.setup();
    render(<AnalyticsDashboard data={buildAnalyticsData()} />);

    expect(
      screen.getByText("No existen movimientos para el período seleccionado."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Trimestre" }));
    expect(mocks.push).toHaveBeenCalledWith("/analitica?period=quarter&segment=1");
  });

  it("abre la trazabilidad con teclado, atrapa el foco y cierra con Escape", async () => {
    const user = userEvent.setup();
    const movement = buildAnalyticsMovement({
      items: [
        {
          name: "Corte clásico",
          type: "SERVICE",
          quantity: 1,
          unitPrice: 25000,
          subtotal: 25000,
        },
      ],
      payments: [{ amount: 25000, method: "CASH", createdAt: "2026-08-11T14:30:00.000Z" }],
    });
    render(<AnalyticsDashboard data={buildAnalyticsData({ movements: [movement] })} />);

    const row = screen.getByLabelText("Ver detalle de Corte clásico");
    row.focus();
    await user.keyboard("{Enter}");

    const dialog = screen.getByRole("dialog", { name: "Trazabilidad del movimiento" });
    expect(dialog).toHaveTextContent("Ana Lopez");
    expect(dialog).toHaveTextContent("Abonos registrados");
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(dialog).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });
});
