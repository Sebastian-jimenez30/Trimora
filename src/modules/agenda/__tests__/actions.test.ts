import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  client: vi.fn(),
  staff: vi.fn(),
  service: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/core/auth/server/actor", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/core/database/db", () => ({
  db: {
    query: {
      clients: { findFirst: mocks.client },
      organizationMembers: { findFirst: mocks.staff },
      services: { findFirst: mocks.service },
    },
    insert: mocks.insert,
    update: mocks.update,
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createAppointment, updateAppointmentStatus } from "../actions";

function appointmentForm() {
  const formData = new FormData();
  formData.set("clientId", "10000000-0000-4000-8000-000000000001");
  formData.set("staffId", "10000000-0000-4000-8000-000000000002");
  formData.set("serviceId", "10000000-0000-4000-8000-000000000003");
  formData.set("startTime", "2099-01-01T10:00:00.000Z");
  formData.set("endTime", "2099-01-01T10:30:00.000Z");
  formData.set("status", "PENDING");
  return formData;
}

describe("frontera de acciones de agenda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({
      userId: "10000000-0000-4000-8000-000000000010",
      organizationId: "10000000-0000-4000-8000-000000000020",
      role: "RECEPTIONIST",
    });
    mocks.client.mockResolvedValue({ id: "client" });
    mocks.staff.mockResolvedValue({ id: "staff" });
    mocks.service.mockResolvedValue({ id: "service" });
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: mocks.insertValues });
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.update.mockReturnValue({ set: mocks.updateSet });
  });

  it("acepta recursos validados dentro de la organización del actor", async () => {
    const result = await createAppointment(appointmentForm());

    expect(result).toEqual({ success: true });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "10000000-0000-4000-8000-000000000020",
      }),
    );
  });

  it("rechaza un identificador que no resuelve dentro de la organización", async () => {
    mocks.client.mockResolvedValue(undefined);

    const result = await createAppointment(appointmentForm());

    expect(result.success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("no permite estados externos fuera del contrato", async () => {
    const result = await updateAppointmentStatus("10000000-0000-4000-8000-000000000030", "PAID");

    expect(result.success).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("no muta si la sesión no puede resolverse a un actor", async () => {
    mocks.requireActor.mockRejectedValue(new Error("No autenticado"));

    const result = await createAppointment(appointmentForm());

    expect(result.success).toBe(false);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
