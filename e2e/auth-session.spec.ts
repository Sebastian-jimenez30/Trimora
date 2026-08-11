import { test, expect } from "@playwright/test";

test.describe("@auth-session autenticación y sesión", () => {
  test("redirige al visitante y conserva una sesión autenticada", async ({ browser, page }) => {
    const anonymous = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto("/clientes");
    await expect(anonymousPage).toHaveURL(/\/login$/);
    await anonymous.close();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/Admin E2E/i).first()).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
