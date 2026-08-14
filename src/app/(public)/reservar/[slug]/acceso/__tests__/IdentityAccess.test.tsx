import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import IdentityAccess from "../IdentityAccess";

describe("acceso público sin contraseña", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("oculta teléfono sin proveedor y completa el flujo de correo", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { challengeId: "challenge-id", message: "Revisa tu correo." },
          }),
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { authenticated: true, customer: { displayName: "Ana Pérez" } },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <IdentityAccess
        slug="barberia-demo"
        organizationName="Barbería Demo"
        phoneOtpEnabled={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Teléfono" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));

    await user.type(await screen.findByLabelText("Nombre completo"), "Ana Pérez");
    await user.type(screen.getByLabelText("Código de verificación"), "123456");
    await user.click(screen.getByRole("button", { name: "Verificar código" }));

    expect(await screen.findByText("Verificación completada")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/public/organizations/barberia-demo/identity/verify",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("muestra teléfono sólo cuando el proveedor está habilitado", () => {
    render(
      <IdentityAccess slug="barberia-demo" organizationName="Barbería Demo" phoneOtpEnabled />,
    );
    expect(screen.getByRole("button", { name: "Teléfono" })).toBeInTheDocument();
  });
});
