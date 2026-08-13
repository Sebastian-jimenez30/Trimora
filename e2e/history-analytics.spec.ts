import { test, expect } from "@playwright/test";
import { E2E_IDS } from "./support/constants";

test("@history-analytics presenta historial, recibo y analítica trazable", async ({ page }) => {
  await page.goto("/pos");
  await page.getByRole("button", { name: "Historial" }).click();
  await page.getByText("Corte E2E, Cera E2E", { exact: true }).first().click();

  const detail = page.getByRole("dialog", { name: "Detalle del movimiento" });
  await expect(detail).toContainText("Ana E2E");
  await expect(detail).toContainText("Corte E2E");
  await expect(detail).toContainText("Cera E2E");

  await page.goto(`/pos/receipt/${E2E_IDS.completedTransaction}`);
  await expect(page.getByText("Trimora E2E")).toBeVisible();
  await expect(page.getByText("Corte E2E")).toBeVisible();
  await expect(page.getByText("Cera E2E")).toBeVisible();

  await page.goto("/analitica");
  await expect(page.getByRole("heading", { name: "Analítica integral" })).toBeVisible();
  await expect(page.getByText("Servicios más solicitados")).toBeVisible();
  await expect(page.getByText("Productos más vendidos")).toBeVisible();
});
