import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import POSManager from "../POSManager";
import { buildPOSHistoryEntry, buildPOSManagerProps, buildPOSReceivable } from "@/test/factories";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/pos/actions", () => ({
  processSale: vi.fn(),
  registerExpense: vi.fn(),
  registerPayment: vi.fn(),
  registerClientPayment: vi.fn(),
  exportFinancialReport: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const receivable = buildPOSReceivable({
  movements: [
    {
      transactionId: "transaction-1",
      createdAt: "2026-08-10T14:00:00.000Z",
      description: "Corte",
      totalAmount: "25000.00",
      paidAmount: "5000.00",
      remaining: 20000,
      itemDetails: [
        { name: "Corte", quantity: "1.00", unitPrice: "25000.00", subtotal: "25000.00" },
      ],
    },
    {
      transactionId: "transaction-2",
      createdAt: "2026-08-11T14:00:00.000Z",
      description: "Cera",
      totalAmount: "15000.00",
      paidAmount: "0.00",
      remaining: 15000,
      itemDetails: [
        { name: "Cera", quantity: "1.00", unitPrice: "15000.00", subtotal: "15000.00" },
      ],
    },
  ],
});

describe("POSManager", () => {
  it("oculta las citas pendientes cuando no existen y presenta estados vacios", async () => {
    const user = userEvent.setup();
    render(<POSManager {...buildPOSManagerProps()} />);
    expect(screen.queryByText("Citas Pendientes de Cobro")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Por cobrar" }));
    expect(screen.getByText("No hay cuentas pendientes por cobrar.")).toBeInTheDocument();
  });

  it("agrupa la deuda por cliente y permite inspeccionar sus movimientos", async () => {
    const user = userEvent.setup();
    render(<POSManager {...buildPOSManagerProps({ receivables: [receivable] })} />);
    await user.click(screen.getByRole("button", { name: "Por cobrar" }));
    await user.click(screen.getByText("Ana Lopez"));

    const detail = screen.getByRole("dialog", { name: "Cuenta por cobrar de Ana Lopez" });
    expect(detail).toHaveTextContent("2 movimientos pendientes");
    expect(detail).toHaveTextContent("Corte");
    expect(detail).toHaveTextContent("Cera");

    await user.click(within(detail).getByRole("button", { name: "Pagar completo" }));
    expect(screen.getByRole("dialog", { name: "Abonar a Ana Lopez" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monto ($)")).toHaveValue(35000);
  });

  it("presenta el detalle del historial y abre la edición con campos accesibles", async () => {
    const user = userEvent.setup();
    const movement = buildPOSHistoryEntry();
    render(
      <POSManager
        {...buildPOSManagerProps({
          clients: [{ id: "client-1", firstName: "Ana", lastName: "Lopez" }],
          history: [movement],
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Historial" }));
    await user.click(screen.getByText("Corte clásico"));

    const detail = screen.getByRole("dialog", { name: "Detalle del movimiento" });
    expect(detail).toHaveTextContent("Ana Lopez");
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByRole("dialog", { name: "Editar movimiento" })).toBeInTheDocument();
    expect(screen.getByLabelText("Cliente")).toHaveValue("client-1");
    expect(screen.getByLabelText("Monto total ($) *")).toHaveValue(25000);
  });
});
