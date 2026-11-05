import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "audit2");
test.use({ viewport: { width: 1400, height: 900 } });

async function openWorkspaceAndDocument(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await expect(page.getByRole("tree", { name: /Archivos Markdown/ })).toBeVisible();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.getByTestId("doc-title")).toContainText("guia-estilo.md");
  await expect(page.locator(".prose")).toBeVisible();
}

test("Audit2: arrows in inline editing and Escape selection lifecycle", async ({ page }) => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await openWorkspaceAndDocument(page);

  const prose = page.locator(".prose");
  const paragraphs = prose.locator('[data-block-type="paragraph"]');
  const first = paragraphs.first();
  const next = paragraphs.nth(1);
  await first.click();
  const editable = prose.locator('[data-block-editable="true"]');
  await expect(editable).toBeVisible();
  const originalIndex = await editable.getAttribute("data-block-index");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(editable).toBeFocused();
  await expect(editable).toHaveAttribute("data-block-index", originalIndex ?? "");
  await expect(next).not.toBeFocused();
  await page.screenshot({ path: path.join(SHOTS_DIR, "inline-edit-arrows.png") });

  await page.keyboard.press("Escape");
  await expect(first).not.toHaveAttribute("data-block-editable", "true");
  await expect(first).toHaveAttribute("data-selected", "true");
  await page.screenshot({ path: path.join(SHOTS_DIR, "escape-selection.png") });
  await page.keyboard.press("Escape");
  await expect(first).not.toHaveAttribute("data-selected", "true");

  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(next).toBeFocused();
});
