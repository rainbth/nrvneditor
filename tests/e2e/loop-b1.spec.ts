import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "loop-b1");

test.describe.configure({ mode: "serial" });

test("Loop B1: arranque vacío, titlebar, menús, save-as, selección y Markdown", async ({
  page,
}) => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const screenshot = (name: string) =>
    page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: false });

  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // almacenamiento no disponible: el mock funciona igual en memoria.
    }
  });

  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();

  // 2. Arranque vacío: el post-it ocupa el lienzo y el empty state está oculto.
  const note = page.getByTestId("editor-agent-note");
  await expect(note).toBeVisible();
  await expect(page.getByTestId("empty-document")).toBeHidden();
  await note.getByRole("button", { name: "OK" }).click();
  await expect(note).toHaveCount(0);
  await expect(page.getByTestId("empty-document")).toBeVisible();
  await expect(page.getByTestId("empty-document")).toContainText("Empieza a escribir…");
  await expect(page.getByTestId("doc-title")).toHaveText("Sin título");
  await expect(page.getByTestId("save-state")).toHaveText("Borrador");
  const treePanel = page.locator(".tree-panel");
  await expect(treePanel).toBeVisible();
  expect(await treePanel.getAttribute("role")).toBeNull();
  await expect(page.locator('.tree-panel [role="tree"]')).toHaveCount(0);
  await screenshot("b1-empty-start");

  // 3. Titlebar de 44 px, arrastrable y por encima del primer control.
  const titlebar = page.getByTestId("titlebar");
  await expect(titlebar).toBeVisible();
  const titlebarMetrics = await titlebar.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      bottom: rect.bottom,
      appRegion: getComputedStyle(element).getPropertyValue("-webkit-app-region"),
    };
  });
  expect(titlebarMetrics.height).toBe(44);
  expect(titlebarMetrics.appRegion).toBe("drag");

  const firstControlTop = await page
    .locator(".rail .icon-button")
    .first()
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(firstControlTop).toBeGreaterThanOrEqual(titlebarMetrics.bottom - 1);

  // 4. Menú Workspace (aún sin carpeta reciente: «Reabrir reciente» deshabilitado).
  await page.getByTestId("menu-workspace-trigger").click();
  const workspaceMenu = page.getByRole("menu");
  await expect(workspaceMenu).toBeVisible();
  await expect(workspaceMenu.getByRole("menuitem", { name: /Abrir carpeta/ })).toBeVisible();
  await expect(workspaceMenu.getByRole("menuitem", { name: /Reabrir reciente/ })).toBeDisabled();
  await expect(workspaceMenu.getByRole("menuitem", { name: /Recargar árbol/ })).toBeVisible();
  await expect(workspaceMenu.getByRole("menuitem", { name: /Revelar en Finder/ })).toBeVisible();
  await screenshot("b1-light-workspace-menu");
  await page.keyboard.press("Escape");
  await expect(workspaceMenu).toBeHidden();

  // 5. Cmd+S en un documento sin título: «Guardar como…» del mock, sin diálogo.
  await page.keyboard.press("Meta+s");
  await expect(page.getByTestId("doc-title")).toHaveText("sin-titulo.md");
  await expect(page.getByTestId("save-state")).toHaveText("Guardado");
  await expect(page.locator('[role="treeitem"][data-path="sin-titulo.md"]')).toBeVisible();

  // 6. Cmd+N vuelve al borrador vacío; el post-it reaparece y hay que
  // descartarlo para ver el empty state mínimo.
  await page.keyboard.press("Meta+n");
  await expect(page.getByTestId("doc-title")).toHaveText("Sin título");
  await expect(note).toBeVisible();
  await note.getByRole("button", { name: "OK" }).click();
  await expect(note).toHaveCount(0);
  await expect(page.getByTestId("empty-document")).toBeVisible();

  // 7. Abrir carpeta desde el menú Workspace y seleccionar un párrafo.
  await page.getByTestId("menu-workspace-trigger").click();
  await page.getByRole("menuitem", { name: /Abrir carpeta/ }).click();
  await expect(page.locator('[role="treeitem"][data-path="guia-estilo.md"]')).toBeVisible();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();

  const prose = page.locator(".prose");
  await expect(prose).toBeVisible();
  const thirdParagraph = prose.locator('[data-block-type="paragraph"]').nth(2);
  await thirdParagraph.click();
  await expect(thirdParagraph).toHaveAttribute("data-selected", "true");
  const paddingInline = await thirdParagraph.evaluate((element) => {
    const style = getComputedStyle(element);
    return [Number.parseFloat(style.paddingLeft), Number.parseFloat(style.paddingRight)];
  });
  expect(paddingInline[0]).toBeGreaterThanOrEqual(14);
  expect(paddingInline[1]).toBeGreaterThanOrEqual(14);
  await page.waitForTimeout(120);
  await screenshot("b1-selection-render");

  // 8. Tema oscuro y menú Documento.
  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("menu-document-trigger").click();
  const documentMenu = page.getByRole("menu");
  await expect(documentMenu).toBeVisible();
  await expect(documentMenu.getByRole("menuitemradio", { name: "Render" })).toBeVisible();
  await expect(documentMenu.getByRole("menuitemradio", { name: "Markdown" })).toBeVisible();
  await expect(
    documentMenu.getByRole("menuitem", { name: /Seleccionar documento completo/ }),
  ).toBeVisible();
  await expect(documentMenu.getByRole("menuitem", { name: /Copiar Markdown/ })).toBeVisible();
  await page.waitForTimeout(120);
  await screenshot("b1-dark-document-menu");
  await page.keyboard.press("Escape");
  await expect(documentMenu).toBeHidden();

  // 9. Cmd+E con la selección activa: las líneas del bloque quedan realzadas.
  // (Escape cerró el menú y, con él, limpió la selección: se vuelve a elegir.)
  await thirdParagraph.click();
  await expect(thirdParagraph).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Meta+e");
  await expect(page.locator('[data-testid="document-view"][data-mode="markdown"]')).toBeVisible();
  await expect(page.locator(".cm-editor")).toBeVisible();
  const highlighted = page.locator(".cm-block-selected");
  await expect(highlighted.first()).toBeVisible();
  const highlightStyles = await highlighted.first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, boxShadow: style.boxShadow };
  });
  expect(highlightStyles.background).not.toBe("transparent");
  expect(highlightStyles.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(highlightStyles.boxShadow).toContain("inset");
  expect(highlightStyles.boxShadow).toContain("2px");

  // El outline también marca el heading visible en Markdown.
  const activeOutlineItem = page.locator('.outline-item[aria-current="true"]');
  await expect.poll(() => activeOutlineItem.count()).toBe(1);
  await expect(activeOutlineItem.first()).toBeVisible();

  await page.waitForTimeout(120);
  await screenshot("b1-selection-markdown");

  // 10. Sin errores de página en todo el flujo.
  expect(pageErrors).toEqual([]);
});
