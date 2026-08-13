import { mkdir } from "node:fs/promises";
import { test as setup, expect, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./support/constants";

async function authenticate(page: Page, email: string, statePath: string) {
  await page.goto("/login");
  await page.getByLabel(/Correo Electrónico/i).fill(email);
  await page.getByLabel(/Contraseña/i).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /Iniciar Sesión/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.context().storageState({ path: statePath });
}

setup.beforeAll(async () => {
  await mkdir("e2e/.auth", { recursive: true });
});

const allJourneyTags =
  "@auth-session @clients @agenda @pos-sales @inventory @receivables @history-analytics @roles-tenancy @accessibility";

setup(`autentica al administrador E2E ${allJourneyTags}`, async ({ page }) => {
  await authenticate(page, E2E_USERS.admin.email, "e2e/.auth/admin.json");
});

setup(`autentica al barbero E2E ${allJourneyTags}`, async ({ page }) => {
  await authenticate(page, E2E_USERS.barber.email, "e2e/.auth/barber.json");
});
