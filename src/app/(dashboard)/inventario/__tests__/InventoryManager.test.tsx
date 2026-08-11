import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import InventoryManager, { type ProductType } from "../InventoryManager";

vi.mock("@/modules/inventory/actions", () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));
vi.mock("@/components/ai/ImportExportModal", () => ({
  default: () => <button>Importar o exportar</button>,
}));
vi.mock("react-hot-toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const product: ProductType = {
  id: "product-1",
  name: "Cera mate",
  description: null,
  category: "VENTA",
  currentStock: "4.0000",
  minimumStock: "1.0000",
  salePrice: "15000.00",
  costPrice: "8000.00",
  isActive: true,
};

describe("InventoryManager", () => {
  it("cubre estados vacio y busqueda sin perder la tabla adaptable", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<InventoryManager initialProducts={[]} />);
    expect(screen.getByText("No se encontraron productos en el inventario.")).toBeInTheDocument();

    rerender(<InventoryManager initialProducts={[product]} />);
    await user.type(screen.getByPlaceholderText(/Buscar por nombre/), "shampoo");
    expect(screen.getByText("No se encontraron productos en el inventario.")).toBeInTheDocument();
    expect(screen.getByRole("table").parentElement).toHaveClass("overflow-auto");
  });

  it("abre el formulario como dialogo y enfoca el nombre", async () => {
    const user = userEvent.setup();
    render(<InventoryManager initialProducts={[]} />);
    await user.click(screen.getByRole("button", { name: /Nuevo Producto/ }));

    expect(screen.getByRole("dialog", { name: "Nuevo Producto" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre del Producto *")).toHaveFocus();
  });
});
