import { test } from "@playwright/test";
import { expectNoSeriousAccessibilityViolations } from "./support/accessibility";

const authenticatedRoutes = ["/dashboard", "/clientes", "/agenda", "/pos", "/analitica"];

for (const route of authenticatedRoutes) {
  test(`@accessibility no presenta hallazgos serios en ${route}`, async ({ page }) => {
    await page.goto(route);
    await expectNoSeriousAccessibilityViolations(page);
  });
}

test.describe("acceso público", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("@accessibility no presenta hallazgos serios en el acceso", async ({ page }) => {
    await page.goto("/login");
    await expectNoSeriousAccessibilityViolations(page);
  });
});
