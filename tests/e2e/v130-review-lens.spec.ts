import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("V130: seleccionar lente muestra el resultado de esa revisión", async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir("artifacts/screenshots/lenses", { recursive: true });
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.locator(".prose")).toBeVisible();
  await page.locator('.prose [data-block-type="paragraph"]').first().click({ button: "right" });
  const menu = page.getByTestId("block-context-menu");
  await menu.getByRole("menuitem", { name: "Revisar selección" }).click();
  const picker = page.getByTestId("reviewer-picker");
  await expect(picker.locator(".reviewer-card")).toHaveCount(7);
  await expect
    .poll(() => picker.evaluate((element) => Number(getComputedStyle(element).opacity)))
    .toBe(1);
  await expect
    .poll(() =>
      picker
        .locator(".reviewer-picker-header")
        .last()
        .evaluate((element) =>
          Number(getComputedStyle(element.parentElement as HTMLElement).opacity),
        ),
    )
    .toBe(1);
  await expect
    .poll(() =>
      picker
        .locator(".reviewer-card")
        .evaluateAll((elements) =>
          elements.every((element) => Number(getComputedStyle(element).opacity) === 1),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: "artifacts/screenshots/lenses/01-picker-reviewer.png" });
  await picker.locator('.reviewer-card[data-reviewer="director"]').click();
  await expect(picker.locator(".reviewer-lens-card")).toHaveCount(5);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-lens")), {
      timeout: 400,
    })
    .toBe("works");
  await expect
    .poll(() =>
      picker
        .locator(".reviewer-picker-header")
        .last()
        .evaluate((element) =>
          Number(getComputedStyle(element.parentElement as HTMLElement).opacity),
        ),
    )
    .toBe(1);
  await page.screenshot({ path: "artifacts/screenshots/lenses/02-picker-lens.png" });
  await page.keyboard.press("Escape");
  await expect(picker.locator(".reviewer-card").first()).toBeFocused();
  await picker.locator('.reviewer-card[data-reviewer="director"]').click();
  await expect(picker.locator(".reviewer-lens-card")).toHaveCount(5);
  await picker.locator('.reviewer-lens-card[data-lens="questions"]').click();
  const bubble = page.getByTestId("review-bubble");
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  await expect(bubble.getByTestId("review-lens-label")).toHaveText("Qué preguntaría");
  await expect(bubble.getByRole("heading", { name: "Preguntas al autor" })).toBeVisible();
  await expect(bubble.getByTestId("review-variant")).toHaveCount(0);
  await expect
    .poll(() => bubble.evaluate((element) => Number(getComputedStyle(element).opacity)))
    .toBe(1);
  await page.screenshot({ path: "artifacts/screenshots/lenses/03-result-questions.png" });
  await page.getByTestId("mode-toggle-markdown").click();
  const panelReview = page.getByTestId("review-card");
  await expect(panelReview).toBeVisible();
  await expect(panelReview.getByTestId("review-lens-label")).toHaveText("Qué preguntaría");
});
