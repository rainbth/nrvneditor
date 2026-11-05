import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS = path.join("artifacts", "screenshots", "v110");

async function openDocument(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  const tree = page.getByRole("tree", { name: /Archivos Markdown/ });
  await expect(tree).toBeVisible();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.locator(".prose")).toBeVisible();
}

async function assertNoUnselectedPaint(page: Page) {
  const painted = await page.locator(".prose .block:not([data-selected='true'])").evaluateAll(
    (blocks) =>
      blocks.filter((block) => {
        const before = getComputedStyle(block, "::before");
        const after = getComputedStyle(block, "::after");
        const paints = (style: CSSStyleDeclaration) =>
          style.content !== "none" &&
          style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          style.backgroundColor !== "transparent";
        return (
          paints(before) ||
          paints(after) ||
          block.hasAttribute("data-bubble-reserve") ||
          block.hasAttribute("data-bubble-reserve-value") ||
          (block as HTMLElement).style.getPropertyValue("--bubble-reserve-active") !== "" ||
          (block as HTMLElement).style.getPropertyValue("--bubble-gap-above") !== ""
        );
      }).length,
  );
  expect(painted).toBe(0);
}

async function expectBridgesMatchRealGap(page: Page) {
  const differences = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll<HTMLElement>(".prose .block")];
    return blocks.flatMap((block) => {
      const previous = block.previousElementSibling;
      if (
        block.dataset.selected !== "true" ||
        !(previous instanceof HTMLElement) ||
        previous.dataset.selected !== "true"
      )
        return [];
      const rect = block.getBoundingClientRect();
      const height = Number.parseFloat(getComputedStyle(block, "::before").height);
      const bridgeTop = rect.top - height;
      const expectedTop = previous.getBoundingClientRect().bottom - 22;
      return [Math.abs(bridgeTop - expectedTop)];
    });
  });
  expect(differences.length).toBeGreaterThan(0);
  for (const difference of differences) expect(difference).toBeLessThanOrEqual(1.5);
}

test.describe
  .serial("v110 selection bar cleanup", () => {
    test.setTimeout(240_000);

    test("transferring selection between non-adjacent paragraphs leaves no ghost band", async ({
      page,
    }) => {
      fs.mkdirSync(SHOTS, { recursive: true });
      await openDocument(page);
      const paragraphs = page.locator('.prose [data-block-type="paragraph"]');
      const first = paragraphs.nth(0);
      const target = paragraphs.nth(2);
      await first.click({ modifiers: ["Shift"] });
      await page.screenshot({ path: path.join(SHOTS, "selection-before.png") });
      await target.click({ modifiers: ["Shift"] });
      await expect(target).toHaveAttribute("data-selected", "true");
      await page.waitForTimeout(220);
      await assertNoUnselectedPaint(page);
      await expectBridgesMatchRealGap(page);
      await page.screenshot({ path: path.join(SHOTS, "selection-after.png") });
      const geometry = await page.evaluate(() => {
        const blocks = [...document.querySelectorAll<HTMLElement>(".prose .block")];
        const selected = blocks.filter((block) => block.dataset.selected === "true");
        const gaps = selected.slice(1).map((block, index) => {
          const prev = selected[index];
          return prev ? block.getBoundingClientRect().top - prev.getBoundingClientRect().bottom : 0;
        });
        const orphanBars = blocks
          .filter((block) => block.dataset.selected !== "true")
          .some((block) => {
            const before = getComputedStyle(block, "::before");
            const after = getComputedStyle(block, "::after");
            return before.boxShadow.includes("inset 2px") || after.boxShadow.includes("inset 2px");
          });
        return { selectedCount: selected.length, gaps, orphanBars };
      });
      expect(geometry.selectedCount).toBeGreaterThanOrEqual(2);
      expect(geometry.orphanBars).toBe(false);
      expect(geometry.gaps.every((gap) => gap >= 0)).toBe(true);
    });

    test("deselect, multiselect and scroll transition clear all non-selected reservations", async ({
      page,
    }) => {
      fs.mkdirSync(SHOTS, { recursive: true });
      await openDocument(page);
      const paragraphs = page.locator('.prose [data-block-type="paragraph"]');
      const first = paragraphs.nth(0);
      await first.click({ modifiers: ["Shift"] });
      await page.screenshot({ path: path.join(SHOTS, "selection-before.png") });
      await page.locator(".titlebar").click({ position: { x: 600, y: 20 } });
      await expect(first).not.toHaveAttribute("data-selected", "true");
      await assertNoUnselectedPaint(page);
      await page.screenshot({ path: path.join(SHOTS, "deselect.png") });
      const other = paragraphs.nth(2);
      await first.click({ modifiers: ["Shift"] });
      await other.click({ modifiers: ["Shift"] });
      await expect(other).toHaveAttribute("data-selected", "true");
      // Scroll immediately while the selected blocks' margin transition is active.
      await page.locator("[data-document-scroll]").evaluate((el) => {
        el.scrollTop += 40;
      });
      await page.waitForTimeout(220);
      await assertNoUnselectedPaint(page);
      await expectBridgesMatchRealGap(page);
      await page.screenshot({ path: path.join(SHOTS, "multiselect.png") });
    });
  });
