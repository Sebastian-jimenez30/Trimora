import { test, expect } from "@playwright/test";

test.describe.configure({ retries: 0 });

test("@receivables permite abonar un concepto y pagar completa la deuda agrupada", async ({
  page,
}) => {
  await page.goto("/pos");
  await page.getByRole("button", { name: "Por cobrar" }).click();

  const account = page.getByRole("button").filter({ hasText: "Deudor E2E" });
  await expect(account).toContainText("$20000.00");
  await account.click();
  const detail = page.getByRole("dialog", { name: "Cuenta por cobrar de Deudor E2E" });
  await expect(detail).toContainText("Corte E2E");
  await expect(detail).not.toContainText("movimiento pendiente");
  await detail.getByRole("button", { name: "Abonar" }).click();
  let dialog = page.getByRole("dialog", { name: "Abonar a Corte E2E" });
  await dialog.getByLabel("Monto ($)").fill("5000");
  await dialog.getByRole("button", { name: "Confirmar" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button").filter({ hasText: "Deudor E2E" })).toContainText(
    "$15000.00",
  );
  const updatedAccount = page.getByRole("button").filter({ hasText: "Deudor E2E" });
  await updatedAccount.getByRole("button", { name: "Pagar toda la deuda" }).click();
  dialog = page.getByRole("dialog", { name: "Pagar toda la deuda de Deudor E2E" });
  await expect(dialog.getByLabel("Monto ($)")).toHaveValue("15000.00");
  await dialog.getByRole("button", { name: "Confirmar pago total" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("No hay cuentas pendientes por cobrar.")).toBeVisible();
});
