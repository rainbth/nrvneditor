import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "loop-b5a");

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1400, height: 900 } });

async function openWorkspaceAndDocument(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  const tree = page.getByRole("tree", { name: /Archivos Markdown/ });
  await expect(tree).toBeVisible();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.getByTestId("doc-title")).toContainText("guia-estilo.md");
  await expect(page.locator(".prose")).toBeVisible();
}

test("Loop B5a: toolbar, inline editing, insertion and markdown block editing", async ({
  page,
}) => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const screenshot = (name: string) =>
    page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: false });

  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await openWorkspaceAndDocument(page);
  const prose = page.locator(".prose");
  const badge = page.getByTestId("selection-badge");
  const firstParagraph = prose.locator('[data-block-type="paragraph"]').first();
  const toolbar = page.getByTestId("format-toolbar");

  // a. Inline selection and toolbar.
  await firstParagraph.click();
  await expect(toolbar).toBeVisible();
  await expect(badge.locator(".agent-context-title")).toHaveText(/^Editando párrafo: /);
  let editable = prose.locator(
    '.block[contenteditable="plaintext-only"][data-block-editable="true"]',
  );
  await expect(editable).toBeVisible();
  await expect(editable).toBeFocused();
  await screenshot("b5a-toolbar-light.png");
  await screenshot("b5a-caret-inline.png");

  const word = await editable.evaluate((el) => {
    const text = el.textContent ?? "";
    const match = /\b[\p{L}]+\b/u.exec(text);
    if (!match) throw new Error("No hay palabra seleccionable en el primer párrafo");
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (!(node instanceof Text)) throw new Error("No hay nodo de texto editable");
    const range = document.createRange();
    range.setStart(node, match.index);
    range.setEnd(node, match.index + match[0].length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return match[0];
  });
  await page.keyboard.press("Meta+b");
  await page.keyboard.press("Meta+Enter");
  await expect(firstParagraph.locator("strong").filter({ hasText: word })).toBeVisible();
  await expect(firstParagraph).not.toHaveAttribute("data-block-editable", "true");

  // b/c. Store undo/redo keeps selection.
  await page.keyboard.press("Meta+z");
  await expect(firstParagraph.locator("strong").filter({ hasText: word })).toHaveCount(0);
  await page.keyboard.press("Meta+Shift+z");
  await expect(firstParagraph.locator("strong").filter({ hasText: word })).toBeVisible();
  await expect(firstParagraph).toHaveAttribute("data-selected", "true");

  // d. Transform paragraph to H3 and undo.
  await firstParagraph.click();
  await toolbar.getByRole("button", { name: "H3" }).click();
  const transformedHeading = prose.locator("h3").filter({ hasText: word }).first();
  await expect(transformedHeading).toBeVisible();
  await page.keyboard.press("Meta+z");
  await expect(prose.locator("p").filter({ hasText: word }).first()).toBeVisible();

  // e/f. Create a section and a pending paragraph.
  const insertTrigger = page.getByTestId("insert-menu-trigger");
  await insertTrigger.click();
  await page.getByRole("menuitem", { name: "Sección" }).click();
  await expect(prose.locator("h2").filter({ hasText: "Nueva sección" })).toBeVisible();
  await expect(prose.locator('[data-pending="true"]')).toBeVisible();
  await screenshot("b5a-insert-section.png");

  await insertTrigger.click();
  await page.getByRole("menuitem", { name: "Párrafo" }).click();
  const pendingParagraph = prose.locator('[data-pending="true"]').last();
  await expect(pendingParagraph).toBeVisible();
  await expect(pendingParagraph).toHaveAttribute("data-empty", "true");
  await expect(pendingParagraph).toHaveCSS("border-style", "dashed");
  await expect(badge.locator(".agent-context-title")).toHaveText("Editando párrafo nuevo");
  const composer = page.getByTestId("agent-composer");
  await expect(composer).toHaveAttribute("placeholder", "Describe qué quieres en este párrafo");
  await expect(pendingParagraph).toBeFocused();
  await screenshot("b5a-parrafo-pendiente.png");

  // g. Fill the pending inline block and commit.
  const pendingBlock = prose.locator('[data-pending="true"]').last();
  const pendingKey = await pendingBlock.getAttribute("data-block-key");
  await pendingBlock.click();
  await expect(pendingBlock).toHaveAttribute("data-block-editable", "true");
  await pendingBlock.fill("Texto nuevo");
  await page.keyboard.press("Meta+Enter");
  await expect(prose.locator(`[data-pending="true"][data-block-key="${pendingKey}"]`)).toHaveCount(
    0,
  );
  await expect(prose.getByText("Texto nuevo", { exact: true })).toBeVisible();

  // h. Reanchor across three paragraphs after changing the source text.
  await prose.locator('[data-block-type="paragraph"]').first().click();
  editable = prose
    .locator('.block[contenteditable="plaintext-only"][data-block-editable="true"]')
    .first();
  await editable.evaluate((el) => {
    el.textContent = "uno\n\ndos\n\ntres";
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: "uno dos tres" }),
    );
  });
  await page.keyboard.press("Meta+Enter");
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(3);
  await expect(badge.locator(".agent-context-title")).toHaveText(/^Editando 3 bloques: /);
  await screenshot("b5a-selection-expanded.png");

  // i. Non-editable code block opens Markdown at its source.
  const codeBlock = prose.locator('.block[data-block-type="code"]').first();
  await codeBlock.scrollIntoViewIfNeeded();
  await codeBlock.hover();
  await codeBlock.getByTestId("block-edit-markdown").click();
  const markdownView = page.locator('[data-testid="document-view"][data-mode="markdown"]');
  await expect(markdownView).toBeVisible();
  const codeMirror = page.locator(".cm-editor");
  await expect(codeMirror).toBeVisible();
  await expect(page.locator(".cm-content")).toBeFocused();
  await screenshot("b5a-editar-markdown-code.png");

  // j. Theme coverage for persistent toolbar.
  await page.keyboard.press("Meta+e");
  await expect(page.locator('[data-testid="document-view"][data-mode="render"]')).toBeVisible();
  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await prose.locator('[data-block-type="paragraph"]').last().click();
  await expect(toolbar).toBeVisible();
  await screenshot("b5a-toolbar-dark.png");
  await page.getByRole("button", { name: "Cambiar a tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  // k. No uncaught page errors.
  expect(pageErrors).toEqual([]);
});

