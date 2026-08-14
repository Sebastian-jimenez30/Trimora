import { expect, test } from "@playwright/test";

test.describe("@public-booking identidad pública aislada", () => {
  test("mantiene inaccesible el flujo deshabilitado y conserva la sesión administrativa", async ({
    browser,
    page,
  }) => {
    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const publicPage = await anonymous.newPage();
    const response = await publicPage.goto("/reservar/organizacion-inexistente/acceso");
    expect(response?.status()).toBe(404);
    await anonymous.close();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/u);
    await expect(page.getByText(/Admin E2E/iu).first()).toBeVisible();
  });
});
