import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ServicesManager, { type ServiceProduct } from "../ServicesManager";

vi.mock("@/modules/services/actions", () => ({
  createServiceWithMaterials: vi.fn(),
  updateServiceWithMaterials: vi.fn(),
  deleteService: vi.fn(),
  quickCreateProduct: vi.fn(),
}));
vi.mock("@/components/ai/ImportExportModal", () => ({
  default: () => <button>Importar o exportar</button>,
}));
vi.mock("react-hot-toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const consumable: ServiceProduct = {
  id: "product-consumable",
  name: "Shampoo",
  category: "CONSUMO",
  currentStock: "8.0000",
};
const retailProduct: ServiceProduct = {
  id: "product-retail",
  name: "Cera para venta",
  category: "VENTA",
  currentStock: "4.0000",
};

describe("ServicesManager", () => {
  it("presenta el estado vacio y permite una duracion exacta", async () => {
    const user = userEvent.setup();
    render(<ServicesManager services={[]} products={[consumable, retailProduct]} />);
    expect(screen.getByText("No hay servicios registrados.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Nuevo Servicio/ }));
    const duration = screen.getByLabelText("Duración");
    await user.type(duration, "{Control>}a{/Control}37");
    expect(duration).toHaveValue(37);
  });

  it("lista como materiales solamente los productos consumibles", async () => {
    const user = userEvent.setup();
    render(<ServicesManager services={[]} products={[consumable, retailProduct]} />);
    await user.click(screen.getByRole("button", { name: /Nuevo Servicio/ }));
    await user.click(screen.getByRole("button", { name: /Añadir Consumible/ }));

    const productPicker = screen.getByLabelText("Producto");
    expect(productPicker).toHaveTextContent("Shampoo");
    expect(productPicker).not.toHaveTextContent("Cera para venta");
  });
});
