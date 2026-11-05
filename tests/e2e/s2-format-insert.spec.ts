import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "s2");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1400, height: 900 } });

async function openWorkspaceAndDocument(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await expect(page.getByRole("tree", { name: /Archivos Markdown/ })).toBeVisible();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.getByTestId("doc-title")).toContainText("guia-estilo.md");
  await expect(page.locator(".prose")).toBeVisible();
}

async function setRange(
  editable: import("@playwright/test").Locator,
  start: number,
  end: number,
): Promise<string> {
  return editable.evaluate(
    (element, bounds) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode();
      if (!(node instanceof Text)) throw new Error("El bloque editable no tiene texto");
      const range = document.createRange();
      range.setStart(node, bounds.start);
      range.setEnd(node, bounds.end);
      const selectedText = range.toString();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return selectedText;
    },
    { start, end },
  );
}

test("S2: formato por elemento, inserción flotante y accesibilidad", async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const screenshot = (name: string) =>
    page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: false });

  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await openWorkspaceAndDocument(page);
  const prose = page.locator(".prose");
  const toolbar = page.getByTestId("format-toolbar");
  const scope = page.getByTestId("format-scope");
  const paragraphs = prose.locator('[data-block-type="paragraph"]');
  const first = paragraphs.first();

  // F1: scope based on caret, word and explicit multiword selection.
  await first.click();
  let editable = prose.locator('[data-block-editable="true"]').first();
  await expect(editable).toBeFocused();
  await editable.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await expect(scope).toHaveText("Línea");
  await screenshot("toolbar-linea.png");

  let text = (await editable.textContent()) ?? "";
  let wordMatch = /[\p{L}\p{N}]+/u.exec(text);
  if (!wordMatch) throw new Error("El primer párrafo no tiene una palabra seleccionable");
  const word = wordMatch[0];
  await setRange(editable, wordMatch.index + 1, wordMatch.index + 1);
  await expect(scope).toHaveText("Palabra");
  await screenshot("toolbar-palabra.png");
  await toolbar.getByRole("button", { name: "Negrita" }).click();
  await page.keyboard.press("Meta+Enter");
  await expect(first.locator("strong").filter({ hasText: word })).toHaveCount(1);
  await expect(first).not.toHaveText(/^\s*$/);

  // Inline toolbar state follows only the active caret word, not other markup in the block.
  await first.click();
  editable = prose.locator('[data-block-editable="true"]').first();
  text = (await editable.textContent()) ?? "";
  const plainWord = [...text.matchAll(/[\p{L}\p{N}]+/gu)].find((match) => match[0] !== word);
  if (!plainWord) throw new Error("No se encontró otra palabra para comprobar aria-pressed");
  await setRange(editable, plainWord.index + 1, plainWord.index + 1);
  await expect(toolbar.getByRole("button", { name: "Negrita" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // A selected range of several words is formatted without affecting the rest.
  text = (await editable.textContent()) ?? "";
  const phrase = [...text.matchAll(/[\p{L}\p{N}]+\s+[\p{L}\p{N}]+/gu)].find(
    (match) =>
      !match[0].includes("*") &&
      !text.slice(Math.max(0, (match.index ?? 0) - 2), match.index).includes("**"),
  );
  if (!phrase) throw new Error("No se encontró un rango de dos palabras");
  const selectedPhrase = await setRange(editable, phrase.index, phrase.index + phrase[0].length);
  await expect(scope).toHaveText("Selección");
  await screenshot("toolbar-seleccion.png");
  await toolbar.getByRole("button", { name: "Cursiva" }).click();
  await page.keyboard.press("Meta+Enter");
  await expect(first.locator("em")).toHaveText(selectedPhrase);
  await expect(first.locator("em")).toHaveCount(1);

  // Idempotence: toggling the same word twice leaves no strong markup or ****.
  await first.click();
  editable = prose.locator('[data-block-editable="true"]').first();
  text = (await editable.textContent()) ?? "";
  wordMatch = [...text.matchAll(/[\p{L}\p{N}]+/gu)].find((match) => match[0] === "reúne") ?? null;
  if (!wordMatch) throw new Error("No se encontró una palabra para el doble toggle");
  await setRange(editable, wordMatch.index + 1, wordMatch.index + 1);
  await toolbar.getByRole("button", { name: "Negrita" }).click();
  await page.keyboard.press("Meta+Enter");
  await first.click();
  editable = prose.locator('[data-block-editable="true"]').first();
  text = (await editable.textContent()) ?? "";
  wordMatch = [...text.matchAll(/[\p{L}\p{N}]+/gu)].find((match) => match[0] === "reúne") ?? null;
  if (!wordMatch) throw new Error("No se encontró la palabra para revertir");
  await setRange(editable, wordMatch.index + 1, wordMatch.index + 1);
  await toolbar.getByRole("button", { name: "Negrita" }).click();
  await page.keyboard.press("Meta+Enter");
  await expect(first.locator("strong").filter({ hasText: "reúne" })).toHaveCount(0);
  expect(await first.textContent()).not.toContain("****");

  // Formatting a caret on the second line affects that line only.
  await first.click();
  editable = prose.locator('[data-block-editable="true"]').first();
  await editable.evaluate((element) => {
    element.textContent = "primera  \nsegunda";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  });
  await page.keyboard.press("Meta+Enter");
  const twoLine = paragraphs.first();
  await twoLine.click();
  editable = prose.locator('[data-block-editable="true"]').first();
  await editable.evaluate((element) => {
    const node = element.firstChild;
    if (!node) throw new Error("No hay texto en el párrafo editado");
    const range = document.createRange();
    range.setStart(node, node.textContent?.length ?? 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await expect(scope).toHaveText("Línea");
  await toolbar.getByRole("button", { name: "Negrita" }).click();
  await page.keyboard.press("Meta+Enter");
  await expect(twoLine.locator("strong")).toHaveText("segunda");
  await expect(twoLine.locator("strong")).toHaveCount(1);
  expect(await twoLine.textContent()).toContain("primera");

  // F2: selected block range formats only its cursor/focus block.
  const three = paragraphs.nth(2);
  const thirdText = (await three.textContent()) ?? "";
  const thirdFirstLine = thirdText.trim().split("\n")[0];
  await first.click();
  await three.click({ modifiers: ["Shift"] });
  const h2 = toolbar.getByRole("button", { name: "H2" });
  await expect(h2).toHaveAttribute("title", /solo el bloque del cursor/);
  await h2.click();
  await expect(prose.locator("h2").filter({ hasText: thirdFirstLine })).toBeVisible();
  await expect(first.locator("p")).toHaveCount(1);
  await expect(prose.locator("p").filter({ hasText: thirdFirstLine })).toHaveCount(0);
  await page.keyboard.press("Meta+z");
  await expect(prose.locator("p").filter({ hasText: thirdText.trim() })).toHaveCount(1);

  // F4: geometry, menu choices, insertion and hidden state after pointer leaves.
  const insertBlock = paragraphs.first();
  await insertBlock.hover();
  const insertTrigger = insertBlock.getByTestId("floating-insert-trigger");
  await expect(insertTrigger).toBeVisible();
  const bounds = await insertTrigger.boundingBox();
  const blockBounds = await insertBlock.boundingBox();
  if (!bounds || !blockBounds) throw new Error("No se pudo medir el botón y el bloque flotante");
  const contentBottom = await insertBlock.evaluate((element) => {
    const style = getComputedStyle(element);
    return element.getBoundingClientRect().bottom - Number.parseFloat(style.paddingBottom);
  });
  expect(bounds.y).toBeGreaterThanOrEqual(contentBottom - 2);
  const line = insertBlock.locator(".floating-insert-line");
  await expect(line).toHaveCSS("border-left-style", "dashed");
  await expect(line).toHaveCSS("height", "4px");
  await screenshot("floating-insert.png");
  await insertTrigger.click();
  for (const label of ["Párrafo", "Sección", "Bloque de agente"])
    await expect(page.getByRole("menuitem", { name: label })).toBeVisible();
  await screenshot("floating-menu.png");
  await page.getByRole("menuitem", { name: "Párrafo" }).click();
  const pending = prose.locator('[data-pending="true"]').last();
  await expect(pending).toBeVisible();
  const pendingEditable = page
    .locator('.prose [data-pending="true"][data-block-editable="true"]')
    .last();
  await expect(pendingEditable).toBeFocused();
  await page.mouse.move(1350, 850);
  await expect(insertBlock.locator(".floating-insert")).toHaveCSS("opacity", "0");

  // Keyboard access: el bloque recién seleccionado es el tab-stop del grupo y expone su `+`.
  const keyboardBlock = paragraphs.nth(1);
  await keyboardBlock.click();
  await page.keyboard.press("Escape");
  await keyboardBlock.focus();
  await page.keyboard.press("Tab");
  const keyboardTrigger = keyboardBlock.getByTestId("floating-insert-trigger");
  await expect(keyboardTrigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Párrafo" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Párrafo" })).toHaveCount(0);

  // F5: floating insert is absent in Markdown mode.
  await page.keyboard.press("Meta+e");
  await expect(page.locator('.document-sheet[data-mode="markdown"]')).toBeVisible();
  await expect(page.locator("[data-floating-insert]")).toHaveCount(0);
  await page.keyboard.press("Meta+e");
  await expect(page.locator('[data-testid="document-view"][data-mode="render"]')).toBeVisible();

  // Dark theme contrast and capture; restore light theme afterwards.
  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await paragraphs.first().hover();
  await screenshot("floating-dark.png");
  const ratios = await page.evaluate(() => {
    const parse = (value: string) => {
      const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
      if (hex) {
        const full = hex.length === 3 ? [...hex].map((part) => part + part).join("") : hex;
        return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
      }
      return (
        value
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number) ?? []
      );
    };
    const luminance = (value: string) => {
      const [r, g, b] = parse(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const first = luminance(a);
      const second = luminance(b);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const root = getComputedStyle(document.documentElement);
    const el = document.querySelector<HTMLElement>(".floating-insert button");
    if (!el) throw new Error("No se encontró el botón de inserción flotante");
    const button = getComputedStyle(el);
    return {
      line: ratio(
        root.getPropertyValue("--color-line-strong").trim(),
        root.getPropertyValue("--color-sheet").trim(),
      ),
      button: ratio(button.color, button.backgroundColor),
    };
  });
  expect(ratios.line).toBeGreaterThanOrEqual(3);
  expect(ratios.button).toBeGreaterThanOrEqual(3);
  await page.getByRole("button", { name: "Cambiar a tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(pageErrors).toEqual([]);
});
