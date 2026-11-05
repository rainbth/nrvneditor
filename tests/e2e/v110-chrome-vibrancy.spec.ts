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
  await expect(page.locator(".document-sheet")).toBeVisible();
}

test.describe("v110 chrome translucency surfaces", () => {
  test.setTimeout(240_000);
  for (const theme of ["light", "dark"] as const) {
    test(`${theme} chrome is translucent while document remains opaque`, async ({ page }) => {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.emulateMedia({ colorScheme: theme });
      await openDocument(page);
      const result = await page.evaluate((colorScheme) => {
        const root = document.documentElement;
        root.dataset.theme = colorScheme;
        const chrome = getComputedStyle(root).getPropertyValue("--color-chrome").trim();
        const sheet = document.querySelector<HTMLElement>(".document-sheet");
        const area = document.querySelector<HTMLElement>(".document-area");
        const chromeElements = [".titlebar", ".rail", ".tree-panel", ".agent-panel"];
        const backgrounds = chromeElements.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          return element ? getComputedStyle(element).backgroundColor : null;
        });
        const alpha = (color: string | undefined) => {
          if (!color) return null;
          // `rgb(r, g, b)` es opaco; solo `rgba(r, g, b, a)` o el slash de
          // color-mix llevan alfa como último componente.
          const parts = color
            .match(/^rgba?\(([^)]*)\)$/)?.[1]
            .split(/[,/\s]+/)
            .filter(Boolean);
          if (!parts) return null;
          return parts.length >= 4 ? Number(parts[3]) : 1;
        };
        const sheetBackground = sheet ? getComputedStyle(sheet).backgroundColor : undefined;
        const areaBackground = area ? getComputedStyle(area).backgroundColor : undefined;
        const rgba = chrome.match(/[\d.]+/g)?.map(Number) ?? [];
        const linear = (value: number) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        };
        const luminance =
          rgba.length >= 3
            ? 0.2126 * linear(rgba[0] ?? 0) +
              0.7152 * linear(rgba[1] ?? 0) +
              0.0722 * linear(rgba[2] ?? 0)
            : null;
        return {
          chrome,
          backgrounds,
          sheetAlpha: alpha(sheetBackground),
          areaAlpha: alpha(areaBackground),
          luminance,
        };
      }, theme);
      expect(result.chrome).toMatch(/rgba|color-mix/i);
      expect(result.backgrounds).toHaveLength(4);
      expect(
        result.backgrounds.every(
          (background) =>
            background !== null && Number(background.match(/,\s*([\d.]+)\)$/)?.[1] ?? 1) < 1,
        ),
      ).toBe(true);
      expect(result.sheetAlpha).toBe(1);
      expect(result.areaAlpha).toBe(1);
      if (theme === "dark") expect(result.chrome).toMatch(/25,\s*27,\s*29/);
      if (theme === "dark") expect(result.luminance).toBeLessThan(0.5);
      if (theme === "light") expect(result.luminance).toBeGreaterThan(0.5);
      await page.screenshot({ path: path.join(SHOTS, `chrome-${theme}.png`) });
    });
  }
});