test("Loop B5a: inline keyboard editing, agent insertion and non-editable blocks", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {}
  });
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await openWorkspaceAndDocument(page);
  const prose = page.locator(".prose");
  const editSelector = '.block[contenteditable="plaintext-only"][data-block-editable="true"]';

  // 1. El primer Escape cancela el borrador inline; el segundo limpia la selección.
  const firstParagraph = prose.locator('[data-block-type="paragraph"]').first();
  const originalText = (await firstParagraph.textContent()) ?? "";
  await firstParagraph.click();
  await prose.locator(editSelector).first().fill("texto temporal");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(prose.locator('[data-block-editable="true"]')).toHaveCount(0);
  await expect(firstParagraph).toContainText("Esta guía reúne");
  await expect(firstParagraph).toContainText(originalText.trim().slice(0, 12));
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(0);

  // 2. Shift+Enter commits a hard break within the paragraph.
  const hardBreakBlock = prose.locator('[data-block-type="paragraph"]').nth(1);
  await hardBreakBlock.click();
  await prose.locator(editSelector).first().fill("linea uno");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("dos");
  await page.keyboard.press("Meta+Enter");
  await expect(hardBreakBlock).toContainText("linea uno");
  await expect(hardBreakBlock).toContainText("dos");
  await expect.poll(() => hardBreakBlock.evaluate((el) => el.innerHTML.includes("<br"))).toBe(true);

  // 3. Backspace at offset zero merges the second paragraph into its predecessor.
  const paragraphs = prose.locator('[data-block-type="paragraph"]');
  const countBefore = await paragraphs.count();
  const previousText = (await paragraphs.nth(0).textContent()) ?? "";
  const secondText = (await paragraphs.nth(1).textContent()) ?? "";
  await paragraphs.nth(1).click();
  const mergeEditor = prose.locator(editSelector).first();
  await mergeEditor.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.press("Backspace");
  await expect(prose.locator('[data-block-type="paragraph"]')).toHaveCount(countBefore - 1);
  const merged = prose
    .locator('[data-block-type="paragraph"]')
    .filter({
      hasText: previousText.trim().slice(-12),
    })
    .first();
  await expect(merged).toContainText(previousText.trim().slice(-12));
  await expect(merged).toContainText(secondText.trim().slice(0, 12));

  // 4. Inline italic and link shortcuts around selected words.
  const formatTarget = prose.locator('[data-block-type="paragraph"]').first();
  const selectWord = () =>
    formatTarget.evaluate((block) => {
      const editor = block.matches('[contenteditable="plaintext-only"]')
        ? block
        : block.querySelector('[contenteditable="plaintext-only"]');
      if (!(editor instanceof HTMLElement)) throw new Error("No está activo el editor inline");
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode();
      if (!(node instanceof Text)) throw new Error("El párrafo no contiene texto");
      const match = /\b[\p{L}]+\b/u.exec(node.data);
      if (!match) throw new Error("No hay palabra seleccionable");
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return match[0];
    });
  await formatTarget.click();
  await expect(formatTarget).toHaveAttribute("data-block-editable", "true");
  const italicWord = await selectWord();
  await page.keyboard.press("Meta+i");
  await page.keyboard.press("Meta+Enter");
  await expect(formatTarget.locator("em").filter({ hasText: italicWord })).toBeVisible();

  await formatTarget.click();
  await expect(formatTarget).toHaveAttribute("data-block-editable", "true");
  const linkWord = await selectWord();
  await page.keyboard.press("Meta+k");
  await page.keyboard.press("Meta+Enter");
  await expect(
    formatTarget.locator('a[href="https://"]').filter({ hasText: linkWord }),
  ).toBeVisible();

  // 5. Agent-generated insertion creates the placeholder and focuses the composer.
  await page.getByTestId("insert-menu-trigger").click();
  await page.getByRole("menuitem", { name: "Bloque de agente" }).click();
  await expect(
    prose
      .getByText("[Describe el contenido que quieres generar]", { exact: true })
      .or(prose.getByText(/revisado por el agente/)),
  ).toBeVisible();
  await expect(page.getByTestId("selection-badge")).toHaveAttribute(
    "data-context-mode",
    "selection",
  );
  await expect(page.getByTestId("selection-badge")).toHaveAttribute("data-block-count", "1");
  await expect(page.getByTestId("agent-composer")).toBeFocused();

  // 6. Read-only code/table controls exist; do not activate them.
  await expect(
    prose.locator('.block[data-block-type="code"]').first().getByTestId("block-edit-markdown"),
  ).toBeVisible();
  await expect(
    prose.locator('.block[data-block-type="table"]').first().getByTestId("block-edit-markdown"),
  ).toBeVisible();
  const firstBlock = prose.locator('.block[data-block-index="0"]');
  if (await firstBlock.count()) {
    const raw = await firstBlock.getAttribute("data-raw-markdown");
    if (raw?.startsWith("---")) {
      await expect(firstBlock).not.toHaveAttribute("data-block-editable", "true");
    }
  }
});
