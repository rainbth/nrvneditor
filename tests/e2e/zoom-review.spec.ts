import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const SHOTS = "artifacts/screenshots/zoom-review";

async function openFixture(page: import("@playwright/test").Page, file: string) {
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await expect(page.getByRole("tree", { name: /Archivos Markdown/ })).toBeVisible();
  await page.locator(`[role="treeitem"][data-path="${file}"]`).click();
  await expect(page.locator(".prose")).toBeVisible();
}

async function startCompleteReview(
  page: import("@playwright/test").Page,
  block: import("@playwright/test").Locator,
) {
  await block.click({ button: "right" });
  await page
    .getByTestId("block-context-menu")
    .getByRole("menuitem", { name: "Revisar selección" })
    .click();
  const picker = page.getByTestId("reviewer-picker");
  await picker.locator('.reviewer-card[data-reviewer="director"]').click();
  await picker.locator('.reviewer-lens-card[data-lens="complete"]').click();
  return page.getByTestId("review-bubble");
}

async function reviewGeometry(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const bubbleEl = document.querySelector<HTMLElement>("[data-testid=review-bubble]");
    const anchor = document.querySelectorAll<HTMLElement>(
      '.prose [data-block-type="paragraph"]',
    )[1];
    if (!bubbleEl || !anchor) throw new Error("review geometry missing");
    const bubble = bubbleEl.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const all = [...document.querySelectorAll<HTMLElement>(".prose .block")];
    const index = all.indexOf(anchor);
    const previous = all[index - 1]?.getBoundingClientRect() ?? null;
    const next = all[index + 1]?.getBoundingClientRect() ?? null;
    const intersects = (rect: DOMRect | null) =>
      rect !== null &&
      bubble.left < rect.right &&
      bubble.right > rect.left &&
      bubble.top < rect.bottom &&
      bubble.bottom > rect.top;
    return {
      zoom: document.querySelector<HTMLElement>("[data-testid=page-zoom-reset]")?.textContent,
      bubble: { top: bubble.top, bottom: bubble.bottom, left: bubble.left, right: bubble.right },
      placement: bubbleEl.dataset.placement,
      anchor: { top: anchorRect.top, bottom: anchorRect.bottom },
      previous: previous ? { top: previous.top, bottom: previous.bottom } : null,
      next: next ? { top: next.top, bottom: next.bottom } : null,
      anchorOverlap: intersects(anchorRect),
      previousOverlap: intersects(previous),
      nextOverlap: intersects(next),
      otherBlocksOverlap: all.some(
        (element) => element !== anchor && intersects(element.getBoundingClientRect()),
      ),
      viewportHeight: innerHeight,
    };
  });
}

async function expectStableReviewGeometry(page: import("@playwright/test").Page) {
  try {
    await expect
      .poll(() => reviewGeometry(page), { timeout: 10_000, intervals: [100, 200, 400] })
      .toMatchObject({
        anchorOverlap: false,
        previousOverlap: false,
        nextOverlap: false,
        otherBlocksOverlap: false,
      });
  } catch (error) {
    console.info("stable geometry failure", await reviewGeometry(page));
    throw error;
  }
  const geometry = await reviewGeometry(page);
  expect(geometry.bubble.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.bubble.top).toBeGreaterThanOrEqual(8);
  expect(geometry.bubble.left).toBeGreaterThanOrEqual(0);
  expect(geometry.bubble.right).toBeLessThanOrEqual(1400);
  return geometry;
}

