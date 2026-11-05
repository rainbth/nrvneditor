import { expect, test } from "@playwright/test";

test("agent block inserts, regenerates and can be adjusted", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.locator(".prose")).toBeVisible();
  await page.locator('.prose [data-block-type="paragraph"]').first().click();
  await page.getByTestId("insert-menu-trigger").click();
  await page.getByRole("menuitem", { name: "Bloque de agente" }).click();

  const generated = page
    .locator('.prose [data-block-type="paragraph"]')
    .filter({ hasText: "revisado por el agente" });
  await expect(generated).toBeVisible({ timeout: 30_000 });
  await generated.click();
  await expect(page.getByTestId("agent-block-bar")).toBeVisible();
  const before = await page.getByTestId("agent-message").count();
  await page.getByTestId("agent-block-regenerate").click();
  await expect(page.getByTestId("agent-message")).toHaveCount(before + 2, {
    timeout: 30_000,
  });
  await expect(generated).toBeVisible({ timeout: 30_000 });
  await generated.click();
  await expect(page.getByTestId("agent-block-bar")).toBeVisible();
  await page.locator(".render-canvas").click({ position: { x: 2, y: 2 } });
  await expect(page.getByTestId("agent-block-bar")).toHaveCount(0);
  await generated.click();
  await page.getByTestId("agent-block-adjust").click();
  const composer = page.getByTestId("agent-composer");
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue(/Ajusta este párrafo: /);
});
