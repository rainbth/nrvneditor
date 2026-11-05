import { expect, type Page, test } from "@playwright/test";

async function openStyleGuide(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __nrvnRenderCounts?: Record<string, number> }).__nrvnRenderCounts = {};
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.locator(".prose [data-block-key]").first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  expect(await page.locator(".prose [data-block-key]").count()).toBe(31);
}

async function resetRenderCounts(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __nrvnRenderCounts?: Record<string, number> }).__nrvnRenderCounts = {};
  });
}

async function readRenderCounts(page: Page): Promise<{ total: number; keys: number }> {
  return page.evaluate(() => {
    const counts =
      (window as unknown as { __nrvnRenderCounts?: Record<string, number> }).__nrvnRenderCounts ??
      {};
    return {
      total: Object.values(counts).reduce((total, count) => total + count, 0),
      keys: Object.keys(counts).length,
    };
  });
}

test("selection does not re-render every Markdown block", async ({ page }) => {
  await openStyleGuide(page);
  const paragraphs = page.locator('.prose [data-block-type="paragraph"]');
  const pulsado = paragraphs.nth(Math.floor((await paragraphs.count()) / 2));
  await resetRenderCounts(page);
  await pulsado.click();
  await page.waitForTimeout(150);
  const { total, keys } = await readRenderCounts(page);
  console.log(`[nrvn] block-renders total=31 after-selection=${total}`);
  expect(total).toBeLessThanOrEqual(2);
  expect(keys).toBeLessThanOrEqual(2);
  await expect(pulsado).toHaveAttribute("data-selected", "true");
});

test("pure code-block selection renders at most two Markdown blocks", async ({ page }) => {
  await openStyleGuide(page);
  const pulsado = page.locator('.prose [data-block-type="code"]').first();
  await resetRenderCounts(page);
  await pulsado.click();
  await page.waitForTimeout(150);
  const { total, keys } = await readRenderCounts(page);
  console.log(`[nrvn] block-renders total=31 after-code-selection=${total}`);
  expect(total).toBeLessThanOrEqual(2);
  expect(keys).toBeLessThanOrEqual(2);
  await expect(pulsado).toHaveAttribute("data-selected", "true");
});