test("zoom de página y revisión honesta se conservan y recalculan", async ({ page }) => {
  test.setTimeout(180_000);
  await mkdir(SHOTS, { recursive: true });
  await openFixture(page, "guia-estilo.md");
  await page.getByTestId("page-zoom-reset").click();
  const zoomOut = page.getByTestId("page-zoom-out");
  const zoomIn = page.getByTestId("page-zoom-in");
  const reset = page.getByTestId("page-zoom-reset");
  const fontHeader = () =>
    page.locator(".header-title").evaluate((el) => getComputedStyle(el).fontSize);
  const baseHeaderFont = await fontHeader();
  await zoomOut.click();
  await zoomOut.click();
  await expect(reset).toHaveText("80%");
  expect(await fontHeader()).toBe(baseHeaderFont);
  const reviewBlock = page.locator('.prose [data-block-type="paragraph"]').nth(1);
  const bubble = await startCompleteReview(page, reviewBlock);
  await expect(bubble).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("reviewer-picker")).toHaveCount(0);
  await expect(page.getByTestId("page-zoom-reset")).toBeVisible();
  const geometry80 = await expectStableReviewGeometry(page);
  console.info("zoom-review geometry 80%", geometry80);
  await page.screenshot({ path: `${SHOTS}/80-percent-bubble.png` });
  await reset.click();
  await zoomIn.click();
  await zoomIn.click();
  await zoomIn.click();
  await expect(reset).toHaveText("130%");
  const geometry130 = await expectStableReviewGeometry(page);
  console.info("zoom-review geometry 130%", geometry130);
  await page.screenshot({ path: `${SHOTS}/130-percent-bubble.png` });
  await page.keyboard.press("Meta+Equal");
  await expect(reset).toHaveText("140%");
  await page.keyboard.press("Meta+Minus");
  await expect(reset).toHaveText("130%");
  await page.keyboard.press("Meta+0");
  await expect(reset).toHaveText("100%");
  await reset.click();
  await page.keyboard.press("Meta+Minus");
  await page.reload();
  await expect(page.getByTestId("page-zoom-reset")).toHaveText("90%");
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  const tree = page.getByRole("tree", { name: /Archivos Markdown/ });
  await expect(tree).toBeVisible();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.locator(".prose")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page
        .locator(".document-sheet .prose")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    )
    .toBe("0s");
  await page.getByTestId("mode-toggle-markdown").click();
  await expect
    .poll(() =>
      page.locator(".cm-editor").evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    )
    .toBeCloseTo(12.15, 1);
  await page.getByTestId("mode-toggle-render").click();
  await expect(page.locator(".document-sheet .prose")).toBeVisible();
  await page.getByTestId("page-zoom-reset").click();
  await expect(page.getByTestId("page-zoom-reset")).toHaveText("100%");
  for (let i = 0; i < 5; i += 1) await page.getByTestId("page-zoom-out").click();
  await expect(page.getByTestId("page-zoom-reset")).toHaveText("50%");
  await expect(page.getByTestId("page-zoom-out")).toBeDisabled();
  for (let i = 0; i < 15; i += 1) await page.getByTestId("page-zoom-in").click();
  await expect(page.getByTestId("page-zoom-reset")).toHaveText("200%");
  await expect(page.getByTestId("page-zoom-in")).toBeDisabled();
});

test("revisión larga muestra cuatro puntos y nota; texto breve no inventa hallazgos", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mkdir(SHOTS, { recursive: true });
  await openFixture(page, "guia-estilo.md");
  const paragraphs = page.locator('.prose [data-block-type="paragraph"]');
  const longReview = await startCompleteReview(page, paragraphs.nth(1));
  await expect(longReview).toBeVisible({ timeout: 30_000 });
  await expect(longReview.locator(".agent-review-section ul").first().locator("li")).toHaveCount(4);
  await expect(longReview.getByTestId("review-more-works")).toHaveText("+1 punto más");
  await expect(longReview.getByTestId("review-more-problems")).toHaveText("+1 punto más");
  await expect(longReview.getByTestId("review-more-suggestions")).toHaveText("+1 punto más");
  await expect(page.getByTestId("page-zoom-reset")).toBeVisible();
  await expect(page.locator(".reviewer-picker")).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/four-points-and-more.png` });
  await longReview.getByRole("button", { name: "Cerrar revisión" }).click();
  await openFixture(page, "referencias.md");
  const shortReview = await startCompleteReview(
    page,
    page.locator('.prose [data-block-type="paragraph"]').first(),
  );
  await expect(shortReview).toBeVisible({ timeout: 30_000 });
  await expect(shortReview.getByTestId("review-no-material")).toHaveText(
    "No hay material suficiente para evaluarlo.",
  );
  await expect(shortReview.locator(".agent-review-hint")).toBeVisible();
  await expect(shortReview.getByTestId("review-variant")).toHaveCount(0);
  await expect(page.getByTestId("page-zoom-reset")).toBeVisible();
  await expect(page.locator(".reviewer-picker")).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/short-text-no-material.png` });
});

