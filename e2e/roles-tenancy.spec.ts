import { test, expect } from "@playwright/test";

test("@roles-tenancy aísla datos y bloquea una página administrativa al barbero", async ({
  browser,
  page,
}) => {
  await page.goto("/clientes");
  await expect(page.getByText("Ana E2E")).toBeVisible();
  await expect(page.getByText("Cliente Secreto Otro Tenant")).toHaveCount(0);

  const barber = await browser.newContext({ storageState: "e2e/.auth/barber.json" });
  const barberPage = await barber.newPage();
  const response = await barberPage.goto("/equipo");
  expect(response?.status()).toBeGreaterThanOrEqual(400);
  await expect(barberPage.getByRole("heading", { name: "Equipo de Trabajo" })).toHaveCount(0);
  await barber.close();
});
