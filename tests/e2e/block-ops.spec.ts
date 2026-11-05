import { expect, test } from "@playwright/test";

test("block operations work from the toolbar and pending blocks disable them", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.locator(".prose")).toBeVisible();
  const paragraphs = page.locator('.prose [data-block-type="paragraph"]');
  const initial = await paragraphs.allTextContents();
  await paragraphs.nth(1).click();
  await page.getByTestId("block-actions-trigger").click();
  await page.getByRole("menuitem", { name: "Mover arriba" }).click();
  await expect.poll(async () => paragraphs.allTextContents()).not.toEqual(initial);
  await page.keyboard.press("Meta+z");
  await expect.poll(async () => paragraphs.allTextContents()).toEqual(initial);
  await paragraphs.nth(1).click();
  await page.getByTestId("block-actions-trigger").click();
  await page.getByRole("menuitem", { name: "Duplicar bloque" }).click();
  await expect(paragraphs).not.toHaveCount(initial.length);
  await page.keyboard.press("Meta+z");
  await expect(paragraphs).toHaveCount(initial.length);
  await paragraphs.nth(1).click();
  await page.getByTestId("block-actions-trigger").click();
  await page.getByRole("menuitem", { name: "Eliminar bloque" }).click();
  await expect(paragraphs).not.toHaveCount(initial.length);
  await page.keyboard.press("Meta+z");
  await expect(paragraphs).toHaveCount(initial.length);
  await page.getByTestId("insert-menu-trigger").click();
  await page.getByRole("menuitem", { name: "Párrafo" }).click();
  await page.locator('.prose [data-pending="true"]').last().click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Eliminar bloque" })).toBeDisabled();
});
