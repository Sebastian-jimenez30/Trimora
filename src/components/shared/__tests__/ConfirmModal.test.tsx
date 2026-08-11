import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmModal from "../ConfirmModal";

describe("ConfirmModal", () => {
  it("no se monta cuando esta cerrado", () => {
    render(
      <ConfirmModal
        isOpen={false}
        title="Eliminar"
        message="Confirma"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("expone acciones accesibles y bloquea el cierre mientras procesa", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        isOpen
        title="Eliminar movimiento"
        message="Esta accion no se puede deshacer"
        onConfirm={vi.fn()}
        onCancel={onCancel}
        isLoading
      />,
    );

    expect(screen.getByRole("dialog", { name: "Eliminar movimiento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Procesando..." })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
