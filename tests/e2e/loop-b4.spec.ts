import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "loop-b4");
const DOC_PATH = "guia-estilo.md";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1400, height: 900 } });

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

test("Loop B4: post-it, gutter, sombra, panel redimensionable y dialog", async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const screenshot = (name: string) =>
    page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: false });

  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // Sin almacenamiento: el mock funciona igual en memoria.
    }
  });

  await page.goto("/");
  await expect(page.getByTestId("app-shell")).toBeVisible();

  const note = page.getByTestId("editor-agent-note");
  const empty = page.getByTestId("empty-document");

  // 1. Arranque: post-it visible y empty state oculto.
  await expect(note).toBeVisible();
  await expect(empty).toBeHidden();
  await screenshot("b4-post-it-sin-empty");

  // 2. Tras OK: empty state mínimo (título + CTA, sin icono ni copy).
  await note.getByRole("button", { name: "OK" }).click();
  await expect(note).toHaveCount(0);
  await expect(empty).toBeVisible();
  await expect(empty.locator(".empty-document-title")).toHaveText("Empieza a escribir…");
  await expect(empty.getByRole("button", { name: "Editar en Markdown" })).toBeVisible();
  await expect(empty.locator(".empty-document-copy")).toHaveCount(0);
  await expect(empty.locator("svg")).toHaveCount(0);

  // 3. Gutter de Render: fuera de la hoja y estable al scroll.
  await openWorkspaceAndDocument(page);
  const sheet = page.locator('.document-sheet[data-mode="render"]');
  const gutter = page.getByTestId("render-gutter");
  const gutterNumbers = gutter.locator("[data-line]");
  await expect(gutterNumbers.first()).toBeVisible();
  expect(await gutterNumbers.count()).toBeGreaterThan(3);

  // Tick interno visible con su opacidad atenuada y numeración alineada al
  // primer bloque real del documento.
  await expect(gutter.locator(".render-gutter-tick").first()).toBeVisible();
  const gutterMarks = await page.evaluate(() => {
    const tick = document.querySelector('[data-testid="render-gutter"] .render-gutter-tick');
    const firstNumber = document.querySelector('[data-testid="render-gutter"] [data-line]');
    const firstBlock = document.querySelector(".prose .block");
    if (
      !(tick instanceof HTMLElement) ||
      !(firstNumber instanceof HTMLElement) ||
      !(firstBlock instanceof HTMLElement)
    ) {
      throw new Error("Faltan marcas del gutter");
    }
    const tickRect = tick.getBoundingClientRect();
    return {
      tickOpacity: Number.parseFloat(getComputedStyle(tick).opacity),
      tickVisible: tickRect.width > 0 && tickRect.height > 0,
      firstNumber: Number(firstNumber.dataset.line),
      firstBlockStart: Number(firstBlock.dataset.startLine),
    };
  });
  expect(gutterMarks.tickVisible).toBe(true);
  expect(gutterMarks.tickOpacity).toBeCloseTo(0.35, 2);
  expect(gutterMarks.firstNumber).toBe(gutterMarks.firstBlockStart);

  const gutterGeometry = await page.evaluate(() => {
    const gutterNode = document.querySelector('[data-testid="render-gutter"]');
    const sheetNode = document.querySelector('.document-sheet[data-mode="render"]');
    if (!(gutterNode instanceof HTMLElement) || !(sheetNode instanceof HTMLElement)) {
      throw new Error("Faltan gutter u hoja");
    }
    return {
      gutterRight: gutterNode.getBoundingClientRect().right,
      sheetLeft: sheetNode.getBoundingClientRect().left,
    };
  });
  expect(gutterGeometry.gutterRight).toBeLessThanOrEqual(gutterGeometry.sheetLeft + 0.5);

  const relativeGutterTop = () =>
    page.evaluate(() => {
      const number = document.querySelector('[data-testid="render-gutter"] [data-line]');
      const sheetNode = document.querySelector('.document-sheet[data-mode="render"]');
      if (!(number instanceof Element) || !(sheetNode instanceof Element)) {
        throw new Error("Faltan número de línea u hoja");
      }
      return number.getBoundingClientRect().top - sheetNode.getBoundingClientRect().top;
    });

  const gutterTopBefore = await relativeGutterTop();
  await page.locator("[data-document-scroll]").evaluate((element) => {
    element.scrollTop = 220;
  });
  await page.waitForTimeout(120);
  const gutterTopAfter = await relativeGutterTop();
  expect(Math.abs(gutterTopAfter - gutterTopBefore)).toBeLessThanOrEqual(2);
  await screenshot("b4-render-gutter");

  // El offset número/hoja sobrevive a un cambio de viewport (reflow del grid).
  const nextFrames = () =>
    page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
  const gutterOffsetBeforeResize = await relativeGutterTop();
  await page.setViewportSize({ width: 1200, height: 900 });
  await nextFrames();
  const gutterOffsetAt1200 = await relativeGutterTop();
  expect(Math.abs(gutterOffsetAt1200 - gutterOffsetBeforeResize)).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 1400, height: 900 });
  await nextFrames();
  expect(Math.abs((await relativeGutterTop()) - gutterOffsetBeforeResize)).toBeLessThanOrEqual(2);

  const sheetLeftWithNumbers = await sheet.evaluate(
    (element) => element.getBoundingClientRect().left,
  );
  const gutterFontBefore = await relativeGutterTop();
  await page.getByTestId("menu-view-trigger").click();
  await page.getByRole("menuitemradio", { name: "Newsreader" }).click();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await nextFrames();
  await nextFrames();
  expect(Math.abs((await relativeGutterTop()) - gutterFontBefore)).toBeLessThanOrEqual(2);
  await page.getByTestId("menu-view-trigger").click();
  await page.getByRole("menuitemcheckbox", { name: /Números de línea en render/ }).click();
  await expect(gutterNumbers).toHaveCount(0);
  const sheetLeftWithoutNumbers = await sheet.evaluate(
    (element) => element.getBoundingClientRect().left,
  );
  expect(Math.abs(sheetLeftWithoutNumbers - sheetLeftWithNumbers)).toBeLessThanOrEqual(0.5);

  // 4. Hoja: sombra exterior, borde hairline y radio 12.
  const sheetShadow = await sheet.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      boxShadow: style.boxShadow,
      borderWidth: Number.parseFloat(style.borderTopWidth),
      borderRadius: Number.parseFloat(style.borderTopLeftRadius),
    };
  });
  expect(sheetShadow.boxShadow).toContain("0px 1px 2px");
  expect(sheetShadow.boxShadow).toContain("0px 18px 48px");
  expect(sheetShadow.borderWidth).toBe(1);
  expect(sheetShadow.borderRadius).toBe(12);
  await screenshot("b4-hoja-sombra");

  // 5. Resizer del panel de agente: arrastre, teclado, doble clic y persistencia.
  const panel = page.locator(".agent-panel");
  const resizer = page.getByTestId("agent-resizer");
  await expect(resizer).toBeVisible();
  await expect(panel).toBeVisible();

  const widthOf = (locator: typeof panel) =>
    locator.evaluate((element) => element.getBoundingClientRect().width);

  const widthBefore = await widthOf(panel);
  const resizerBox = await resizer.boundingBox();
  expect(resizerBox).not.toBeNull();
  if (resizerBox === null) throw new Error("El asa no tiene caja");
  const startX = resizerBox.x + resizerBox.width / 2;
  const startY = resizerBox.y + Math.min(120, resizerBox.height / 2);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 80, startY, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(async () => widthOf(panel), { timeout: 5_000 })
    .toBeGreaterThan(widthBefore + 60);
  const widthAfterDrag = await widthOf(panel);
  expect(widthAfterDrag).toBeGreaterThanOrEqual(320);
  expect(widthAfterDrag).toBeLessThanOrEqual(640);

  await resizer.focus();
  const widthBeforeKey = await widthOf(panel);
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => widthOf(panel), { timeout: 5_000 })
    .toBeGreaterThan(widthBeforeKey + 4);
  const widthAfterLeft = await widthOf(panel);
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => widthOf(panel), { timeout: 5_000 })
    .toBeLessThan(widthAfterLeft - 4);

  await resizer.dblclick();
  await expect.poll(async () => Math.round(await widthOf(panel)), { timeout: 5_000 }).toBe(380);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem("nrvn.mock.settings");
        if (raw === null) return null;
        try {
          return (
            (JSON.parse(raw) as { panelWidths?: { agent?: number } }).panelWidths?.agent ?? null
          );
        } catch {
          return null;
        }
      }),
    )
    .toBe(380);

  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  expect(noHorizontalOverflow).toBe(true);
  await screenshot("b4-panel-resized");

  // 6. Dialog «Conexión y cuenta» en light.
  const trigger = page.getByTestId("agent-settings-trigger");
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("heading", { name: "Conexión y cuenta" })).toBeVisible();
  await expect(dialog.locator(".connection-section")).toHaveCount(5);
  await expect(dialog.getByTestId("agent-mode")).toHaveValue("auto");
  await expect(dialog.getByTestId("agent-agent")).toHaveValue("build");
  const modelOptions = await dialog.getByTestId("agent-model").locator("option").allTextContents();
  expect(modelOptions).toContain("DeepSeek V4.1 Flash");
  await expect(dialog.getByTestId("agent-providers")).toContainText("OpenCode");
  await expect(dialog).toContainText("OpenAI requiere API key; ChatGPT Plus no es API");
  await expect(dialog.getByTestId("agent-service-url")).toContainText("http://127.0.0.1");
  await expect(dialog.getByTestId("agent-sessions-dir")).toContainText("sessions");
  await expect(dialog.getByTestId("agent-permissions")).toHaveText(
    "Verificados (sin herramientas)",
  );
  await screenshot("b4-dialog-conexion-light");

  // «Abrir navegador» sólo es accionable cuando el intento publica una URL.
  const openBrowser = dialog.getByTestId("agent-oauth-open");
  await expect(openBrowser).toBeDisabled();
  await dialog.getByTestId("agent-oauth-start").click();
  await expect(openBrowser).toBeEnabled();
  await expect(dialog.getByTestId("agent-oauth-url")).toContainText(
    "https://opencode.ai/console/device",
  );
  await dialog.getByTestId("agent-oauth-cancel").click();
  await expect(dialog.getByTestId("agent-oauth")).toHaveCount(0);

  // Escape cierra y devuelve el foco al disparador.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Tab repetido mantiene el foco dentro del dialog.
  await trigger.click();
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') !== null,
    );
    expect(inside).toBe(true);
  }

  // 7. Dark + cuenta/OAuth device.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByTestId("agent-status").click();
  await expect(dialog).toBeVisible();
  const account = dialog.getByTestId("agent-account");
  await expect(account).toContainText("demo@nrvn.local");
  await account.getByTestId("agent-oauth-start").click();
  await expect(dialog.getByTestId("agent-oauth-url")).toContainText(
    "https://opencode.ai/console/device",
  );
  await expect(dialog.getByTestId("agent-oauth-code")).toContainText("NRVN-MOCK");
  await expect(dialog.getByTestId("agent-oauth-waiting")).toContainText("Esperando autorización…");
  await screenshot("b4-dialog-oauth-dark");

  await expect(account.getByTestId("agent-account-status")).toHaveText("Conectado", {
    timeout: 20_000,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // 7b. Post-it en dark: nuevo documento (Meta+N) y contraste de la nota.
  await page.keyboard.press("Meta+n");
  await expect(note).toBeVisible();
  const postitDark = await note.evaluate((element) => {
    const style = getComputedStyle(element);
    const ok = element.querySelector(".editor-agent-note-ok");
    return {
      background: style.backgroundColor,
      pointerEvents: style.pointerEvents,
      tape: getComputedStyle(element, "::before").backgroundColor,
      okPointerEvents: ok instanceof HTMLElement ? getComputedStyle(ok).pointerEvents : null,
    };
  });
  expect(postitDark.background).toBe("rgb(59, 52, 35)");
  expect(postitDark.tape).not.toBe("rgba(0, 0, 0, 0)");
  expect(postitDark.tape).not.toBe("transparent");
  expect(postitDark.pointerEvents).toBe("none");
  expect(postitDark.okPointerEvents).toBe("auto");

  await page.getByRole("button", { name: "Cambiar a tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  // 8. Sin errores de página en todo el flujo.
  expect(pageErrors).toEqual([]);
});
