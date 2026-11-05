import { expect, test } from "@playwright/test";

async function openDocument(page: import("@playwright/test").Page, name: string): Promise<void> {
  const tree = page.getByRole("tree", { name: /Archivos Markdown/ });
  if (!(await tree.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: /Abrir carpeta/ })
      .first()
      .click();
    await expect(tree).toBeVisible();
  }
  await page.locator(`[role="treeitem"][data-path="${name}"]`).click();
  await expect(page.getByTestId("doc-title")).toContainText(name);
}

test("pending from earlier sessions and documents is not restored", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      "nrvn.mock.pending.guia-estilo.md",
      JSON.stringify([{ key: "persisted", anchorKey: null }]),
    );
  });
  await page.goto("/");
  await openDocument(page, "guia-estilo.md");
  await expect(page.locator('.prose [data-pending="true"]')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("nrvn.mock.pending.guia-estilo.md")))
    .toBe("[]");

  await page.locator('.prose [data-block-type="paragraph"]').first().click();
  await expect(page.getByTestId("format-toolbar")).toBeVisible();
  await page.getByTestId("insert-menu-trigger").click();
  await page.getByRole("menuitem", { name: "Párrafo" }).click();
  await expect(page.locator('.prose [data-pending="true"]')).toHaveCount(1);
  await openDocument(page, "referencias.md");
  await openDocument(page, "guia-estilo.md");
  await expect(page.locator('.prose [data-pending="true"]')).toHaveCount(0);
  await expect(page.locator("[data-editing-area]")).toHaveCount(0);
  await expect(page.locator('[data-block-editable="true"]')).toHaveCount(0);
});
