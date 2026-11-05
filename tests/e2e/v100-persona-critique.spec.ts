import { expect, type Page, test } from "@playwright/test";

async function openDocument(page: Page) {
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.locator(".prose")).toBeVisible();
}

test("V100: revision of a selected block", async ({ page }) => {
  test.setTimeout(120_000);
  await openDocument(page);
  const block = page.locator('.prose [data-block-type="paragraph"]').first();
  const blockKey = await block.getAttribute("data-block-key");
  expect(blockKey).not.toBeNull();
  await block.click({ button: "right" });
  const menu = page.getByTestId("block-context-menu");
  await expect(menu.getByTestId("menu-review")).toBeVisible();
  await menu.getByRole("menuitem", { name: "Revisar selección" }).click();
  const picker = page.getByTestId("reviewer-picker");
  await expect(picker).toBeVisible();
  await picker.locator('.reviewer-card[data-reviewer="director"]').click();
  await picker.locator('.reviewer-lens-card[data-lens="complete"]').click();
  const bubble = page.getByTestId("review-bubble");
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  await expect(bubble).toContainText("Lo que funciona");
  await expect(bubble).toContainText("Lo que no funciona");
  await expect(bubble).toContainText("Sugerencias");
  await expect(bubble.getByTestId("review-preview-fitting")).toHaveText("Ver recomendación");
  const geometry = await bubble.evaluate((element, blockKey) => {
    const bubbleRect = element.getBoundingClientRect();
    const blockRect = document
      .querySelector<HTMLElement>(`.prose [data-block-key="${blockKey}"]`)
      ?.getBoundingClientRect();
    return {
      top: bubbleRect.top,
      bottom: bubbleRect.bottom,
      left: bubbleRect.left,
      right: bubbleRect.right,
      blockTop: blockRect?.top,
      blockBottom: blockRect?.bottom,
      blockLeft: blockRect?.left,
      blockRight: blockRect?.right,
    };
  }, blockKey);
  expect(geometry.blockTop).toBeDefined();
  expect(geometry.blockBottom).toBeDefined();
  if (geometry.blockTop === undefined || geometry.blockBottom === undefined) {
    throw new Error("No se encontró la geometría del bloque anclado");
  }
  const slop = 12;
  const verticalSeparation =
    geometry.bottom <= geometry.blockTop + slop || geometry.top >= geometry.blockBottom - slop;
  const horizontalSeparation =
    geometry.blockLeft !== undefined &&
    geometry.blockRight !== undefined &&
    (geometry.right <= geometry.blockLeft + slop || geometry.left >= geometry.blockRight - slop);
  const aligned = Math.abs(geometry.top - geometry.blockTop) < 2;
  expect(verticalSeparation || horizontalSeparation || aligned).toBe(true);
  await bubble.getByRole("button", { name: "Cerrar revisión" }).click();
  await expect(bubble).toHaveCount(0);
});
