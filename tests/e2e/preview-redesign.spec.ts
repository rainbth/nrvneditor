import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function openCompleteReview(page: Page) {
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  const paragraph = page.locator(".prose [data-block-type='paragraph']").first();
  await paragraph.click({ button: "right" });
  await page
    .getByTestId("block-context-menu")
    .getByRole("menuitem", { name: "Revisar selección" })
    .click();
  const picker = page.getByTestId("reviewer-picker");
  await picker.locator('.reviewer-card[data-reviewer="director"]').click();
  await picker.locator('.reviewer-lens-card[data-lens="complete"]').click();
  const bubble = page.getByTestId("review-bubble");
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  await bubble.getByTestId("review-preview-fitting").click();
  const target = page.locator("[data-previewing='true']");
  await expect(target).toBeVisible();
  await expect(target.getByTestId("block-preview")).toBeFocused();
  return { target };
}

test("recommendation preview is inline, accessible, and clean in both themes", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(resolve("artifacts/screenshots/preview-redesign"), { recursive: true });
  const { target } = await openCompleteReview(page);
  const screenshots = "artifacts/screenshots/preview-redesign";

  await expect(target).toHaveAttribute("data-selected", "true");
  const selectionChrome = await target.evaluate((el) => {
    const after = getComputedStyle(el, "::after");
    return { background: after.backgroundColor, shadow: after.boxShadow };
  });
  expect(selectionChrome.background).toBe("rgba(0, 0, 0, 0)");
  expect(selectionChrome.shadow).toBe("none");
  await expect(target.locator(".block-preview-actions")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: `${screenshots}/preview-light.png` });
  await target.getByTestId("block-preview-accept").hover();
  await page.screenshot({ path: `${screenshots}/preview-light-hover.png` });
  const previewBox = await target.getByTestId("block-preview").boundingBox();
  const textBox = await target.locator(".block-preview-text").first().boundingBox();
  const paragraphBox = await page
    .locator(".prose [data-block-type='paragraph']")
    .nth(1)
    .boundingBox();
  if (!previewBox || !textBox || !paragraphBox) {
    throw new Error("Expected preview and paragraph elements to have bounding boxes");
  }
  expect(Math.abs(previewBox.x - textBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(previewBox.width - textBox.width)).toBeLessThanOrEqual(1);
  const contentWidths = await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>("[data-previewing='true']");
    const previewText = preview?.querySelector<HTMLElement>(".block-preview");
    const paragraph = document.querySelectorAll<HTMLElement>(
      ".prose [data-block-type='paragraph']",
    )[1];
    if (!preview || !previewText || !paragraph) {
      throw new Error("Expected preview block and normal paragraph");
    }
    const blockRect = preview.getBoundingClientRect();
    const previewRect = previewText.getBoundingClientRect();
    const blockStyle = getComputedStyle(preview);
    const paddingLeft = Number.parseFloat(blockStyle.paddingLeft);
    const paddingRight = Number.parseFloat(blockStyle.paddingRight);
    const paragraphRect = paragraph.getBoundingClientRect();
    const paragraphStyle = getComputedStyle(paragraph);
    const paragraphContentWidth =
      paragraphRect.width -
      Number.parseFloat(paragraphStyle.paddingLeft) -
      Number.parseFloat(paragraphStyle.paddingRight);
    const contentWidth = blockRect.width - paddingLeft - paddingRight;
    return {
      left: previewRect.left - (blockRect.left + paddingLeft),
      right: blockRect.right - paddingRight - previewRect.right,
      widthDelta: previewRect.width - contentWidth,
      paragraphWidthDelta: paragraphContentWidth - contentWidth,
    };
  });
  expect(Math.abs(contentWidths.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(contentWidths.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(contentWidths.widthDelta)).toBeLessThanOrEqual(1);
  expect(Math.abs(contentWidths.paragraphWidthDelta)).toBeLessThanOrEqual(1);
  const violations = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    violations.violations.filter(({ impact }) => impact === "serious" || impact === "critical"),
  ).toEqual([]);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("[data-previewing='true']")).toBeVisible();
  await page.screenshot({ path: `${screenshots}/preview-dark.png` });
  await target.getByTestId("block-preview-accept").hover();
  await page.screenshot({ path: `${screenshots}/preview-dark-hover.png` });
  await target.getByTestId("block-preview-accept").click();
  await expect(page.locator("[data-previewing='true']")).toHaveCount(0);
  await page.screenshot({ path: `${screenshots}/after-accept-dark.png` });
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: `${screenshots}/after-accept-light.png` });
});
