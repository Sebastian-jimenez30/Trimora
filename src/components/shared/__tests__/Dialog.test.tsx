import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Dialog from "../Dialog";

describe("Dialog", () => {
  it("mueve y encierra el foco, cierra con Escape y lo restaura", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();

    const { unmount } = render(
      <Dialog label="Detalle" onClose={onClose} className="surface">
        <button data-autofocus>Primero</button>
        <button>Ultimo</button>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Detalle" });
    const first = screen.getByRole("button", { name: "Primero" });
    const last = screen.getByRole("button", { name: "Ultimo" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(first).toHaveFocus();

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("cierra desde el fondo pero no al interactuar con el contenido", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog label="Edicion" onClose={onClose}>
        <button>Guardar</button>
      </Dialog>,
    );

    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("dialog", { name: "Edicion" }).parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
