import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  insertValues: vi.fn(),
  revalidatePath: vi.fn(),
  select: vi.fn(),
  selectFrom: vi.fn(),
  selectLimit: vi.fn(),
  selectWhere: vi.fn(),
}));

vi.mock("@/core/database/db", () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
  },
}));

vi.mock("@/core/database/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "mock-user-id" } },
      })),
    },
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { batchImportProducts } from "../actions";

describe("Inventory Module Actions - batchImportProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectLimit.mockResolvedValue([{ organizationId: "mock-org-id" }]);
    mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit });
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
    mocks.select.mockReturnValue({ from: mocks.selectFrom });
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: mocks.insertValues });
  });

  it("debería retornar error si no se envían productos", async () => {
    const result = await batchImportProducts([]);

    expect(result).toEqual({
      success: false,
      error: "No hay productos para importar o formato inválido",
    });
  });

  it("debería retornar error si un producto no tiene categoría válida", async () => {
    const result = await batchImportProducts([{ name: "Cera", category: "INVALIDA" }]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Error validando el producto "Cera"');
  });

  it("debería insertar los productos saneados y revalidar inventario", async () => {
    const result = await batchImportProducts([
      { name: "Gel", category: "VENTA", salePrice: 15 },
      { name: "Shampoo", category: "CONSUMO" },
    ]);

    expect(result.success).toBe(true);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Gel",
          category: "VENTA",
          salePrice: "15",
          organizationId: "mock-org-id",
        }),
        expect.objectContaining({
          name: "Shampoo",
          category: "CONSUMO",
          currentStock: "0",
          organizationId: "mock-org-id",
        }),
      ]),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inventario");
  });
});
