import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1400, height: 900 } });

test("v090 visual system across light and dark themes", async ({ page }) => {
  const dir = path.join("artifacts", "screenshots", "v090");
  fs.mkdirSync(dir, { recursive: true });
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.locator(".prose")).toBeVisible();
  const capture = (name: string) => page.screenshot({ path: path.join(dir, name) });

  await page.locator('[data-testid="titlebar"]').click();
  await page.keyboard.press("Tab");
  const focusButton = page.locator(".rail .icon-button").first();
  await focusButton.focus();
  const focus = await focusButton.evaluate((element) => {
    const style = getComputedStyle(element);
    const probe = document.createElement("span");
    probe.style.color = "var(--color-accent)";
    document.body.append(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return {
      width: style.outlineWidth,
      color: style.outlineColor,
      accent,
    };
  });
  expect(focus.width).toBe("2px");
  expect(focus.color).toBe(focus.accent);
  await focusButton.screenshot({ path: path.join(dir, "light-focus-button.png") });
  await capture("light-focus.png");

  const evaluateTheme = () =>
    page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const resolve = (token: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      const rgb = (value: string) =>
        value
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number) ?? [];
      const luminance = (value: string) => {
        const channels = rgb(value).map((c) => {
          const v = c / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const ratio = (a: string, b: string) => {
        const x = luminance(a);
        const y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const selected = document.querySelector('[role="treeitem"][data-selected]');
      const colors = {
        selection: selected ? getComputedStyle(selected).backgroundColor : "",
        expectedSelection: resolve("--color-selection-bg"),
        line: resolve("--color-line-strong"),
        surface: resolve("--color-surface"),
        accent: resolve("--color-accent"),
        bg: resolve("--color-bg"),
        overlay: root.getPropertyValue("--color-overlay").trim(),
        lineRatio: 0,
        bgRatio: 0,
        accentRatio: 0,
        overflow: document.documentElement.scrollWidth <= innerWidth,
      };
      return {
        ...colors,
        lineRatio: ratio(colors.line, colors.surface),
        bgRatio: ratio(colors.line, colors.bg),
        accentRatio: ratio(colors.accent, colors.bg),
      };
    });

  let theme = await evaluateTheme();
  expect(theme.selection).toBe(theme.expectedSelection);
  expect(theme.lineRatio).toBeGreaterThanOrEqual(3);
  expect(theme.bgRatio).toBeGreaterThanOrEqual(3);
  expect(theme.accentRatio).toBeGreaterThanOrEqual(3);
  expect(theme.overlay).not.toBe("");
  expect(theme.overflow).toBe(true);
  await capture("light.png");

  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  theme = await evaluateTheme();
  expect(theme.selection).toBe(theme.expectedSelection);
  expect(theme.lineRatio).toBeGreaterThanOrEqual(3);
  expect(theme.bgRatio).toBeGreaterThanOrEqual(3);
  expect(theme.accentRatio).toBeGreaterThanOrEqual(3);
  expect(theme.overlay).not.toBe("");
  expect(theme.overflow).toBe(true);
  await capture("dark.png");

  await page.locator('[data-block-type="paragraph"]').first().click();
  await page.locator('[data-block-editable="true"]').first().click();
  const selectionBg = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-selection-bg)";
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  await expect
    .poll(async () =>
      page
        .locator('[data-block-editable="true"]')
        .first()
        .evaluate((el) => getComputedStyle(el, "::after").backgroundColor),
    )
    .toBe(selectionBg);
  const editing = await page
    .locator('[data-block-editable="true"]')
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const probe = document.createElement("span");
      probe.style.color = "var(--color-accent)";
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.style.color = "var(--color-selection-bg)";
      const selection = getComputedStyle(probe).color;
      probe.style.color = "var(--color-selection-bar)";
      const selectionBar = getComputedStyle(probe).color;
      probe.style.color = "var(--color-accent)";
      const accentRgb = getComputedStyle(probe).color;
      probe.remove();
      return {
        background: style.backgroundColor,
        band: getComputedStyle(element, "::after").backgroundColor,
        bandShadow: getComputedStyle(element, "::after").boxShadow,
        caret: style.caretColor,
        selection,
        selectionBar,
        accent,
        accentRgb,
        boxShadow: style.boxShadow,
        editable: (element as HTMLElement).isContentEditable,
      };
    });
  // El tinte vive en ::after para no duplicar alpha.
  expect(editing.background).toBe("rgba(0, 0, 0, 0)");
  expect(editing.band).toBe(editing.selection);
  expect(editing.caret).toBe(editing.accent);
  expect(editing.editable).toBe(true);
  // La barra de selección vive en ::after.
  expect(editing.bandShadow).toContain(editing.selectionBar);
  await capture("dark-editing.png");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cambiar a tema claro" }).click();
});
