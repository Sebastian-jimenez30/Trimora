import { test, expect } from "@playwright/test";

test("@pos-sales @inventory cobra una venta y descuenta el inventario", async ({ page }) => {
  await page.goto("/inventario");
  let productRow = page.getByRole("row").filter({ hasText: "Cera E2E" });
  const initialStockText = await productRow.getByRole("cell").nth(2).innerText();
  const initialStock = Number.parseFloat(initialStockText);

  await page.goto("/pos");
  await page.getByText("Corte E2E", { exact: true }).first().click();
  await page.getByText("Cera E2E", { exact: true }).first().click();

  await expect(page.getByText("Ticket de Venta")).toBeVisible();
  await expect(page.getByText("Corte E2E", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Cera E2E", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Cobrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "¡Venta Exitosa!" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.goto("/inventario");
  productRow = page.getByRole("row").filter({ hasText: "Cera E2E" });
  await expect(productRow.getByRole("cell").nth(2)).toContainText((initialStock - 1).toFixed(4));
});
