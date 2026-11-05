import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "audit2");
test.use({ viewport: { width: 1400, height: 900 } });

async function openDocument(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await expect(page.getByRole("tree", { name: /Archivos Markdown/ })).toBeVisible();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.getByTestId("doc-title")).toContainText("guia-estilo.md");
  await expect(page.locator(".prose")).toBeVisible();
}

test("Audit2: focus access, muted contrast and insert target", async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await openDocument(page);

  const inactiveTrigger = page
    .locator('.prose .block:not([tabindex="0"]) [data-testid="floating-insert-trigger"]')
    .first();
  await expect(inactiveTrigger).toHaveAttribute("tabindex", "-1");
  const activeTrigger = page
    .locator('.prose .block[tabindex="0"] [data-testid="floating-insert-trigger"]')
    .first();
  await expect(activeTrigger).toHaveAttribute("tabindex", "0");
  const block = page.locator('.prose [data-block-type="paragraph"]').first();
  await block.click();
  await page.keyboard.press("Escape");
  await block.evaluate((element) => (element as HTMLElement).focus());
  const trigger = block.getByTestId("floating-insert-trigger");
  await expect(trigger).toHaveAttribute("tabindex", "0");
  await page.screenshot({ path: path.join(SHOTS_DIR, "tab-focus.png") });

  const ratios = await page.evaluate(() => {
    const parse = (value: string) => value.trim().match(/^#([\da-f]{6})$/i)?.[1];
    const lum = (value: string) => {
      const hex = parse(value);
      if (!hex) throw new Error(`Invalid CSS token: ${value}`);
      const [r, g, b] = hex.match(/../g)!.map((c) => Number.parseInt(c, 16) / 255);
      const channel = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const style = getComputedStyle(document.documentElement);
    const muted = style.getPropertyValue("--color-muted");
    const ratio = (background: string) => {
      const a = lum(muted);
      const b = lum(style.getPropertyValue(background));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    return [ratio("--color-bg"), ratio("--color-sunken")];
  });
  expect(ratios[0]).toBeGreaterThanOrEqual(4.5);
  expect(ratios[1]).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: path.join(SHOTS_DIR, "muted-contrast.png") });

  const hit = await trigger.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const targets = document.elementsFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2 - 13.5,
    );
    return targets.includes(element) || targets.some((target) => element.contains(target));
  });
  expect(hit).toBe(true);
});
