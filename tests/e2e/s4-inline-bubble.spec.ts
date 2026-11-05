import fs from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "s4");
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

async function selectText(editable: Locator, text: string): Promise<void> {
  await editable.evaluate((element, selectionText) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let current = walker.nextNode(); current; current = walker.nextNode()) {
      const index = current.textContent?.indexOf(selectionText) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(current, index);
      range.setEnd(current, index + selectionText.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    throw new Error(`Texto no encontrado: ${selectionText}`);
  }, text);
}

test("S4: edición inline, burbuja, menú contextual, Markdown y accesibilidad", async ({ page }) => {
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
  const paragraphs = prose.locator('[data-block-type="paragraph"]');
  const first = paragraphs.first();
  const bubble = page.getByTestId("block-bubble");

  // I1 — preserve whitespace and Unicode while editing.
  await first.click();
  let editable = prose.locator('[data-block-editable="true"]').first();
  await editable.fill("");
  const spacedText = "hola mundo con espacios áéíóú 123 ¿?";
  await page.keyboard.type(spacedText);
  await expect(editable).toContainText(spacedText);
  await screenshot("s4-editing-spaces.png");
  await page.keyboard.press("Meta+Enter");
  await expect(first).toContainText("hola mundo con espacios");

  // I2 — click position is respected; Escape restores the original block.
  const original = (await first.textContent()) ?? "";
  await first.click();
  editable = prose.locator('[data-block-editable="true"]').first();
  const bounds = await editable.boundingBox();
  if (!bounds) throw new Error("No se pudo medir el párrafo editable");
  await page.mouse.click(bounds.x + bounds.width - 8, bounds.y + bounds.height - 5);
  await page.keyboard.type("X");
  await expect(editable).toContainText("X");
  await expect(editable).toContainText(original);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(first).toHaveText(original);

  // A — block formatting commits the live draft before exiting edit mode.
  await first.click();
  editable = prose.locator('[data-block-editable="true"]').first();
  await editable.fill("texto editado");
  await expect(bubble).toBeVisible();
  await bubble.getByRole("button", { name: "H1" }).click();
  await expect(prose.locator("h1").filter({ hasText: "texto editado" })).toHaveCount(1);
  await expect(prose.locator('[data-block-editable="true"]')).toHaveCount(0);
  await page.keyboard.press("Meta+z");
  await expect(first).toHaveText(original);

  // B + C — composing keys are ignored; Escape cancels the inline draft.
  await first.click();
  editable = prose.locator('[data-block-editable="true"]').first();
  await page.keyboard.type(" borrador");
  const composingKeyWasNotCanceled = await editable.evaluate((element) =>
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }),
    ),
  );
  expect(composingKeyWasNotCanceled).toBe(true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(bubble).toHaveCount(0);
  await expect(first).toHaveText(original);

  // I3 + I6 — floating toolbar position, controls, formatting, keyboard and dismissal.
  await first.click();
  editable = prose.locator('[data-block-editable="true"]').first();
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute("role", "toolbar");
  await expect(bubble).toHaveAttribute("aria-label", /.+/);
  const bubbleBounds = await bubble.boundingBox();
  const blockBounds = await first.boundingBox();
  if (!bubbleBounds || !blockBounds) throw new Error("No se pudo medir la burbuja y el bloque");
  console.log(`[S4] bubble geometry ${bubbleBounds.width}×${bubbleBounds.height}`);
  expect(bubbleBounds.width).toBeGreaterThanOrEqual(300);
  expect(bubbleBounds.height).toBeGreaterThanOrEqual(32);
  expect(bubbleBounds.y + bubbleBounds.height).toBeLessThanOrEqual(blockBounds.y + 2);
  const textBounds = await first.boundingBox();
  if (textBounds)
    expect(bubbleBounds.y + bubbleBounds.height).toBeLessThanOrEqual(textBounds.y + 2);
  for (const label of [
    "Párrafo",
    "H1",
    "H2",
    "H3",
    "Negrita",
    "Cursiva",
    "Enlace",
    "Código inline",
    "Lista con viñetas",
    "Lista numerada",
    "Cita",
    "Bloque de código",
    "Separador",
    "Insertar bloque",
  ]) {
    const button =
      label === "Insertar bloque"
        ? bubble.getByTestId("insert-menu-trigger")
        : bubble.getByRole("button", { name: label });
    await expect(button).toBeVisible();
    const bounds = await button.boundingBox();
    if (!bounds) throw new Error(`No se pudo medir el botón ${label}`);
    expect(bounds.x).toBeGreaterThanOrEqual(bubbleBounds.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(bubbleBounds.x + bubbleBounds.width);
  }
  console.log("[S4] all 14 format controls visible and inside bubble");
  await page.waitForTimeout(250);
  await screenshot("s4-bubble.png");

  await selectText(editable, "hola");
  const bold = bubble.getByRole("button", { name: "Negrita" });
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await bold.click();
  await expect(editable).toBeFocused();
  await page.keyboard.press("Meta+Enter");
  await expect(first.locator("strong")).toContainText("hola");
  await first.click();
  editable = prose.locator('[data-block-editable="true"]').first();
  await selectText(editable, "hola");
  await expect(bubble.getByRole("button", { name: "H1" })).toHaveAttribute(
    "aria-pressed",
    /true|false/,
  );
  await bubble.getByRole("button", { name: "H1" }).focus();
  await expect(bubble.getByRole("button", { name: "H1" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(bubble.locator("button:focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(bubble.locator("button:focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(bubble.locator("button:focus")).toHaveCount(1);
  await editable.focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(bubble).toHaveCount(0);
  await first.click();
  await page.mouse.click(1005, 850);
  await expect(bubble).toHaveCount(0);

  // I4 — renderer context menu, exact labels and whole-document selection.
  await first.click({ button: "right" });
  const contextMenu = page.getByTestId("block-context-menu");
  await expect(contextMenu).toBeVisible();
  const labels = await contextMenu
    .getByRole("menuitem")
    .evaluateAll((els) =>
      els.map((el) => el.querySelector(".menu-text")?.textContent?.trim() ?? "").filter(Boolean),
    );
  await expect(contextMenu.getByTestId("menu-review")).toBeVisible();
  expect(labels).toEqual([
    "Cortar",
    "Copiar",
    "Pegar",
    "Seleccionar todo",
    "Revisar selección",
    "Comentar bloque",
    "Versiones",
    "Pedir al agente…",
    "Extender narrativa",
    "Reducir narrativa",
    "Mover arriba",
    "Mover abajo",
    "Duplicar bloque",
    "Eliminar bloque",
  ]);
  await expect(contextMenu.getByRole("menuitem", { name: "Mover arriba" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Meta+Shift+ArrowUp",
  );
  const ask = contextMenu.getByRole("menuitem", { name: "Pedir al agente…" });
  if (await ask.isDisabled()) await expect(ask).toHaveAttribute("aria-disabled", "true");
  else await expect(ask).not.toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("menu", { includeHidden: false })).toHaveCount(1);
  await page.waitForTimeout(250);
  await screenshot("s4-context-menu.png");
  await contextMenu.getByRole("menuitem", { name: "Seleccionar todo" }).click();
  await expect.poll(() => prose.locator('[data-selected="true"]').count()).toBeGreaterThan(1);
  await first.click({ button: "right" });
  await expect(contextMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(contextMenu).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(0);

  // E — the app-wide custom menu also handles the agent composer.
  const composer = page.getByTestId("agent-composer");
  await composer.click({ button: "right" });
  await expect(contextMenu).toBeVisible();
  const composerLabels = await contextMenu
    .getByRole("menuitem")
    .evaluateAll((els) =>
      els.map((el) => el.querySelector(".menu-text")?.textContent?.trim() ?? "").filter(Boolean),
    );
  await expect(contextMenu.getByTestId("menu-personas")).toHaveCount(0);
  expect(composerLabels).toEqual(["Cortar", "Copiar", "Pegar", "Seleccionar todo"]);
  const composerText = composer;
  await contextMenu.getByRole("menuitem", { name: "Seleccionar todo" }).click();
  await expect
    .poll(() =>
      composerText.evaluate((element) => {
        const textarea = element as HTMLTextAreaElement;
        return textarea.selectionStart === 0 && textarea.selectionEnd === textarea.value.length;
      }),
    )
    .toBe(true);
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(0);
  await composer.click({ button: "right" });
  await expect(contextMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(contextMenu).toHaveCount(0);

  // I5 — overlays are absent in Markdown and return in Render.
  await page.keyboard.press("Meta+e");
  await expect(page.locator('.document-sheet[data-mode="markdown"]')).toBeVisible();
  await expect(bubble).toHaveCount(0);
  await expect(contextMenu).toHaveCount(0);
  await expect(page.locator("[data-floating-insert]")).toHaveCount(0);
  await page.locator(".cm-content").click({ button: "right" });
  await expect(contextMenu).toHaveCount(0);
  await page.keyboard.press("Meta+e");
  await expect(page.locator('[data-testid="document-view"][data-mode="render"]')).toBeVisible();

  // I7 — dark toolbar contrast (AA 4.5:1), then restore light mode.
  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await paragraphs.first().click();
  await expect(bubble).toBeVisible();
  await page.waitForTimeout(250);
  await screenshot("s4-dark.png");
  const contrast = await bubble.getByRole("button", { name: "Negrita" }).evaluate((element) => {
    const rgb = (value: string) =>
      value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [];
    const luminance = (value: string) =>
      rgb(value)
        .map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const style = getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.getByRole("button", { name: "Cambiar a tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(pageErrors).toEqual([]);
});