test("zoom recalcula toolbar de formato, gutter y + flotante", async ({ page }) => {
  await openFixture(page, "guia-estilo.md");
  const out = page.getByTestId("page-zoom-out");
  const into = page.getByTestId("page-zoom-in");
  const reset = page.getByTestId("page-zoom-reset");
  const paragraph = page.locator('.prose [data-block-type="paragraph"]').nth(1);
  await paragraph.click();
  const toolbar = page.getByTestId("format-toolbar");
  await expect(toolbar).toBeVisible();
  await paragraph.evaluate((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
    if (!text) throw new Error("No hay texto editable para seleccionar");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(6, text.textContent?.length ?? 0));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  for (const [zoom, button, count] of [
    ["80%", out, 2],
    ["130%", into, 5],
  ] as const) {
    for (let index = 0; index < count; index += 1) await button.click();
    await expect(reset).toHaveText(zoom);
    await expect(toolbar).toBeVisible();
    const toolbarBox = await toolbar.boundingBox();
    expect(toolbarBox).not.toBeNull();
    if (!toolbarBox) throw new Error("No se pudo medir el toolbar abierto");
    expect(toolbarBox.y).toBeGreaterThanOrEqual(0);
    expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(900);
    const overlappingBlocks = await page.evaluate(() => {
      const toolbarElement = document.querySelector<HTMLElement>("[data-testid=format-toolbar]");
      if (!toolbarElement) throw new Error("No se encontró el toolbar de formato");
      const toolbarRect = toolbarElement.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>(".prose .block")]
        .filter((block) => {
          const rect = block.getBoundingClientRect();
          return (
            toolbarRect.left < rect.right &&
            toolbarRect.right > rect.left &&
            toolbarRect.top < rect.bottom &&
            toolbarRect.bottom > rect.top
          );
        })
        .map((block) => block.dataset.blockKey);
    });
    expect(overlappingBlocks).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/format-toolbar-${zoom}.png` });
  }

  await page.getByRole("button", { name: "Ver" }).click();
  let lineNumbers = page.getByRole("menuitemcheckbox", { name: "Números de línea en render" });
  if ((await lineNumbers.getAttribute("aria-checked")) === "true") {
    await lineNumbers.click();
    await page.getByRole("button", { name: "Ver" }).click();
    lineNumbers = page.getByRole("menuitemcheckbox", { name: "Números de línea en render" });
  }
  await expect(lineNumbers).toHaveAttribute("aria-checked", "false");
  await page.getByRole("menuitemcheckbox", { name: "Números de línea en render" }).click();
  await page.getByRole("button", { name: "Ver" }).click();
  lineNumbers = page.getByRole("menuitemcheckbox", { name: "Números de línea en render" });
  await expect(lineNumbers).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  const gutter = page.getByTestId("render-gutter");
  await expect(gutter.locator(".render-gutter-number").first()).toBeVisible();
  await expect
    .poll(async () => {
      const number = gutter.locator(".render-gutter-number").first();
      const line = await number.boundingBox();
      const markLine = await number.getAttribute("data-line");
      const block = page.locator(`[data-start-line="${markLine}"]`).first();
      const blockBox = await block.boundingBox();
      if (!line || !blockBox) return Number.POSITIVE_INFINITY;
      return Math.abs(line.y - blockBox.y);
    })
    .toBeLessThan(30);

  await paragraph.hover();
  const plus = paragraph.getByTestId("floating-insert-trigger");
  await expect(plus).toBeVisible();
  await plus.click();
  await expect(page.getByRole("menuitem", { name: "Párrafo" })).toBeVisible();
  await page.keyboard.press("Escape");
});
