import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "loop-b1");

test.describe.configure({ mode: "serial" });

test("Loop A: shell, workspace, render, selección, edición y panel de agente", async ({ page }) => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const pageErrors: string[] = [];
  const consoleLines: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => consoleLines.push(message.text()));

  const screenshot = (name: string) =>
    page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: false });

  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();

  // 1. Abrir carpeta mock: árbol filtrado a los 3 Markdown.
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  const tree = page.getByRole("tree", { name: /Archivos Markdown/ });
  await expect(tree).toBeVisible();
  await page.locator('[role="treeitem"][data-path="notas"]').click();
  await expect(page.locator('[role="treeitem"][data-path="notas/decisiones.md"]')).toBeVisible();
  await expect(page.locator('[role="treeitem"][data-type="file"]')).toHaveCount(3);
  await expect(page.locator('[role="treeitem"][data-path="notas"]')).toBeVisible();
  await expect(tree).not.toContainText("borrador.txt");
  await expect(tree).not.toContainText("diagrama.png");

  // 2. Abrir guia-estilo.md y verificar el render GFM + tokens de Shiki.
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.getByTestId("doc-title")).toContainText("guia-estilo.md");
  const prose = page.locator(".prose");
  await expect(prose.locator("table")).toBeVisible();
  await expect(prose.locator('input[type="checkbox"]').first()).toBeVisible();
  await expect(prose.locator("blockquote")).toBeVisible();
  await expect(prose.locator('pre code span[style*="color"]').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(prose.locator('a[href="https://example.com"]').first()).toBeVisible();
  await expect.poll(() => consoleLines.some((line) => line.includes("[nrvn] open ms="))).toBe(true);

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await screenshot("nrvn-light");

  // Evidencia extra del bundle fino de Shiki: el bloque ```ts con tokens coloreados.
  await prose.locator("pre").first().scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await screenshot("nrvn-code");
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-document-scroll]")?.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);

  // 3. Tema oscuro desde el rail.
  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await screenshot("nrvn-dark");
  await page.getByRole("button", { name: "Cambiar a tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  // 4. Selección de bloque, rango y limpieza con Esc.
  const paragraphs = prose.locator('[data-block-type="paragraph"]');
  await paragraphs.first().click();
  await expect(page.getByTestId("selection-badge").locator(".agent-context-title")).toHaveText(
    /^Editando párrafo: /,
  );
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(1);

  await paragraphs.nth(1).click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("selection-badge").locator(".agent-context-title")).toHaveText(
    /^Editando \d+ bloques: /,
  );
  expect(await prose.locator('[data-selected="true"]').count()).toBeGreaterThan(1);

  await page.keyboard.press("Escape");
  // El primero cancela la edición inline y conserva la selección; el segundo la limpia.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("selection-badge")).toBeVisible();
  await expect(page.getByTestId("selection-badge")).toHaveAttribute(
    "data-context-mode",
    "document",
  );
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(0);

  // 4b. Rango de 3 bloques consecutivos (Shift+clic) para el realce continuo.
  await prose.locator('[data-block-index="4"]').click();
  await prose.locator('[data-block-index="6"]').click({ modifiers: ["Shift"] });
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(3);
  // Shift+clic no debe disparar la selección de texto nativa (sólo realza bloques).
  expect(await page.evaluate(() => (window.getSelection()?.toString() ?? "").length)).toBe(0);
  // El ancla del rango recibió el foco con el clic, pero el foco de puntero no
  // pinta anillo: sólo queda la banda (barra de 2 px), sin rectángulo interior.
  const focusedSelected = await prose.locator('[data-block-index="4"]').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focused: document.activeElement === element,
      selected: element.getAttribute("data-selected"),
      focusOrigin: element.getAttribute("data-focus-origin"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      bandShadow: getComputedStyle(element, "::after").boxShadow,
    };
  });
  expect(focusedSelected.focused).toBe(true);
  expect(focusedSelected.selected).toBe("true");
  expect(focusedSelected.focusOrigin).toBe("pointer");
  expect(focusedSelected.outlineStyle).toBe("none");
  // Sin anillo de foco (`inset 0 0 0 1px`); la barra del grupo sigue intacta.
  expect(focusedSelected.boxShadow).not.toContain("0px 0px 0px 1px");
  expect(focusedSelected.bandShadow).toContain("2px 0px 0px 0px inset");
  // La banda se pinta con una transición breve: se espera a que asiente y se
  // comprueba que el realce es uniforme (un sólo fondo, una sola barra) en los
  // tres bloques del grupo, sin rectángulo interior en el ancla.
  await page.waitForTimeout(250);
  const bandStyles = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.prose [data-selected="true"]')).map(
      (element) => {
        const style = getComputedStyle(element);
        return {
          bg: style.backgroundColor,
          boxShadow: style.boxShadow,
          bandShadow: getComputedStyle(element, "::after").boxShadow,
          outline: style.outlineStyle,
        };
      },
    ),
  );
  expect(bandStyles).toHaveLength(3);
  for (const style of bandStyles) {
    expect(style.bg).toBe(bandStyles[0].bg);
    // Misma barra de 2 px y sin anillo interior (`0 0 0 1px`).
    expect(style.bandShadow).toContain("2px 0px 0px 0px inset");
    expect(style.boxShadow).not.toContain("0px 0px 0px 1px");
    expect(style.outline).toBe("none");
  }
  await screenshot("nrvn-selection-range");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(0);

  // 4c. Un clic normal sobre un bloque tampoco deja selección de texto nativa
  // ni anillo de foco (el foco de puntero no pinta indicador por bloque).
  await prose.locator('[data-block-index="4"]').click();
  expect(await page.evaluate(() => (window.getSelection()?.toString() ?? "").length)).toBe(0);
  const pointerSelected = await prose.locator('[data-block-index="4"]').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusOrigin: element.getAttribute("data-focus-origin"),
      outlineStyle: style.outlineStyle,
      boxShadow: style.boxShadow,
    };
  });
  expect(pointerSelected.focusOrigin).toBe("pointer");
  expect(pointerSelected.outlineStyle).toBe("none");
  expect(pointerSelected.boxShadow).not.toContain("0px 0px 0px 1px");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(0);

  // 4d. Un arrastre sobre el texto SÍ selecciona texto (copiar sigue disponible)
  // sin seleccionar el bloque.
  const dragTarget = prose.locator('[data-block-index="5"] li').first();
  const dragBox = await dragTarget.boundingBox();
  if (!dragBox) throw new Error("El párrafo de arrastre no tiene caja");
  const dragY = dragBox.y + dragBox.height / 2;
  await page.mouse.move(dragBox.x + 12, dragY);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + dragBox.width * 0.8, dragY, { steps: 12 });
  await page.mouse.up();
  expect(
    await page.evaluate(() => (window.getSelection()?.toString() ?? "").length),
  ).toBeGreaterThan(0);
  await expect(page.getByTestId("selection-badge")).toBeVisible();
  await expect(page.getByTestId("selection-badge")).toHaveAttribute(
    "data-context-mode",
    "document",
  );
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(0);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  expect(await page.evaluate(() => (window.getSelection()?.toString() ?? "").length)).toBe(0);

  // 4e. El foco por teclado sigue visible (RNF-5) dentro y fuera del grupo.
  await prose.locator('[data-block-index="4"]').click();
  await prose.locator('[data-block-index="6"]').click({ modifiers: ["Shift"] });
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(3);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowDown");
  const keyboardFocusInGroup = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return null;
    const style = getComputedStyle(element);
    return {
      index: element.getAttribute("data-block-index"),
      selected: element.getAttribute("data-selected"),
      focusOrigin: element.getAttribute("data-focus-origin"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      bandShadow: getComputedStyle(element, "::after").boxShadow,
    };
  });
  expect(keyboardFocusInGroup?.index).toBe("5");
  expect(keyboardFocusInGroup?.selected).toBe("true");
  expect(keyboardFocusInGroup?.focusOrigin).toBe("keyboard");
  expect(keyboardFocusInGroup?.outlineStyle).toBe("none");
  // Sin anillo interior adicional: la banda + barra son el único indicador.
  expect(keyboardFocusInGroup?.boxShadow).not.toContain("0px 0px 0px 1px inset");
  expect(keyboardFocusInGroup?.bandShadow).toContain("2px 0px 0px 0px inset");

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(prose.locator('[data-selected="true"]')).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  const keyboardFocusOutsideGroup = await page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return null;
    const style = getComputedStyle(element);
    return {
      index: element.getAttribute("data-block-index"),
      selected: element.getAttribute("data-selected"),
      focusOrigin: element.getAttribute("data-focus-origin"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  });
  expect(keyboardFocusOutsideGroup?.index).toBe("6");
  expect(keyboardFocusOutsideGroup?.selected).toBeNull();
  expect(keyboardFocusOutsideGroup?.focusOrigin).toBe("keyboard");
  expect(keyboardFocusOutsideGroup?.outlineStyle).toBe("solid");
  expect(keyboardFocusOutsideGroup?.outlineWidth).toBe("2px");

  // 5. Clic en un heading intermedio: sección completa (no todo el documento)
  // + contexto en el panel de agente.
  await prose.locator('[data-block-type="heading"]').nth(1).click();
  await expect(page.getByTestId("selection-badge").locator(".agent-context-title")).toHaveText(
    /^Editando sección: /,
  );
  expect(await prose.locator('[data-selected="true"]').count()).toBeGreaterThan(1);
  await expect(page.getByTestId("selection-badge").locator(".agent-context-title")).toHaveText(
    /^Editando sección: “Principios”$/,
  );
  await screenshot("nrvn-selection");

  // 5b. Heading aislado: Shift+clic sobre el mismo heading deja sólo ese bloque.
  const headingBlock = prose.locator('[data-block-type="heading"]').nth(1);
  await headingBlock.click({ modifiers: ["Shift"] });
  const headingChip = page.getByTestId("selection-badge");
  await expect(headingChip.locator(".agent-context-title")).toHaveText(
    /^Editando sección: “Principios”$/,
  );
  await expect(headingChip.getByRole("button", { name: "Quitar selección" })).toBeVisible();
  await screenshot("nrvn-selection-heading");

  // 6. Panel de agente conectado al mock: con la sección seleccionada el
  // composer está habilitado; el envío sigue deshabilitado sin instrucción.
  const agentStatus = page.getByTestId("agent-status");
  await expect(agentStatus).toHaveAttribute("data-status", "ready");
  await expect(agentStatus).toContainText("OpenCode conectado");
  await expect(page.getByTestId("agent-composer")).toBeEnabled();
  await expect(page.getByTestId("agent-send")).toBeDisabled();

  // 7. Cmd+E: Render → Markdown → Render, con medición en consola.
  await page.keyboard.press("Meta+e");
  await expect(page.locator('[data-testid="document-view"][data-mode="markdown"]')).toBeVisible();
  await expect(page.locator(".cm-editor")).toBeVisible();
  await screenshot("nrvn-markdown");

  await page.keyboard.press("Meta+e");
  await expect(page.locator('[data-testid="document-view"][data-mode="render"]')).toBeVisible();
  await expect
    .poll(() => consoleLines.some((line) => line.includes("[nrvn] toggle ms=")))
    .toBe(true);

  // 8. Autosave (800 ms) con indicador Guardando… → Guardado y persistencia.
  await page.keyboard.press("Meta+e");
  await expect(page.locator('[data-testid="document-view"][data-mode="markdown"]')).toBeVisible();

  await page.evaluate(() => {
    const target = document.querySelector('[data-testid="save-state"]');
    const scope = window as unknown as { __nrvnSaveStates: string[] };
    scope.__nrvnSaveStates = [];
    if (target) {
      new MutationObserver(() => {
        scope.__nrvnSaveStates.push(target.textContent ?? "");
      }).observe(target, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
      });
    }
  });

  await page.locator(".cm-content").click();
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type("x");
  await expect(page.getByTestId("save-state")).toHaveText("Sin guardar");
  await expect(page.getByTestId("save-state")).toHaveText("Guardado", { timeout: 5_000 });

  const saveStates = await page.evaluate(
    () => (window as unknown as { __nrvnSaveStates: string[] }).__nrvnSaveStates,
  );
  expect(saveStates).toContain("Guardando…");
  expect(await page.evaluate(() => localStorage.getItem("nrvn.mock.guia-estilo.md"))).toMatch(/x$/);

  // 9. Cmd+S guarda sin esperar el debounce de 800 ms.
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.type("y");
  await expect(page.getByTestId("save-state")).toHaveText("Sin guardar");
  const forcedStart = Date.now();
  await page.keyboard.press("Meta+s");
  await expect(page.getByTestId("save-state")).toHaveText("Guardado", { timeout: 2_000 });
  expect(Date.now() - forcedStart).toBeLessThan(800);
  expect(await page.evaluate(() => localStorage.getItem("nrvn.mock.guia-estilo.md"))).toMatch(/y$/);

  // 10. A11y del árbol: flechas mueven el foco y Enter abre el archivo.
  const firstRow = page.locator('[role="treeitem"]').first();
  await firstRow.focus();
  await expect(firstRow).toBeFocused();
  const outlineStyle = await firstRow.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outlineStyle).not.toBe("none");

  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-path") ?? null))
    .toBe("notas/decisiones.md");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("doc-title")).toContainText("decisiones.md");

  // 11. Ningún error de página en todo el flujo.
  expect(pageErrors).toEqual([]);
});
