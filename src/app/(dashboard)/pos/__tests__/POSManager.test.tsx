import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import POSManager from "../POSManager";
import { buildPOSHistoryEntry, buildPOSManagerProps, buildPOSReceivable } from "@/test/factories";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  processSale: vi.fn(),
  registerPayment: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/modules/pos/actions", () => ({
  processSale: mocks.processSale,
  registerExpense: vi.fn(),
  registerPayment: mocks.registerPayment,
  registerClientPayment: vi.fn(),
  exportFinancialReport: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({
  toast: { error: vi.fn(), success: mocks.toastSuccess },
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
        {
          id: "item-1",
          itemType: "SERVICE",
          name: "Corte",
          quantity: "1.00",
          unitPrice: "25000.00",
          subtotal: "25000.00",
          paidAmount: "5000.00",
          remaining: 20000,
        },
      ],
      allocationStatus: "EXACT",
    },
    {
      transactionId: "transaction-2",
      createdAt: "2026-08-11T14:00:00.000Z",
      description: "Cera",
      totalAmount: "15000.00",
      paidAmount: "0.00",
      remaining: 15000,
      itemDetails: [
        {
          id: "item-2",
          itemType: "PRODUCT",
          name: "Cera",
          quantity: "1.00",
          unitPrice: "15000.00",
          subtotal: "15000.00",
          paidAmount: "0.00",
          remaining: 15000,
        },
      ],
      allocationStatus: "EXACT",
    },
  ],
});

describe("POSManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processSale.mockResolvedValue({ success: true, transactionId: "transaction-new" });
    mocks.registerPayment.mockResolvedValue({ success: true });
  });

  it("oculta las citas pendientes cuando no existen y presenta estados vacios", async () => {
    const user = userEvent.setup();
    render(<POSManager {...buildPOSManagerProps()} />);
    expect(screen.queryByText("Citas Pendientes de Cobro")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Por cobrar" }));
    expect(screen.getByText("No hay cuentas pendientes por cobrar.")).toBeInTheDocument();
  });

  it("agrupa la deuda por cliente y presenta los conceptos sin exponer movimientos", async () => {
    const user = userEvent.setup();
    render(<POSManager {...buildPOSManagerProps({ receivables: [receivable] })} />);
    await user.click(screen.getByRole("button", { name: "Por cobrar" }));
    await user.click(screen.getByText("Ana Lopez"));

    const detail = screen.getByRole("dialog", { name: "Cuenta por cobrar de Ana Lopez" });
    expect(detail).toHaveTextContent("2 conceptos pendientes");
    expect(detail).not.toHaveTextContent("Saldo de este movimiento");
    expect(detail).toHaveTextContent("Corte");
    expect(detail).toHaveTextContent("Cera");

    await user.click(within(detail).getByRole("button", { name: "Pagar toda la deuda" }));
    expect(
      screen.getByRole("dialog", { name: "Pagar toda la deuda de Ana Lopez" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Monto ($)")).toHaveValue(35000);
  });

  it("permite pagar completamente un producto específico conservando su trazabilidad", async () => {
    const user = userEvent.setup();
    render(<POSManager {...buildPOSManagerProps({ receivables: [receivable] })} />);
    await user.click(screen.getByRole("button", { name: "Por cobrar" }));
    await user.click(screen.getByText("Ana Lopez"));

    const detail = screen.getByRole("dialog", { name: "Cuenta por cobrar de Ana Lopez" });
    await user.click(within(detail).getAllByRole("button", { name: "Pagar completo" })[1]);
    expect(screen.getByRole("dialog", { name: "Abonar a Cera" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monto ($)")).toHaveValue(15000);

    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(mocks.registerPayment).toHaveBeenCalledWith("transaction-2", 15000, "CASH", [
      { transactionItemId: "item-2", amount: 15000 },
    ]);
  });

  it("permite buscar y seleccionar el cliente desde el ticket de venta", async () => {
    const user = userEvent.setup();
    render(
      <POSManager
        {...buildPOSManagerProps({
          services: [
            { id: "service-1", name: "Corte clásico", price: "25000.00", durationMinutes: 30 },
          ],
          clients: [
            { id: "client-1", firstName: "Ana", lastName: "Lopez" },
            { id: "client-2", firstName: "Carlos", lastName: "Perez" },
          ],
        })}
      />,
    );

    await user.click(screen.getByText("Corte clásico"));
    const clientPicker = screen.getByRole("combobox", { name: "Cliente (Opcional)" });
    await user.type(clientPicker, "Carlos");
    expect(screen.queryByRole("option", { name: "Ana Lopez" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Carlos Perez" }));

    expect(clientPicker).toHaveValue("Carlos Perez");
  });

  it("registra en una sola venta cuanto se paga y cuanto se fia de cada concepto", async () => {
    const user = userEvent.setup();
    render(
      <POSManager
        {...buildPOSManagerProps({
          services: [
            { id: "service-1", name: "Corte clásico", price: "25000.00", durationMinutes: 30 },
          ],
          products: [
            {
              id: "product-1",
              name: "Gel",
              salePrice: "15000.00",
              currentStock: "10.00",
              category: "VENTA",
            },
          ],
          clients: [{ id: "client-1", firstName: "Ana", lastName: "Lopez" }],
        })}
      />,
    );

    await user.click(screen.getByText("Corte clásico"));
    await user.click(screen.getByText("Gel"));
    await user.click(screen.getByRole("combobox", { name: "Cliente (Opcional)" }));
    await user.click(screen.getByRole("option", { name: "Ana Lopez" }));
    await user.click(screen.getByRole("button", { name: "Fiado" }));
    expect(screen.queryByLabelText("Abono inicial de Corte clásico")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Pago" })[0]);
    expect(screen.queryByLabelText("Abono inicial de Corte clásico")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Abono" })[0]);
    expect(screen.getByLabelText("Abono inicial de Corte clásico")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Pago" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Abono" })[1]);
    await user.type(screen.getByLabelText("Abono inicial de Gel"), "5000");
    await user.click(screen.getByRole("button", { name: "Cobrar" }));

    expect(mocks.processSale).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id: "service-1", paidAmount: 25000 }),
        expect.objectContaining({ id: "product-1", paidAmount: 5000 }),
      ],
      "client-1",
      "CREDIT",
      undefined,
      30000,
      "CASH",
    );
  });

  it("confirma el cobro sin enviar al usuario al historial", async () => {
    const user = userEvent.setup();
    render(
      <POSManager
        {...buildPOSManagerProps({
          services: [
            { id: "service-1", name: "Corte clásico", price: "25000.00", durationMinutes: 30 },
          ],
        })}
      />,
    );

    await user.click(screen.getByText("Corte clásico"));
    await user.click(screen.getByRole("button", { name: "Cobrar" }));

    expect(await screen.findByText("¡Venta Exitosa!")).toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Cobro registrado correctamente");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("button", { name: "Servicios" })).toBeInTheDocument();
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
