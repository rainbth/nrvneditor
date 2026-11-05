import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const shots = "artifacts/screenshots/ab-preview";

async function openDocument(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.locator(".prose")).toBeVisible();
}

test("single-block A/B preview, history versions, and persistence", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(shots, { recursive: true });
  await openDocument(page);
  let block = page.locator('.prose [data-block-type="paragraph"]').first();
  await block.click();
  await page.keyboard.press("Meta+Enter");
  const before = ((await block.textContent()) ?? "").trim();
  const composer = page.getByTestId("agent-composer");
  const send = async () => {
    await composer.fill("Acorta este párrafo.");
    await page.getByTestId("agent-send").click();
    await expect(page.locator('[data-previewing="true"]')).toBeVisible({ timeout: 30_000 });
  };
  await send();
  const preview = page.locator('[data-previewing="true"]');
  const original = preview.getByRole("button", { name: "Original", exact: true });
  const proposed = preview.getByRole("button", { name: "Propuesta", exact: true });
  await original.click();
  await expect(original).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `${shots}/a-original.png` });
  await proposed.click();
  await expect(proposed).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `${shots}/b-proposed.png` });
  await proposed.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(original).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(proposed).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("block-preview-changes").click();
  await expect(composer).toHaveValue("Sobre este bloque: ");
  await expect(block).toHaveAttribute("data-selected", "true");
  await page.getByTestId("block-preview-discard").click();
  await expect(block).toHaveText(before);
  await send();
  await page.getByTestId("block-preview-accept").click();
  await expect(page.locator('[data-previewing="true"]')).toHaveCount(0);
  block = page
    .locator('.prose [data-block-type="paragraph"]')
    .filter({ hasText: "revisado por el agente" });
  await expect(block).toBeVisible();
  const currentText = ((await block.textContent()) ?? "").trim();

  await block.click({ button: "right" });
  const context = page.getByTestId("block-context-menu");
  await context.getByRole("menuitem", { name: "Versiones" }).click();
  const dialog = page.getByRole("dialog", { name: "Versiones del bloque" });
  await expect(dialog).toBeVisible();
  const compare = dialog.locator('button[data-testid^="version-compare-"]').first();
  await expect(compare).toBeVisible();
  await compare.click();
  await expect(page.locator('[data-previewing="true"]')).toBeVisible();
  const historyPreview = page.locator('[data-previewing="true"]');
  await expect(historyPreview.locator(".block-preview-original")).toBeVisible();
  await expect(historyPreview.locator(".block-preview-text")).toBeHidden();
  const restore = page.getByTestId("block-preview-accept");
  await expect(restore).toHaveText("Restaurar");
  await expect(restore).toBeDisabled();
  await historyPreview.getByRole("button", { name: "Actual", exact: true }).click();
  await expect(historyPreview.locator(".block-preview-original")).toBeVisible();
  await expect(historyPreview.locator(".block-preview-text")).toBeHidden();
  await historyPreview.getByRole("button", { name: "Anterior", exact: true }).click();
  await expect(restore).toBeEnabled();
  await page.screenshot({ path: `${shots}/c-history.png` });
  await expect(page.getByTestId("block-preview-discard")).toHaveText("Cerrar");
  await page.getByTestId("block-preview-discard").click();
  await expect(block).toHaveText(currentText);

  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  block = page
    .locator('.prose [data-block-type="paragraph"]')
    .filter({ hasText: "revisado por el agente" });
  await expect(block).toBeVisible();
  await block.click({ button: "right" });
  await page.getByTestId("block-context-menu").getByRole("menuitem", { name: "Versiones" }).click();
  const persistedDialog = page.getByRole("dialog", { name: "Versiones del bloque" });
  await expect(
    persistedDialog.locator('button[data-testid^="version-compare-"]').first(),
  ).toBeVisible();
});
