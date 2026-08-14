import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AvailabilityManager from "../AvailabilityManager";

const actions = vi.hoisted(() => ({
  saveBookingPolicy: vi.fn(),
  replaceWeeklyAvailability: vi.fn(),
  replaceStaffServices: vi.fn(),
  createAvailabilityBlock: vi.fn(),
  deleteAvailabilityBlock: vi.fn(),
  setCustomerIdentityPilotEnabled: vi.fn(),
}));

vi.mock("@/modules/public-booking/server/availability-actions", () => actions);

const props = {
  identityPilot: { enabled: false, slug: "barberia-demo" },
  policy: {
    timeZone: "America/Bogota",
    minimumNoticeMinutes: 60,
    maximumAdvanceDays: 60,
    slotIntervalMinutes: 15,
    bufferMinutes: 0,
  },
  staff: [{ id: "staff-1", name: "Andrea", role: "BARBER" }],
  services: [{ id: "service-1", name: "Corte", isActive: true }],
  windows: [
    {
      id: "window-1",
      staffId: null,
      dayOfWeek: 1,
      startMinute: 540,
      endMinute: 1080,
    },
  ],
  assignments: [{ staffId: "staff-1", serviceId: "service-1" }],
  blocks: [],
};

describe("configuración administrativa de disponibilidad", () => {
  beforeEach(() => {
    Object.values(actions).forEach((action) => action.mockReset());
    Object.values(actions).forEach((action) => action.mockResolvedValue({ success: true }));
  });

  it("presenta política, horarios, asignaciones y activación explícita del piloto", () => {
    render(<AvailabilityManager {...props} />);

    expect(screen.getByRole("heading", { name: "Política de reservas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Horario semanal" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Corte/u })).toBeChecked();
    expect(screen.getByRole("button", { name: "Habilitar acceso piloto" })).toBeInTheDocument();
  });

  it("envía al servidor la política y el horario general normalizados", async () => {
    const user = userEvent.setup();
    render(<AvailabilityManager {...props} />);

    await user.click(screen.getByRole("button", { name: "Guardar política" }));
    expect(actions.saveBookingPolicy).toHaveBeenCalledWith(props.policy);

    await user.click(screen.getByRole("button", { name: "Guardar horario" }));
    expect(actions.replaceWeeklyAvailability).toHaveBeenCalledWith({
      staffId: null,
      windows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1080 }],
    });
  });

  it("activa el piloto mediante una acción protegida sin habilitar reservas", async () => {
    const user = userEvent.setup();
    render(<AvailabilityManager {...props} />);

    await user.click(screen.getByRole("button", { name: "Habilitar acceso piloto" }));

    expect(actions.setCustomerIdentityPilotEnabled).toHaveBeenCalledWith(true);
    expect(screen.queryByText(/habilitar reservas públicas/iu)).not.toBeInTheDocument();
  });
});
