import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "v030");
test.use({ viewport: { width: 1400, height: 900 } });

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

test("V030 single-block proposal previews inline with A/B and undo", async ({ page }) => {
  test.setTimeout(120_000);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await openDocument(page);
  const block = page.locator('.prose [data-block-type="paragraph"]').first();
  await block.click();
  await page.keyboard.press("Meta+Enter");
  const before = ((await block.textContent()) ?? "").trim();
  const composer = page.getByTestId("agent-composer");
  await composer.fill("Acorta este párrafo.");
  await page.getByTestId("agent-send").click();

  const previewing = page.locator('[data-previewing="true"]');
  await expect(previewing).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("proposal-bubble")).toHaveCount(0);
  const panel = page.getByTestId("agent-proposal");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("agent-proposal-goto-inline")).toBeVisible();
  for (const id of ["agent-proposal-accept", "agent-proposal-reject", "agent-proposal-changes"])
    await expect(page.getByTestId(id)).toHaveCount(0);
  const actions = previewing.locator(".block-preview-actions");
  await expect(actions.getByTestId("block-preview-accept")).toBeVisible();
  await expect(actions.getByTestId("block-preview-discard")).toBeVisible();
  await expect(actions.getByTestId("block-preview-changes")).toBeVisible();
  await expect
    .poll(() =>
      actions
        .locator("button")
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-testid"))),
    )
    .toEqual(["block-preview-accept", "block-preview-discard", "block-preview-changes"]);
  const proposed = previewing.getByRole("button", { name: "Propuesta", exact: true });
  const originalView = previewing.getByRole("button", { name: "Original", exact: true });
  await expect(proposed).toHaveAttribute("aria-pressed", "true");
  await originalView.click();
  await expect(originalView).toHaveAttribute("aria-pressed", "true");
  await expect(previewing.locator(".block-preview-original")).toBeVisible();
  await expect(previewing.locator(".block-preview-text")).toBeHidden();
  await page.screenshot({ path: path.join(SHOTS_DIR, "proposal-original.png") });
  await proposed.click();
  await expect(proposed).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: path.join(SHOTS_DIR, "proposal-proposed.png") });
  await proposed.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(originalView).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(proposed).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("block-preview-changes").click();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("Sobre este bloque: ");
  await expect(block).toHaveAttribute("data-selected", "true");
  await page.getByTestId("block-preview-discard").click();
  await expect(previewing).toHaveCount(0);
  await expect(block).toHaveText(before);
  await expect(page.getByTestId("agent-undo-bar")).toBeVisible();
  await page.getByTestId("agent-undo-reject").click();
  await expect(previewing).toBeVisible();
  await page.getByTestId("block-preview-accept").click();
  await expect(previewing).toHaveCount(0);
  await expect(
    page
      .locator('.prose [data-block-type="paragraph"]')
      .filter({ hasText: "revisado por el agente" }),
  ).toBeVisible();
});
