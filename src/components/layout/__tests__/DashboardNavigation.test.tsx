import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardNavigation, { type PendingAppointmentNotification } from "../DashboardNavigation";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard",
  updateAppointmentStatus: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));
vi.mock("@/modules/auth/actions", () => ({ logout: vi.fn() }));
vi.mock("@/modules/agenda/actions", () => ({
  updateAppointmentStatus: mocks.updateAppointmentStatus,
}));

const pending: PendingAppointmentNotification = {
  id: "appointment-1",
  clientName: "Ana",
  clientLastName: "Lopez",
  serviceName: "Corte",
  startTime: "2026-08-11T14:00:00.000Z",
};

describe("DashboardNavigation", () => {
  beforeEach(() => {
    mocks.pathname = "/dashboard";
  });

  it("limita las opciones administrativas y conserva el saludo solo en inicio", () => {
    const { rerender } = render(
      <DashboardNavigation username="Andrea" pendingAppointments={[]}>
        <p>Contenido</p>
      </DashboardNavigation>,
    );
    expect(screen.getByRole("heading", { name: "Hola, Andrea" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Equipo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Servicios" })).not.toBeInTheDocument();

    mocks.pathname = "/clientes";
    rerender(
      <DashboardNavigation username="Andrea" pendingAppointments={[]} isAdmin>
        <p>Contenido</p>
      </DashboardNavigation>,
    );
    expect(screen.getByRole("heading", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hola, Andrea" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Equipo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Servicios" })).toBeInTheDocument();
  });

  it("cierra las notificaciones con Escape, con la campana y al pulsar fuera", async () => {
    const user = userEvent.setup();
    render(
      <DashboardNavigation username="Andrea" pendingAppointments={[pending]}>
        <button>Contenido externo</button>
      </DashboardNavigation>,
    );
    const bell = screen.getByRole("button", { name: "Notificaciones de cobro" });

    await user.click(bell);
    expect(screen.getByRole("region", { name: "Pendientes de cobro" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Pendientes de cobro" })).not.toBeInTheDocument();
    expect(bell).toHaveFocus();

    await user.click(bell);
    await user.click(screen.getByRole("button", { name: "Contenido externo" }));
    expect(screen.queryByRole("region", { name: "Pendientes de cobro" })).not.toBeInTheDocument();

    await user.click(bell);
    await user.click(bell);
    expect(screen.queryByRole("region", { name: "Pendientes de cobro" })).not.toBeInTheDocument();
  });
});
