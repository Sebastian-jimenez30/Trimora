import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClientManager, { type ClientType } from "../ClientManager";

const mocks = vi.hoisted(() => ({
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/modules/clients/actions", () => ({
  createCustomer: mocks.createCustomer,
  updateCustomer: mocks.updateCustomer,
  deleteCustomer: mocks.deleteCustomer,
}));
vi.mock("react-hot-toast", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

const client: ClientType = {
  id: "client-1",
  firstName: "Ana",
  lastName: "Lopez",
  phone: "3001234567",
  email: "ana@example.com",
  notes: null,
  totalSpent: "45000.00",
  lastVisit: null,
};

describe("ClientManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createCustomer.mockResolvedValue({ success: true });
    mocks.deleteCustomer.mockResolvedValue({ success: true });
  });

  it("cierra la confirmación inmediatamente después de eliminar", async () => {
    const user = userEvent.setup();
    render(<ClientManager initialClients={[client]} />);

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(screen.getByRole("dialog", { name: "Eliminar Cliente" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Eliminar Cliente" })).not.toBeInTheDocument(),
    );
  });

  it("muestra el estado vacio y filtra por datos visibles", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClientManager initialClients={[]} />);
    expect(screen.getByText("No se encontraron clientes.")).toBeInTheDocument();

    rerender(<ClientManager initialClients={[client]} />);
    await user.type(screen.getByPlaceholderText(/Buscar por nombre/), "nadie");
    expect(screen.getByText("No se encontraron clientes.")).toBeInTheDocument();
  });

  it("abre un dialogo accesible y presenta el error devuelto por el servidor", async () => {
    const user = userEvent.setup();
    mocks.createCustomer.mockResolvedValueOnce({ success: false, error: "Correo duplicado" });
    render(<ClientManager initialClients={[]} />);

    await user.click(screen.getByRole("button", { name: /Nuevo Cliente/ }));
    expect(screen.getByRole("dialog", { name: "Nuevo Cliente" })).toBeInTheDocument();
    const name = screen.getByLabelText("Nombre *");
    expect(name).toHaveFocus();
    await user.type(name, "Ana");
    await user.click(screen.getByRole("button", { name: "Guardar Cliente" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Correo duplicado"));
    expect(screen.getByRole("dialog", { name: "Nuevo Cliente" })).toBeInTheDocument();
  });
});
