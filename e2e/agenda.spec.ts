import { test, expect } from "@playwright/test";
import { E2E_IDS } from "./support/constants";

test.describe.configure({ retries: 0 });

test("@agenda crea y edita una cita con minutos exactos", async ({ page }) => {
  await page.goto("/agenda");
  const nextPeriod = page.getByRole("button", { name: "Período siguiente" });
  await nextPeriod.click();
  await nextPeriod.click();
  await page.getByRole("button", { name: "Nueva cita" }).click();

  let dialog = page.getByRole("dialog", { name: "Nueva Cita" });
  const client = dialog.getByRole("combobox", { name: "Cliente" });
  await client.fill("Ana E2E");
  await dialog.getByRole("option", { name: "Ana E2E" }).click();
  await dialog.getByLabel("Servicio *").selectOption(E2E_IDS.service);
  await dialog.getByLabel("Barbero *").selectOption(E2E_IDS.adminMembership);
  await dialog.getByLabel("Hora de Inicio").fill("11:17");
  await dialog.getByRole("button", { name: "Guardar Cita" }).click();

  await expect(dialog).toBeHidden();
  await page.getByText("Ana E2E").last().click();
  dialog = page.getByRole("dialog", { name: "Detalles de la Cita" });
  await expect(dialog.getByLabel("Hora de Inicio")).toHaveValue("11:17");
  await dialog.getByLabel("Hora de Inicio").fill("11:23");
  await dialog.getByRole("button", { name: "Guardar Cita" }).click();

  await expect(dialog).toBeHidden();
  await page.getByText("Ana E2E").last().click();
  await expect(
    page.getByRole("dialog", { name: "Detalles de la Cita" }).getByLabel("Hora de Inicio"),
  ).toHaveValue("11:23");
});
