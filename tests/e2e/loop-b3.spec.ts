import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "loop-b3");
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

/** Ángulo (grados) extraído de la matriz de `transform`. */
function rotationDegrees(transform: string): number {
  const match = /matrix\(([^)]+)\)/.exec(transform);
  if (match === null) return 0;
  const [a, b] = match[1].split(",").map((value) => Number.parseFloat(value));
  return (Math.atan2(b, a) * 180) / Math.PI;
}

test("Loop B3: post-it, contexto documento, conector real y OAuth", async ({ page }) => {
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
  await expect(page.locator(".app-shell")).toBeVisible();

  const note = page.getByTestId("editor-agent-note");
  const renderView = page.locator('[data-testid="document-view"][data-mode="render"]');
  const markdownView = page.locator('[data-testid="document-view"][data-mode="markdown"]');

  // 1. Post-it sobre el documento vacío: contenido, roles y estilo exacto.
  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute("role", "note");
  await expect(note.locator("h2")).toHaveText("Editor Agentico");
  await expect(note).toContainText(
    "Pide a tu agente que edite el archivo, escribe, o selecciona secciones para trabajar con tu agente",
  );
  const okButton = note.getByRole("button", { name: "OK" });
  await expect(okButton).toBeVisible();
  const docKey = await note.getAttribute("data-doc-key");
  expect(docKey).toMatch(/^untitled-/);

  const noteMetrics = await note.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      border: style.borderTopColor,
      boxShadow: style.boxShadow,
      transform: style.transform,
      width: element.getBoundingClientRect().width,
      offsetWidth: element.offsetWidth,
    };
  });
  console.info("[B3] note metrics", JSON.stringify(noteMetrics));
  expect(noteMetrics.background).toBe("rgb(244, 239, 225)");
  expect(noteMetrics.border).toBe("rgb(231, 220, 194)");
  expect(noteMetrics.boxShadow).not.toBe("none");
  expect(rotationDegrees(noteMetrics.transform)).toBeCloseTo(-1.5, 0);
  expect(noteMetrics.offsetWidth).toBeGreaterThanOrEqual(320);
  expect(noteMetrics.offsetWidth).toBeLessThanOrEqual(340);
  await screenshot("b3-post-it");

  // 2. OK descarta la nota para este documento y persiste por docKey.
  await okButton.click();
  await expect(note).toHaveCount(0);
  await page.keyboard.press("Meta+e");
  await expect(markdownView).toBeVisible();
  await expect(note).toHaveCount(0);
  await page.keyboard.press("Meta+e");
  await expect(renderView).toBeVisible();
  await expect(note).toHaveCount(0);
  if (docKey === null) throw new Error("La nota no expone data-doc-key");
  const stored = await page.evaluate(
    (key) => localStorage.getItem(`nrvn.agent-note.dismissed.${key}`),
    docKey,
  );
  expect(stored).toBe("1");

  // Documento nuevo (nuevo localId): la nota reaparece.
  await page.keyboard.press("Meta+n");
  await expect(note).toBeVisible();
  const newDocKey = await note.getAttribute("data-doc-key");
  expect(newDocKey).toMatch(/^untitled-/);
  expect(newDocKey).not.toBe(docKey);

  // En Markdown, Escape dentro del contenteditable del editor no descarta la
  // nota: la tecla pertenece a CodeMirror mientras se escribe.
  await page.keyboard.press("Meta+e");
  await expect(markdownView).toBeVisible();
  await expect(note).toBeVisible();
  await page.locator(".cm-content").click();
  const focusInNote = await page.evaluate(
    () => document.activeElement?.closest('[data-testid="editor-agent-note"]') !== null,
  );
  expect(focusInNote).toBe(false);
  await page.keyboard.press("Escape");
  await expect(note).toBeVisible();
  // OK la descarta y persiste el descarte por documento.
  await note.getByRole("button", { name: "OK" }).click();
  await expect(note).toHaveCount(0);
  if (newDocKey === null) throw new Error("La nota nueva no expone data-doc-key");
  const storedEscape = await page.evaluate(
    (key) => localStorage.getItem(`nrvn.agent-note.dismissed.${key}`),
    newDocKey,
  );
  expect(storedEscape).toBe("1");

  // Vuelta a Render con el documento vacío y el post-it descartado.
  await page.keyboard.press("Meta+e");
  await expect(renderView).toBeVisible();

  // 3. Documento vacío: chip, composer habilitado y propuesta de documento.
  const agentStatus = page.getByTestId("agent-status");
  await expect(agentStatus).toHaveAttribute("data-status", "ready", { timeout: 20_000 });

  const chip = page.getByTestId("selection-badge");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("data-context-mode", "document");
  await expect(chip).toHaveAttribute("data-block-count", "0");
  await expect(chip.locator(".agent-context-title")).toHaveText("Editando documento completo");

  const composer = page.getByTestId("agent-composer");
  await expect(composer).toBeEnabled();
  await expect(composer).toHaveAttribute("placeholder", "Pide al agente que escriba…");
  await composer.fill("Escribe una introducción breve.");
  await expect(page.getByTestId("agent-send")).toBeEnabled();
  await page.waitForTimeout(250);
  await screenshot("b3-empty-document-composer");

  await page.getByTestId("agent-send").click();
  const proposal = page.getByTestId("agent-proposal");
  await expect(proposal).toHaveCount(1, { timeout: 20_000 });
  await expect(proposal).toHaveAttribute("data-kind", "document");
  await expect(proposal.locator(".agent-proposal-title")).toHaveText(
    "Propuesta · Documento completo",
  );
  await expect(proposal.locator(".agent-diff-line.diff-add").first()).toBeVisible();
  await expect(page.getByTestId("agent-proposal-accept")).toHaveText(/Aceptar documento/);
  const assistantMessages = page.locator('.agent-message[data-role="assistant"]');
  const proposalMessage = assistantMessages.last();
  await expect(proposalMessage).toContainText(
    "Propuesta de documento completo lista. Revísala en la tarjeta.",
  );
  // El chat resume el turno: el documento completo vive solo en la tarjeta.
  await expect(proposalMessage).not.toContainText("Documento creado por el agente");
  await screenshot("b3-document-proposal");

  // Autoscroll: tras enviar un turno, el último mensaje/propuesta queda al
  // fondo sin scroll manual (el usuario estaba al fondo al enviar).
  const conversation = page.locator(".agent-conversation");
  await expect
    .poll(
      async () =>
        await conversation.evaluate(
          (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
      { timeout: 5_000 },
    )
    .toBeLessThan(48);
  await expect(proposal).toBeInViewport();

  await page.getByTestId("agent-proposal-accept").click();
  await expect(proposal).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(".prose")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("empty-document")).toHaveCount(0);
  await expect(assistantMessages.last()).toContainText("Documento completo aplicado.");
  await expect(assistantMessages.last()).not.toContainText("Documento creado por el agente");

  // 4. El dialog «Conexión y cuenta» concentra agentes y modelos del catálogo.
  await page.getByTestId("agent-settings-trigger").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const account = dialog.getByTestId("agent-account");
  await expect(dialog.getByTestId("agent-mode")).toHaveValue("auto");
  await expect(dialog.getByTestId("agent-agent")).toHaveValue("build");
  const meta = dialog.getByTestId("agent-connection-meta");
  await expect(meta).toContainText("Servicio local");
  await expect(meta).toContainText(/\d+ agentes · \d+ modelos/);
  // La cuenta vive en su sección: no se duplica en la meta de conexión.
  await expect(meta).not.toContainText("demo@nrvn.local");

  const agentOptions = await dialog.getByTestId("agent-agent").locator("option").allTextContents();
  for (const name of ["loop", "build", "plan"]) expect(agentOptions).toContain(name);
  const modelOptions = await dialog.getByTestId("agent-model").locator("option").allTextContents();
  expect(modelOptions).toContain("DeepSeek V4.1 Flash");
  await expect(account).toContainText("demo@nrvn.local");
  await screenshot("b3-panel-real-agents");

  // 5. Cuenta y OAuth device: URL, código, polling y cuenta sin tokens.
  await expect(account.getByTestId("agent-account-status")).toHaveText("Conectado");
  await expect(account.getByTestId("agent-oauth-start")).toHaveText("Reconectar cuenta");
  await screenshot("b3-account-settings");

  await account.getByTestId("agent-oauth-start").click();
  const oauthUrl = dialog.getByTestId("agent-oauth-url");
  await expect(oauthUrl).toBeVisible();
  await expect(oauthUrl).toContainText("https://opencode.ai/console/device");
  await expect(dialog.getByTestId("agent-oauth-code")).toContainText("NRVN-MOCK");
  await expect(dialog.getByTestId("agent-oauth-cancel")).toBeVisible();
  await screenshot("b3-oauth");

  await expect(account.getByTestId("agent-account-status")).toHaveText("Conectado", {
    timeout: 20_000,
  });
  await expect(account).toContainText("demo@nrvn.local");
  // biome-ignore lint/performance/useDomNodeTextContent: innerText refleja solo lo visible.
  const accountText = (await account.innerText()).toLowerCase();
  for (const secret of ["token", "secret", "bearer"]) {
    expect(accountText).not.toContain(secret);
  }

  // Cerrar el dialog antes de las comprobaciones de altura baja del panel.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Con poca altura, el composer sigue alcanzable:
  // el panel scrollea completo (header y composer fijos) y la acción Enviar
  // queda entera dentro del viewport junto al chip.
  await page.setViewportSize({ width: 1400, height: 620 });
  const panel = page.locator(".agent-panel");
  await panel.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const actions = page.locator(".agent-composer-actions");
  const sendButton = page.getByTestId("agent-send");
  await expect(actions).toBeVisible();
  await expect(sendButton).toBeVisible();
  const actionsBox = await actions.boundingBox();
  expect(actionsBox).not.toBeNull();
  expect((actionsBox?.y ?? 0) + (actionsBox?.height ?? 0)).toBeLessThanOrEqual(620);
  const sendBox = await sendButton.boundingBox();
  expect(sendBox).not.toBeNull();
  expect((sendBox?.y ?? 0) + (sendBox?.height ?? 0)).toBeLessThanOrEqual(620);
  const firstMessage = page.locator(".agent-message").first();
  await expect(firstMessage).toBeVisible();
  const messageBox = await firstMessage.boundingBox();
  expect(messageBox).not.toBeNull();
  expect(messageBox?.height ?? 0).toBeGreaterThan(0);
  // El chip y el composer quedan completos al final del scroll del panel.
  const chipBox = await chip.boundingBox();
  expect(chipBox).not.toBeNull();
  expect(chipBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((chipBox?.y ?? 0) + (chipBox?.height ?? 0)).toBeLessThanOrEqual(620);
  await expect(conversation).toBeVisible();
  const conversationBox = await conversation.boundingBox();
  expect(conversationBox).not.toBeNull();
  expect(conversationBox?.height ?? 0).toBeGreaterThanOrEqual(80);
  await screenshot("b3-panel-low-height-account");
  await page.setViewportSize({ width: 1400, height: 900 });

  // 6. Documento con contenido: contexto completo, Cmd+A y selección real.
  await openWorkspaceAndDocument(page);
  // Abrir un archivo desde el árbol carga su propio hilo: el turno del borrador
  // (y su resumen «Documento completo aplicado.») no puede arrastrarse.
  await expect(page.locator(".agent-panel")).not.toContainText("Documento completo aplicado.");
  await expect(page.locator(".agent-message")).toHaveCount(0);
  await expect(chip).toHaveAttribute("data-context-mode", "document");
  await expect(chip).toHaveAttribute("data-block-count", "0");
  await expect(chip.locator(".agent-context-title")).toHaveText("Editando documento completo");
  await expect(composer).toBeEnabled();

  // Selección parcial: un párrafo concreto cambia el alcance a `selection`.
  const paragraph = page.locator('.prose [data-block-type="paragraph"]').first();
  await paragraph.click();
  await expect(chip).toHaveAttribute("data-context-mode", "selection");
  await expect(chip).toHaveAttribute("data-block-count", "1");

  // Cmd+A real vuelve a documento completo (todos los bloques cubiertos).
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+a");
  await expect(chip).toHaveAttribute("data-context-mode", "document");
  await expect(chip).toHaveAttribute("data-block-count", "0");

  await paragraph.click();
  await expect(chip).toHaveAttribute("data-context-mode", "selection");
  await expect(chip).toHaveAttribute("data-block-count", "1");
  await expect(chip.locator(".agent-context-title")).toHaveText(/^Editando párrafo: /);

  // A 620 de alto, con la cuenta abierta y la selección activa, el panel
  // scrollea completo: el chip y Enviar quedan
  // íntegros en viewport y el header permanece fijo.
  await page.setViewportSize({ width: 1400, height: 620 });
  // Con contenido que cabe, no hay scroll que forzar; las aserciones de
  // visibilidad que siguen siguen validando el AC.
  const overflow = await panel.evaluate((el) => el.scrollHeight - el.clientHeight);
  if (overflow > 0) {
    await panel.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect
      .poll(async () => panel.evaluate((el) => el.scrollTop), { timeout: 5_000 })
      .toBeGreaterThan(0);
  }
  expect(overflow).toBeGreaterThanOrEqual(0);
  const chipBoxLow = await chip.boundingBox();
  expect(chipBoxLow).not.toBeNull();
  expect(chipBoxLow?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((chipBoxLow?.y ?? 0) + (chipBoxLow?.height ?? 0)).toBeLessThanOrEqual(620);
  await expect(sendButton).toBeVisible();
  const sendBoxLow = await sendButton.boundingBox();
  expect(sendBoxLow).not.toBeNull();
  expect((sendBoxLow?.y ?? 0) + (sendBoxLow?.height ?? 0)).toBeLessThanOrEqual(620);
  const headerBoxLow = await page.locator(".agent-header").boundingBox();
  const panelBoxLow = await panel.boundingBox();
  expect(headerBoxLow).not.toBeNull();
  expect(panelBoxLow).not.toBeNull();
  expect(headerBoxLow?.y ?? -1).toBeCloseTo(panelBoxLow?.y ?? -2, 0);
  await screenshot("b3-composer-low-height");
  await page.setViewportSize({ width: 1400, height: 900 });

  await expect(composer).toHaveAttribute("placeholder", "Pide un cambio sobre la selección");

  await composer.fill("Haz este párrafo más directo.");
  await page.getByTestId("agent-send").click();
  const blockProposal = page.getByTestId("agent-proposal");
  await expect(blockProposal).toHaveCount(1, { timeout: 20_000 });
  await expect(blockProposal).toHaveAttribute("data-kind", "blocks");
  await expect(blockProposal.locator(".agent-proposal-title")).toHaveText("Propuesta · 1 bloque");
  await expect(page.locator('[data-previewing="true"]')).toBeVisible();
  await expect(blockProposal).toHaveAttribute("data-kind", "blocks");
  await expect(blockProposal.locator(".agent-proposal-title")).toHaveText("Propuesta · 1 bloque");
  await expect(blockProposal.getByTestId("agent-proposal-goto-inline")).toBeVisible();

  // 7. Sin errores de página en todo el flujo.
  expect(pageErrors).toEqual([]);
});
