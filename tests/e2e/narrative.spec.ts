import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "narrative");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1400, height: 900 } });

async function openDocument(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.locator(".prose")).toBeVisible();
}

test("narrativa: extender y reducir generan propuestas A/B sin auto-apply", async ({ page }) => {
  test.setTimeout(120_000);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const screenshot = (name: string) =>
    page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: false });

  await openDocument(page);
  const paragraph = page.locator('.prose [data-block-type="paragraph"]').first();
  const bubble = page.getByTestId("format-toolbar");

  const heading = page.locator('.prose [data-block-type="heading"]').first();
  await heading.click({ modifiers: ["Shift"] });
  await expect(bubble).toBeVisible();
  await expect(page.getByTestId("bubble-extend-narrative")).toBeDisabled();
  await expect(page.getByTestId("bubble-reduce-narrative")).toBeDisabled();
  await expect(page.getByTestId("narrative-unavailable")).toBeVisible();
  await page.keyboard.press("Escape");

  await paragraph.click();
  await expect(bubble).toBeVisible();
  await expect(page.getByTestId("bubble-extend-narrative")).toBeVisible();
  await expect(page.getByTestId("bubble-reduce-narrative")).toBeVisible();

  await paragraph.click({ button: "right" });
  const menu = page.getByTestId("block-context-menu");
  await expect(menu).toBeVisible();
  const extendItem = menu.getByRole("menuitem", { name: "Extender narrativa" });
  const reduceItem = menu.getByRole("menuitem", { name: "Reducir narrativa" });
  await expect(extendItem).toBeVisible();
  await expect(reduceItem).toBeVisible();
  await expect(extendItem).toBeEnabled();
  await expect(reduceItem).toBeEnabled();
  await screenshot("narrative-context-menu.png");

  const original = await paragraph.textContent();
  await extendItem.click();
  const proposal = page.locator('[data-previewing="true"]');
  await expect(proposal).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("proposal-bubble")).toHaveCount(0);
  await expect(proposal.locator(".block-preview-original")).toContainText(original ?? "");
  await expect(proposal.getByTestId("block-preview-accept")).toBeVisible();
  await expect(proposal.getByTestId("block-preview-discard")).toBeVisible();
  await expect(proposal.getByTestId("block-preview-changes")).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("format-toolbar")).toHaveCount(0);
  await screenshot("narrative-extend-proposal.png");
  await proposal.getByTestId("block-preview-discard").click();
  await expect(proposal).toHaveCount(0);
  await expect(paragraph).toHaveText(original ?? "");

  await page.locator('.prose [data-block-type="heading"]').first().click({ button: "right" });
  await expect(menu).toBeVisible();
  const headingExtend = menu.getByRole("menuitem", { name: "Extender narrativa" });
  await expect(headingExtend).toBeDisabled();
  await expect(headingExtend).toHaveAttribute("title", /No aplicable a encabezados/);
  await page.keyboard.press("Escape");

  await paragraph.click({ button: "right" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Reducir narrativa" }).click();
  await expect(proposal).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("proposal-bubble")).toHaveCount(0);
  await expect(proposal.getByTestId("block-preview-accept")).toBeVisible();
  await expect(proposal.getByTestId("block-preview-discard")).toBeVisible();
  await expect(proposal.getByTestId("block-preview-changes")).toBeVisible();
  await expect(proposal.locator(".block-preview-original")).toContainText(original ?? "");
  await page.waitForTimeout(600);
  await screenshot("narrative-reduce-proposal.png");

  expect(pageErrors).toEqual([]);
});
