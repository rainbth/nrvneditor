import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "loop-b2");
const DOC_PATH = "guia-estilo.md";

test.describe.configure({ mode: "serial" });

/** Abre la carpeta fixture desde el rail y carga un documento con contenido. */
async function openWorkspaceAndDocument(page: Page, docPath = DOC_PATH): Promise<void> {
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  const tree = page.getByRole("tree", { name: /Archivos Markdown/ });
  await expect(tree).toBeVisible();
  await page.locator(`[role="treeitem"][data-path="${docPath}"]`).click();
  await expect(page.getByTestId("doc-title")).toContainText(docPath);
  await expect(page.locator(".prose")).toBeVisible();
}

/** Convierte `rgb(...)` a luminancia relativa para comparar contraste. */
function contrastRatio(foreground: string, background: string): number {
  const parse = (value: string): [number, number, number] => {
    const numbers = value.match(/\d+(?:\.\d+)?/g) ?? [];
    return [Number(numbers[0]), Number(numbers[1]), Number(numbers[2])];
  };
  const luminance = (value: string) => {
    const [r, g, b] = parse(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  const [light, dark] = first > second ? [first, second] : [second, first];
  return (light + 0.05) / (dark + 0.05);
}

test("Loop B2: hoja v3, selección multilínea, conector OpenCode y laterales", async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const screenshot = (name: string) =>
    page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: false });

  const renderView = page.locator('[data-testid="document-view"][data-mode="render"]');
  const markdownView = page.locator('[data-testid="document-view"][data-mode="markdown"]');

  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  const header = page.locator(".header-bar");
  await openWorkspaceAndDocument(page);

  // 1. Hoja light: Carta 816 px, fondo #FCFCFC, radio, padding generoso y centrada.
  const sheet = page.locator('.document-sheet[data-mode="render"]');
  await expect(sheet).toBeVisible();
  const lightMetrics = await sheet.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const area = element.closest(".document-area");
    const areaRect = area?.getBoundingClientRect();
    return {
      maxWidth: style.maxWidth,
      background: style.backgroundColor,
      borderRadius: Number.parseFloat(style.borderRadius),
      paddingTop: Number.parseFloat(style.paddingTop),
      centerDelta:
        areaRect === undefined
          ? Number.POSITIVE_INFINITY
          : Math.abs(rect.left + rect.width / 2 - (areaRect.left + areaRect.width / 2)),
    };
  });
  expect(lightMetrics.maxWidth).toBe("816px");
  expect(lightMetrics.background).toBe("rgb(252, 252, 252)");
  expect(lightMetrics.borderRadius).toBeGreaterThan(0);
  expect(lightMetrics.paddingTop).toBeGreaterThanOrEqual(94);
  expect(lightMetrics.centerDelta).toBeLessThanOrEqual(2);
  await screenshot("b2-sheet-light");

  // 2. Hoja dark: #1E2124 con contraste alto de texto, luego vuelta a light.
  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkMetrics = await sheet.evaluate((element) => {
    const style = getComputedStyle(element);
    const prose = element.querySelector(".prose");
    const proseStyle = prose === null ? null : getComputedStyle(prose);
    return {
      background: style.backgroundColor,
      text: proseStyle?.color ?? "",
    };
  });
  expect(darkMetrics.background).toBe("rgb(30, 33, 36)");
  expect(contrastRatio(darkMetrics.text, darkMetrics.background)).toBeGreaterThan(7);
  await screenshot("b2-sheet-dark");
  await page.getByRole("button", { name: "Cambiar a tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  // B5: el primer glifo de Markdown cae a ±2 px del primero de Render,
  // medido relativo al borde de cada hoja (el gutter vive fuera de la hoja
  // Render y la desplaza respecto a la hoja de Markdown).
  const renderOrigin = await page
    .locator(".prose .block")
    .first()
    .evaluate((element) => {
      const sheet = element.closest(".document-sheet");
      if (!(sheet instanceof HTMLElement)) throw new Error("El bloque no está en una hoja");
      const range = document.createRange();
      range.selectNodeContents(element);
      const rect = range.getBoundingClientRect();
      const sheetRect = sheet.getBoundingClientRect();
      return { x: rect.left - sheetRect.left, y: rect.top - sheetRect.top };
    });

  // 3. Números de línea en Markdown, toggle y restauración.
  await page.keyboard.press("Meta+e");
  await expect(markdownView).toBeVisible();

  // 3a. C1: la hoja en Markdown conserva marco, fondo y márgenes laterales.
  const markdownSheet = page.locator('.document-sheet[data-mode="markdown"]');
  await expect(markdownSheet).toBeVisible();
  const markdownMetrics = await markdownSheet.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const area = document.querySelector(".document-area");
    const areaRect = area?.getBoundingClientRect();
    return {
      background: style.backgroundColor,
      borderRadius: Number.parseFloat(style.borderRadius),
      maxWidth: style.maxWidth,
      left: rect.left,
      areaLeft: areaRect?.left ?? Number.NEGATIVE_INFINITY,
    };
  });
  expect(markdownMetrics.background).toBe("rgb(252, 252, 252)");
  expect(markdownMetrics.borderRadius).toBeGreaterThan(0);
  expect(markdownMetrics.maxWidth).toBe("760px");
  expect(markdownMetrics.left).toBeGreaterThan(markdownMetrics.areaLeft);

  // B5: el primer glifo de Markdown cae a ±2 px del primero de Render.
  // Se normaliza el scroll del editor en el mismo frame de la medición.
  const markdownOrigin = await page.locator(".cm-scroller").evaluate((scroller) => {
    scroller.scrollTop = 0;
    const line = scroller.querySelector(".cm-line");
    const sheet = scroller.closest(".document-sheet");
    if (line === null || !(sheet instanceof HTMLElement)) {
      return { x: Number.NaN, y: Number.NaN };
    }
    const range = document.createRange();
    range.selectNodeContents(line);
    const rect = range.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    return { x: rect.left - sheetRect.left, y: rect.top - sheetRect.top };
  });
  console.info("[B5] origins", JSON.stringify({ renderOrigin, markdownOrigin }));
  // B5: ±2 px.
  expect(Math.abs(markdownOrigin.x - renderOrigin.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(markdownOrigin.y - renderOrigin.y)).toBeLessThanOrEqual(2);

  const gutter = page.locator(".cm-lineNumbers .cm-gutterElement");
  await expect(page.locator(".cm-lineNumbers")).toBeVisible();
  const gutterNumbers = await gutter.evaluateAll((elements) =>
    elements
      .map((element) => (element.textContent ?? "").trim())
      .filter((text) => /^[0-9]+$/.test(text)),
  );
  expect(gutterNumbers.length).toBeGreaterThan(3);
  await screenshot("b2-line-numbers");

  const lineNumbersToggle = page.getByTestId("line-numbers-toggle");
  await expect(lineNumbersToggle).toHaveAttribute("aria-pressed", "true");
  await lineNumbersToggle.click();
  await expect(page.locator(".cm-lineNumbers")).toHaveCount(0);
  await expect(lineNumbersToggle).toHaveAttribute("aria-pressed", "false");
  const toggleBorder = await lineNumbersToggle.evaluate((element) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-line-strong)";
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { actual: getComputedStyle(element).borderTopColor, expected };
  });
  console.info("[B6] toggle border", toggleBorder.actual);
  expect(toggleBorder.actual).toBe(toggleBorder.expected);
  await lineNumbersToggle.click();
  await expect(page.locator(".cm-lineNumbers")).toBeVisible();
  await expect(lineNumbersToggle).toHaveAttribute("aria-pressed", "true");

  // 4. Selección multilínea en Markdown → área de edición con ≥2 bloques.
  const editorContent = page.locator(".cm-content");
  await editorContent.click();
  await page.keyboard.press("Meta+ArrowUp");
  await page.keyboard.down("Shift");
  for (let index = 0; index < 8; index += 1) await page.keyboard.press("ArrowDown");
  await page.keyboard.up("Shift");

  const editorHost = page.getByTestId("editor");
  await expect(editorHost).toHaveAttribute("data-editing-area", "true");
  await expect
    .poll(async () => page.locator(".cm-block-selected").count())
    .toBeGreaterThanOrEqual(2);

  const badge = page.getByTestId("selection-badge");
  await expect(badge.locator(".agent-context-title")).toHaveText(/^Editando \d+ bloques: /);
  const blockCount = Number(await badge.getAttribute("data-block-count"));
  expect(blockCount).toBeGreaterThanOrEqual(2);
  expect(blockCount).not.toBe(1);
  await expect(badge.getByRole("button", { name: "Quitar selección" })).toBeVisible();
  await expect(page.locator(".agent-empty-title")).toHaveText("Pide un cambio sobre la selección");
  await expect(page.getByText("Selecciona un bloque y pide un cambio")).toHaveCount(0);

  // B1: el toggle Render | Markdown no desaparece con la selección y el header
  // no desborda a 1400×900 con ambos paneles abiertos.
  const renderToggle = page.getByTestId("mode-toggle-render");
  const markdownToggle = page.getByTestId("mode-toggle-markdown");
  await expect(renderToggle).toBeVisible();
  await expect(markdownToggle).toBeVisible();
  await expect(renderToggle).toBeEnabled();
  await expect(markdownToggle).toBeEnabled();
  const headerOverflow = await header.evaluate(
    (element) => element.scrollWidth <= element.clientWidth + 1,
  );
  expect(headerOverflow).toBe(true);

  // B4: objetivos interactivos de al menos 28 px en al menos un eje.
  const boxOf = (locator: typeof badge) =>
    locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
  const targets = {
    lineNumbers: await boxOf(page.getByTestId("line-numbers-toggle")),
    clearSelection: await boxOf(badge.getByRole("button", { name: "Quitar selección" })),
    iconButton: await boxOf(header.locator(".icon-button-sm").first()),
    treeRow: await boxOf(page.locator(".tree-row").first()),
    modeOption: await boxOf(markdownToggle),
  };
  console.info("[B4] targets", JSON.stringify(targets));
  for (const target of Object.values(targets)) {
    expect(Math.max(target.width, target.height)).toBeGreaterThanOrEqual(28);
  }
  expect(targets.clearSelection.height).toBeGreaterThanOrEqual(28);
  expect(targets.iconButton.width).toBeGreaterThanOrEqual(28);
  expect(targets.treeRow.height).toBeGreaterThanOrEqual(28);
  expect(targets.modeOption.height).toBeGreaterThanOrEqual(28);

  // B2: textos de contexto con contraste AA sobre su fondo.
  const contextColors = await badge.evaluate((element) => {
    const title = element.querySelector(".agent-context-title");
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      title: title === null ? "" : getComputedStyle(title).color,
    };
  });
  console.info("[B2] context colors", JSON.stringify(contextColors));
  expect(contrastRatio(contextColors.title, contextColors.background)).toBeGreaterThanOrEqual(4.5);

  await screenshot("b2-multiline-selection");

  await page.keyboard.press("Escape");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("data-context-mode", "document");
  await expect(badge).toHaveAttribute("data-block-count", "0");
  await expect(badge.locator(".agent-context-title")).toHaveText("Editando documento completo");
  await expect(editorHost).not.toHaveAttribute("data-editing-area", "true");
  await expect(page.locator(".agent-empty-title")).toHaveText("Pide un cambio sobre el documento");

  // 5. Panel conectado + propuesta/diff + Rechazar y Aceptar.
  await page.keyboard.press("Meta+e");
  await expect(renderView).toBeVisible();
  const prose = page.locator(".prose");
  const paragraph = prose.locator('[data-block-type="paragraph"]').first();
  await paragraph.click();
  await expect(paragraph).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Meta+Enter");
  const paragraphKey = await paragraph.getAttribute("data-block-key");
  expect(paragraphKey).not.toBeNull();
  const beforeText = ((await paragraph.textContent()) ?? "").trim();

  const agentStatus = page.getByTestId("agent-status");
  await expect(agentStatus).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(agentStatus).toContainText("OpenCode conectado");

  const composer = page.getByTestId("agent-composer");
  await expect(composer).toBeEnabled();
  await composer.fill("Acorta este párrafo y elimina las repeticiones.");
  await expect(page.getByTestId("agent-send")).toBeEnabled();
  await page.getByTestId("agent-send").click();
  await expect(page.locator('[data-testid="agent-message"]')).toHaveCount(2, {
    timeout: 20_000,
  });

  // B7: Detener se lee como acción de peligro (surface + danger), no como CTA.
  const stop = page.getByTestId("agent-stop");
  await expect(stop).toBeVisible();
  // El puntero sigue sobre el antiguo Enviar; se retira para medir el estado base.
  await page.mouse.move(700, 500);
  await expect
    .poll(() => stop.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(252, 252, 252)");
  const stopStyle = await stop.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      color: style.color,
      border: style.borderTopColor,
    };
  });
  console.info("[B7] stop computed", JSON.stringify(stopStyle));
  expect(stopStyle.background).toBe("rgb(252, 252, 252)");
  expect(stopStyle.color).toBe("rgb(163, 74, 60)");
  expect(stopStyle.border).toBe("rgb(163, 74, 60)");

  await screenshot("b2-panel-connected");

  const inlinePreview = page.locator('[data-previewing="true"]');
  await expect(inlinePreview).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("proposal-bubble")).toHaveCount(0);
  await expect(page.getByTestId("agent-announcement")).toHaveText("Propuesta lista: 1 bloque");
  await expect(page.getByTestId("agent-proposal-inline-note")).toBeVisible();
  await expect(page.getByTestId("agent-proposal-goto-inline")).toBeVisible();
  await expect(page.getByTestId("agent-proposal-accept")).toHaveCount(0);
  await expect(page.getByTestId("agent-proposal-reject")).toHaveCount(0);
  await expect(page.getByTestId("agent-proposal-changes")).toHaveCount(0);

  // 5a. C11: la burbuja del asistente no muestra los marcadores crudos.
  const assistantMessage = page
    .locator('[data-testid="agent-message"][data-role="assistant"]')
    .first();
  await expect(assistantMessage).toBeVisible();
  await expect(assistantMessage).not.toContainText("<<<NRVN_BLOCK");

  await screenshot("b2-proposal-diff");

  // B1: pedir cambios prefills el composer y permite enviar una revisión.
  await page.getByTestId("block-preview-changes").click();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("Sobre este bloque: ");
  await expect(page.getByTestId("agent-send")).toBeEnabled();
  await screenshot("b2-proposal-revision");
  await composer.fill("Cambia el tono");
  await expect(page.getByTestId("agent-send")).toBeEnabled();
  await page.getByTestId("agent-send").click();
  await expect(inlinePreview).toBeVisible({ timeout: 20_000 });

  // B4: rechazar deja una barra para deshacer; al pulsarla vuelve la propuesta.
  await page.getByTestId("block-preview-discard").click();
  await expect(inlinePreview).toHaveCount(0);
  if (paragraphKey === null) throw new Error("El bloque seleccionado no tiene clave");
  const afterRejectText = (
    (await page.locator(`.prose [data-block-key="${paragraphKey}"]`).textContent()) ?? ""
  ).trim();
  expect(afterRejectText).toBe(beforeText);
  await expect(page.getByTestId("agent-undo-bar")).toBeVisible();
  await page.getByTestId("agent-undo-reject").click();
  await expect(inlinePreview).toBeVisible();

  // Aceptar la propuesta restaurada: el mock reemplaza el bloque.
  await page.getByTestId("block-preview-accept").click();
  await expect(inlinePreview).toHaveCount(0, { timeout: 20_000 });
  await expect(
    page
      .locator('.prose [data-block-type="paragraph"]')
      .filter({ hasText: "revisado por el agente" }),
  ).toHaveCount(1, { timeout: 20_000 });

  // 6. Laterales: cerrar desde la toolbar y reabrir con las asas.
  const treeToggle = header.getByRole("button", { name: /Mostrar u ocultar árbol/ });
  const agentToggle = header.getByRole("button", { name: /Mostrar u ocultar agente/ });

  await expect(treeToggle).toHaveAttribute("aria-pressed", "true");
  await treeToggle.click();
  await expect(treeToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".panel-handle-left")).toBeVisible();

  await expect(agentToggle).toHaveAttribute("aria-pressed", "true");
  await agentToggle.click();
  await expect(agentToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".panel-handle-right")).toBeVisible();

  // B5: el asa es una caja clicable de al menos 28 px (costura visible de 12 px).
  const rightHandleWidth = await page
    .locator(".panel-handle-right")
    .evaluate((element) => element.getBoundingClientRect().width);
  const leftHandleWidth = await page
    .locator(".panel-handle-left")
    .evaluate((element) => element.getBoundingClientRect().width);
  console.info("[B5] handle widths", JSON.stringify({ leftHandleWidth, rightHandleWidth }));
  expect(rightHandleWidth).toBeGreaterThanOrEqual(28);
  expect(leftHandleWidth).toBeGreaterThanOrEqual(28);

  await page.locator(".panel-handle-right").click();
  await expect(agentToggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".agent-panel")).toBeVisible();
  await page.locator(".panel-handle-left").click();
  await expect(treeToggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tree", { name: /Archivos Markdown/ })).toBeVisible();

  // 7. Persistencia: tras recargar, los números de línea siguen guardados.
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  await openWorkspaceAndDocument(page);
  await page.keyboard.press("Meta+e");
  await expect(markdownView).toBeVisible();
  const savedLineNumbers = await page.evaluate(() => {
    const raw = localStorage.getItem("nrvn.mock.settings");
    if (raw === null) return null;
    try {
      return (
        (JSON.parse(raw) as { render?: { lineNumbers?: boolean } }).render?.lineNumbers ?? null
      );
    } catch {
      return null;
    }
  });
  expect(savedLineNumbers).toBe(true);
  await expect(page.locator(".cm-lineNumbers")).toBeVisible();

  // 8. El selector de fuente persiste tras recargar (Newsreader → Lato).
  const fontSelect = page.locator(".editor-footer-font select");
  await expect(fontSelect).toHaveValue("lato");
  const selectBorder = await fontSelect.evaluate(
    (element) => getComputedStyle(element).borderTopColor,
  );
  const selectHeight = await fontSelect.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  console.info("[B6] font select border", selectBorder);
  expect(selectHeight).toBeGreaterThanOrEqual(28);
  expect(selectBorder).toBe(toggleBorder.expected);
  await fontSelect.selectOption("newsreader");
  await expect(fontSelect).toHaveValue("newsreader");
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  await openWorkspaceAndDocument(page);
  await page.keyboard.press("Meta+e");
  await expect(page.locator(".editor-footer-font select")).toHaveValue("newsreader");
  await page.locator(".editor-footer-font select").selectOption("lato");
  await expect(page.locator(".editor-footer-font select")).toHaveValue("lato");

  // 9. B7: cambiar de documento limpia la selección; el chip vuelve a modo documento.
  await page.keyboard.press("Meta+e");
  await expect(renderView).toBeVisible();
  const firstParagraph = page.locator('.prose [data-block-type="paragraph"]').first();
  await firstParagraph.click();
  const panelBadge = page.getByTestId("selection-badge");
  await expect(panelBadge).toBeVisible();
  expect(await panelBadge.getAttribute("data-block-count")).not.toBeNull();
  await page.locator('[role="treeitem"][data-path="referencias.md"]').click();
  await expect(page.getByTestId("doc-title")).toContainText("referencias.md");
  await expect(page.getByTestId("selection-badge")).toBeVisible();
  await expect(page.getByTestId("selection-badge")).toHaveAttribute(
    "data-context-mode",
    "document",
  );
  await expect(page.getByTestId("selection-badge")).toHaveAttribute("data-block-count", "0");
  await expect(page.locator("[data-block-count]")).toHaveCount(1);

  // 10. Sin errores de página en todo el flujo.
  expect(pageErrors).toEqual([]);
});
