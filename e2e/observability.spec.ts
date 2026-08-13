import { expect, test } from "@playwright/test";

test("@auth-session propaga un identificador de correlacion seguro", async ({ page }) => {
  const response = await page.goto("/dashboard");
  expect(response?.headers()["x-request-id"]).toMatch(/^[a-zA-Z0-9._:-]{8,128}$/u);
});
