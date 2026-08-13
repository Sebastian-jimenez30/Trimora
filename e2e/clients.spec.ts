import { test, expect } from "@playwright/test";

test.describe.configure({ retries: 0 });

test("@clients crea un cliente desde la interfaz", async ({ page }) => {
  await page.goto("/clientes");
  await page.getByRole("button", { name: /Nuevo Cliente/i }).click();

  const dialog = page.getByRole("dialog", { name: "Nuevo Cliente" });
  await dialog.getByLabel("Nombre *").fill("Cliente Creado");
  await dialog.getByLabel("Apellido").fill("E2E");
  await dialog.getByLabel(/Teléfono/i).fill("3000000099");
  await dialog.getByLabel("Email").fill("creado.e2e@trimora.test");
  await dialog.getByRole("button", { name: "Guardar Cliente" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Cliente Creado E2E")).toBeVisible();
});
