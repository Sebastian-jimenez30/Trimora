import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  delete: vi.fn(),
  deleteWhere: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/core/auth/server/actor", () => ({
  requireActor: mocks.requireActor,
}));

vi.mock("@/core/database/db", () => ({
  db: {
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { createCustomer, deleteCustomer, updateCustomer } from "../actions";

const organizationId = "10000000-0000-4000-8000-000000000001";
const customerId = "10000000-0000-4000-8000-000000000002";

function customerForm() {
  const formData = new FormData();
  formData.set("firstName", " Ana ");
  formData.set("lastName", " Lopez ");
  formData.set("email", "ana@example.com");
  formData.set("phone", "3001234567");
  formData.set("notes", "Cliente frecuente");
  return formData;
}

describe("acciones de clientes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ organizationId, role: "ADMIN" });
    mocks.insertReturning.mockResolvedValue([{ id: customerId }]);
    mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning });
    mocks.insert.mockReturnValue({ values: mocks.insertValues });
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.update.mockReturnValue({ set: mocks.updateSet });
    mocks.deleteWhere.mockResolvedValue(undefined);
    mocks.delete.mockReturnValue({ where: mocks.deleteWhere });
  });

  it("crea un cliente saneado dentro de la organización autenticada", async () => {
    const result = await createCustomer(customerForm());

    expect(result).toEqual({ success: true, clientId: customerId });
    expect(mocks.insertValues).toHaveBeenCalledWith({
      organizationId,
      firstName: "Ana",
      lastName: "Lopez",
      email: "ana@example.com",
      phone: "3001234567",
      notes: "Cliente frecuente",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/clientes");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/agenda");
  });

  it("actualiza solamente un cliente válido de la organización", async () => {
    const result = await updateCustomer(customerId, customerForm());

    expect(result).toEqual({ success: true });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Ana", lastName: "Lopez" }),
    );
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/clientes");
  });

  it("informa cuando un producto relacionado impide eliminar al cliente", async () => {
    mocks.deleteWhere.mockRejectedValue(new Error("foreign key violation"));

    const result = await deleteCustomer(customerId);

    expect(result).toEqual({
      success: false,
      error: "No se puede eliminar el cliente porque tiene citas o ventas asociadas.",
    });
  });
});
