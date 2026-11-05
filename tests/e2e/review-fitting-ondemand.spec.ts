import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("sugerencia bajo demanda crea una vista previa descartable", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await page.locator(".prose [data-block-type='paragraph']").first().click({ button: "right" });
  await page
    .getByTestId("block-context-menu")
    .getByRole("menuitem", { name: "Revisar selección" })
    .click();
  const picker = page.getByTestId("reviewer-picker");
  await picker.locator('.reviewer-card[data-reviewer="director"]').click();
  await picker.locator('.reviewer-lens-card[data-lens="problems"]').click();
  const bubble = page.getByTestId("review-bubble");
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  const request = bubble.getByTestId("review-request-fitting");
  await expect(request).toHaveText("Obtener sugerencia");
  await expect(bubble.getByTestId("review-preview-fitting")).toHaveCount(0);
  await mkdir("artifacts/screenshots/lenses", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/lenses/07-request-suggestion.png" });
  await request.click();
  await expect(request).toBeDisabled();
  await expect(request).toHaveAttribute("aria-busy", "true");
  await expect(request).toHaveText("Escribiendo…");
  await page.screenshot({ path: "artifacts/screenshots/lenses/08-writing.png" });
  const target = page.locator("[data-previewing='true']");
  await expect(target).toBeVisible({ timeout: 30_000 });
  await expect(bubble).toHaveCount(0);
  const preview = target.getByTestId("block-preview");
  await expect(preview).toBeVisible();
  await expect(preview).not.toBeEmpty();
  await page.screenshot({ path: "artifacts/screenshots/lenses/09-preview-from-suggestion.png" });
  await target.getByTestId("block-preview-discard").click();
  await expect(bubble).toBeVisible();
  await expect(bubble.getByTestId("review-preview-fitting")).toHaveText("Ver recomendación");
});

test("la lente complete ofrece preview directamente", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await page.locator(".prose [data-block-type='paragraph']").first().click({ button: "right" });
  await page
    .getByTestId("block-context-menu")
    .getByRole("menuitem", { name: "Revisar selección" })
    .click();
  const picker = page.getByTestId("reviewer-picker");
  await picker.locator('.reviewer-card[data-reviewer="director"]').click();
  await picker.locator('.reviewer-lens-card[data-lens="complete"]').click();
  const bubble = page.getByTestId("review-bubble");
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  await expect(bubble.getByTestId("review-preview-fitting")).toHaveText("Ver recomendación");
  await expect(bubble.getByTestId("review-request-fitting")).toHaveCount(0);
  await bubble.getByTestId("review-preview-fitting").click();
  const target = page.locator("[data-previewing='true']");
  await expect(target).toBeVisible({ timeout: 30_000 });
  await target.getByTestId("block-preview-discard").click();
  await expect(bubble.getByTestId("review-preview-fitting")).toHaveText("Ver recomendación");
});

test("una sugerencia inválida muestra error, conserva el documento y vuelve a habilitarse", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      globalThis as typeof globalThis & { __NRVN_MOCK_FITTING_FAIL__?: boolean }
    ).__NRVN_MOCK_FITTING_FAIL__ = true;
  });
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  const paragraph = page.locator(".prose [data-block-type='paragraph']").first();
  const original = await paragraph.textContent();
  await paragraph.click({ button: "right" });
  await page
    .getByTestId("block-context-menu")
    .getByRole("menuitem", { name: "Revisar selección" })
    .click();
  const picker = page.getByTestId("reviewer-picker");
  await picker.locator('.reviewer-card[data-reviewer="director"]').click();
  await picker.locator('.reviewer-lens-card[data-lens="problems"]').click();
  const bubble = page.getByTestId("review-bubble");
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  const request = bubble.getByTestId("review-request-fitting");
  await expect(request).toHaveText("Obtener sugerencia");
  await request.click();
  await expect(bubble.getByRole("alert")).toBeVisible();
  await expect(request).toBeEnabled();
  await expect(page.locator("[data-previewing='true']")).toHaveCount(0);
  await expect(paragraph).toHaveText(original);
});
