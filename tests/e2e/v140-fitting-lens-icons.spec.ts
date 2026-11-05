import { mkdir } from "node:fs/promises";
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
  const original = ((await paragraph.textContent()) ?? "").trim();
  await paragraph.click({ button: "right" });
  await page
    .getByTestId("block-context-menu")
    .getByRole("menuitem", { name: "Revisar selección" })
    .click();
  const picker = page.getByTestId("reviewer-picker");
  await picker.locator('.reviewer-card[data-reviewer="director"]').click();
  const icons = picker.locator(".reviewer-lens-icon");
  await expect(icons).toHaveCount(5);
  for (const icon of await icons.all()) {
    await expect(icon).toHaveAttribute("alt", "");
    await expect
      .poll(() => icon.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    const bounds = await icon.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(40);
    expect(bounds?.width).toBeLessThanOrEqual(48);
    expect(bounds?.height).toBeGreaterThanOrEqual(40);
    expect(bounds?.height).toBeLessThanOrEqual(48);
  }
  await mkdir("artifacts/screenshots/lenses", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/lenses/04-picker-icons.png" });
  await picker.locator('.reviewer-lens-card[data-lens="complete"]').click();
  const bubble = page.getByTestId("review-bubble");
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  await expect(bubble.getByTestId("review-fitting")).toHaveCount(0);
  await expect(bubble.getByTestId("review-propose-fitting")).toHaveCount(0);
  const previewButton = bubble.getByTestId("review-preview-fitting");
  await expect(previewButton).toHaveText("Ver recomendación");
  await expect(bubble.getByTestId("review-discard")).toBeVisible();
  await expect(bubble.locator(".button-primary")).toHaveCount(1);
  await previewButton.click();
  await expect(bubble).toBeHidden();
  const target = page.locator("[data-previewing='true']");
  await expect(target).toBeVisible();
  await expect(target.getByTestId("block-preview")).toBeFocused();
  await expect(target.getByTestId("block-preview-badge")).toHaveText("Vista previa");
  const previewText = target.getByTestId("block-preview");
  await expect(previewText).not.toContainText("```");
  await expect(previewText).not.toContainText("#");
  await expect(target.locator(".block-preview-original")).toContainText(original);
  return { original, target, page };
}

test("V140: iconos y fitting con preview aceptable", async ({ page }) => {
  test.setTimeout(120_000);
  const { target } = await openCompleteReview(page);
  await page.screenshot({ path: "artifacts/screenshots/lenses/05-block-preview.png" });
  await target.getByTestId("block-preview-accept").click();
  await expect(page.locator("[data-previewing='true']")).toHaveCount(0);
  const appliedParagraph = page.locator('.prose [data-block-type="paragraph"]').first();
  await expect(appliedParagraph).toContainText(
    "Esta guía reúne las decisiones de escritura del proyecto nrvn.",
  );
  await expect(appliedParagraph).toBeFocused();
  await page.screenshot({ path: "artifacts/screenshots/lenses/06-after-accept.png" });
});

test("V140: descartar o Escape cancela el preview sin cambiar el original", async ({ page }) => {
  test.setTimeout(120_000);
  const first = await openCompleteReview(page);
  await first.target.getByTestId("block-preview-discard").click();
  await expect(page.locator("[data-previewing='true']")).toHaveCount(0);
  await expect(page.locator('.prose [data-block-type="paragraph"]').first()).toContainText(
    first.original,
  );

  const second = await openCompleteReview(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-previewing='true']")).toHaveCount(0);
  await expect(page.locator('.prose [data-block-type="paragraph"]').first()).toContainText(
    second.original,
  );
  await expect(page.locator('.prose [data-block-type="paragraph"]').first()).toBeFocused();

  const third = await openCompleteReview(page);
  const secondParagraph = page.locator('.prose [data-block-type="paragraph"]').nth(1);
  await expect(secondParagraph).toBeVisible();
  await secondParagraph.click();
  await expect(page.locator("[data-previewing='true']")).toHaveCount(0);
  await expect(page.locator('.prose [data-block-type="paragraph"]').first()).toContainText(
    third.original,
  );
});
