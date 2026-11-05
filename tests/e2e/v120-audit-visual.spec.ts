import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1400, height: 900 } });

test("v120 visual audit: selection, bubble, and agent", async ({ page }) => {
  const dir = path.join("artifacts", "screenshots", "audit");
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

  const paragraphs = page.locator('.prose [data-block-type="paragraph"]');
  await paragraphs.nth(0).click();
  await paragraphs.nth(1).click({ modifiers: ["Shift"] });

  const checkSelection = async () => {
    const result = await paragraphs.nth(1).evaluate((element) => {
      const root = getComputedStyle(document.documentElement);
      const selectedStyle = getComputedStyle(element);
      const band = getComputedStyle(element, "::after").backgroundColor;
      const parse = (value: string) => value.match(/[\d.]+/g)?.map(Number) ?? [];
      const selection = parse(root.getPropertyValue("--color-selection-bg"));
      const inkProbe = document.createElement("span");
      inkProbe.style.color = "var(--color-ink)";
      document.body.append(inkProbe);
      const ink = parse(getComputedStyle(inkProbe).color);
      inkProbe.remove();
      const sheetProbe = document.createElement("span");
      sheetProbe.style.backgroundColor = "var(--color-sheet)";
      document.body.append(sheetProbe);
      const sheet = parse(getComputedStyle(sheetProbe).backgroundColor);
      sheetProbe.remove();
      const alpha = selection[3] ?? 1;
      const composed = sheet
        .slice(0, 3)
        .map((channel, index) => channel * (1 - alpha) + selection[index] * alpha);
      const luminance = (rgb: number[]) =>
        rgb.reduce((sum, channel, index) => {
          const value = channel / 255;
          const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          return sum + linear * [0.2126, 0.7152, 0.0722][index];
        }, 0);
      const inkLuminance = luminance(ink.slice(0, 3));
      const sheetLuminance = luminance(composed);
      return {
        alpha,
        contrast:
          (Math.max(inkLuminance, sheetLuminance) + 0.05) /
          (Math.min(inkLuminance, sheetLuminance) + 0.05),
        band,
        radius: selectedStyle.borderStartStartRadius,
        endRadius: selectedStyle.borderEndEndRadius,
        bandRadius: getComputedStyle(element, "::after").borderRadius,
      };
    });
    const firstEndRadius = await paragraphs
      .nth(0)
      .evaluate((element) => getComputedStyle(element).borderStartEndRadius);
    expect(result.alpha).toBeGreaterThanOrEqual(0.06);
    expect(result.alpha).toBeLessThanOrEqual(0.1);
    expect(result.contrast).toBeGreaterThanOrEqual(4.5);
    expect(result.band).not.toBe("rgba(0, 0, 0, 0)");
    expect(result.radius).toBe("0px");
    expect(result.endRadius).toBe("5px");
    expect(firstEndRadius).toBe("5px");
    expect(result.bandRadius).toContain("5px");
  };

  await checkSelection();
  await page.screenshot({ path: path.join(dir, "light-selection-after.png") });

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await paragraphs.nth(3).click();
  const bubble = page.getByTestId("block-bubble");
  await expect(bubble).toBeVisible();
  const checkBubbleGap = async () => {
    await page.waitForTimeout(300);
    const gap = await bubble.evaluate((element) => {
      const active =
        document.querySelector<HTMLElement>(
          ".prose .block[data-selected='true'][data-bubble-reserve]",
        ) ?? document.querySelector<HTMLElement>(".prose .block[data-bubble-reserve]");
      if (!active) throw new Error("No active selected block");
      const bubbleRect = element.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      return {
        gap: bubbleRect.bottom <= activeRect.top ? activeRect.top - bubbleRect.bottom : -1,
        shadow: getComputedStyle(element).boxShadow,
      };
    });
    // 16px nominales menos el redondeo subpíxel del navegador
    expect(gap.gap).toBeGreaterThanOrEqual(15.4);
    expect(gap.shadow).not.toBe("none");
    const shadowExtent = [
      ...gap.shadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/g),
    ].map((match) => Number(match[2]) + Number(match[3]) + Math.max(0, Number(match[4] ?? 0)));
    expect(Math.max(...shadowExtent)).toBeLessThan(gap.gap);
  };
  await checkBubbleGap();
  await page.screenshot({ path: path.join(dir, "light-bubble-after.png") });

  const audience = page.getByTestId("audience-chip");
  const audienceStyle = await audience.evaluate((element) => ({
    borderTopWidth: getComputedStyle(element).borderTopWidth,
    boxShadow: getComputedStyle(element).boxShadow,
  }));
  expect(audienceStyle.borderTopWidth).toBe("0px");
  expect(audienceStyle.boxShadow).toBe("none");
  await page.screenshot({ path: path.join(dir, "light-agent-after.png") });

  const checkEditing = async (screenshot: string) => {
    await page.keyboard.press("Escape");
    const paragraph = paragraphs.nth(0);
    await paragraph.dblclick();
    await expect(paragraph).toHaveAttribute("contenteditable", "plaintext-only");
    await expect(paragraph).toHaveAttribute("data-block-editable", "true");
    const editingStyle = await paragraph.evaluate((element) => {
      const style = getComputedStyle(element);
      const probe = document.createElement("span");
      probe.style.color = "var(--color-accent)";
      probe.style.backgroundColor = "var(--color-sheet)";
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      const sheet = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        cursor: style.cursor,
        background: style.backgroundColor,
        caret: style.caretColor,
        accent,
        sheet,
      };
    });
    expect(editingStyle.cursor).toBe("text");
    // Sin fondo opaco de "campo deshabilitado": transparente bajo la banda o el tono de hoja.
    expect(["rgba(0, 0, 0, 0)", editingStyle.sheet]).toContain(editingStyle.background);
    // Afordance de edición: caret accent y banda de selección activa.
    expect(editingStyle.caret).toBe(editingStyle.accent);
    await page.screenshot({ path: path.join(dir, screenshot) });
  };

  await checkEditing("light-editing-after.png");
  await paragraphs.nth(0).press("Escape");

  await page.getByRole("button", { name: "Escribir una instrucción" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.matches('[data-testid="agent-composer"]') ?? false,
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  await paragraphs.nth(0).click({ modifiers: ["Shift"] });
  await paragraphs.nth(1).click({ modifiers: ["Shift"] });
  await checkSelection();
  await page.screenshot({ path: path.join(dir, "dark-selection-after.png") });
  await page.keyboard.press("Escape");
  await paragraphs.nth(3).click();
  await expect(bubble).toBeVisible();
  await checkBubbleGap();
  await page.screenshot({ path: path.join(dir, "dark-bubble-after.png") });
  await checkEditing("dark-editing-after.png");
  await expect(audience).toHaveCSS("border-top-width", "0px");
  await expect(audience).toHaveCSS("box-shadow", "none");
  await page.screenshot({ path: path.join(dir, "dark-agent-after.png") });
});
