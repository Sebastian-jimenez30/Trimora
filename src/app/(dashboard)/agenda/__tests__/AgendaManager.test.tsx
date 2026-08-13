import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AgendaManager, {
  type AgendaClient,
  type AgendaService,
  type AgendaStaff,
} from "../AgendaManager";

vi.mock("@/modules/agenda/actions", () => ({
  createAppointment: vi.fn(),
  updateAppointment: vi.fn(),
  updateAppointmentStatus: vi.fn(),
  deleteAppointment: vi.fn(),
}));
vi.mock("@/modules/clients/actions", () => ({ createCustomer: vi.fn() }));
vi.mock("react-hot-toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const clients: AgendaClient[] = [
  {
    id: "client-1",
    firstName: "Ana",
    lastName: "Lopez",
    phone: "3001234567",
  },
];
const services: AgendaService[] = [
  { id: "service-1", name: "Corte", durationMinutes: 37, price: "25000.00" },
];
const staff: AgendaStaff[] = [{ id: "staff-1", name: "Carlos", role: "BARBER" }];

describe("AgendaManager", () => {
  it("permite buscar y escoger clientes mostrando solamente sus nombres", async () => {
    const user = userEvent.setup();
    render(
      <AgendaManager
        initialAppointments={[]}
        clients={clients}
        services={services}
        staff={staff}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Nueva cita" }));

    const dialog = screen.getByRole("dialog", { name: "Nueva Cita" });
    expect(dialog).toBeInTheDocument();
    const picker = screen.getByRole("combobox", { name: "Cliente" });
    await user.click(picker);
    expect(screen.getByRole("option", { name: "Ana Lopez" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("3001234567");

    await user.type(picker, "Ana");
    await user.click(screen.getByRole("option", { name: "Ana Lopez" }));
    expect(picker).toHaveValue("Ana Lopez");
  });

  it("expone un selector de hora con precision de minutos", async () => {
    const user = userEvent.setup();
    render(
      <AgendaManager
        initialAppointments={[]}
        clients={clients}
        services={services}
        staff={staff}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Nueva cita" }));

    const time = screen.getByLabelText("Hora de Inicio");
    expect(time).toHaveAttribute("type", "time");
    expect(time).toHaveAttribute("step", "60");
    expect(time).toHaveValue("09:00");
  });
});
