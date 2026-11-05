import fs, { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

test("Electron guarda markdown y persiste metadata al reiniciar", async () => {
  test.setTimeout(180_000);
  const temporary = mkdtempSync(join(tmpdir(), "nrvn-e2e-"));
  const workspace = join(temporary, "workspace");
  const userData = join(temporary, "userData");
  mkdirSync(workspace);
  mkdirSync(userData);
  writeFileSync(join(workspace, "nota.md"), "# Nota\nContenido inicial.\n");
  writeFileSync(join(workspace, "otra.md"), "# Otra\nDocumento distinto.\n");
  writeFileSync(join(userData, "settings.json"), JSON.stringify({ onboarding: { done: true } }));
  const main = resolve("artifacts/electron-app/main/index.js");
  const launch = () =>
    electron.launch({
      args: [main, `--user-data-dir=${userData}`],
      env: { ...process.env },
    });
  const stubDialogs = async (app: Awaited<ReturnType<typeof launch>>) => {
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: `${dir}/nota.md.nrvn` });
      dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    }, workspace);
  };
  const openNote = async (app: Awaited<ReturnType<typeof launch>>) => {
    const page = await app.firstWindow();
    // En runners de CI la pantalla puede ser menor y los paneles tapan el header.
    await app.evaluate(({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows();
      win?.setSize(1600, 1000);
    });
    await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();
    await page
      .getByRole("button", { name: /Abrir carpeta/ })
      .first()
      .click();
    await page.locator('[role="treeitem"][data-path="nota.md"]').click();
    await expect(page.getByTestId("doc-title")).toContainText("nota.md");
    return page;
  };

  let app: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    app = await launch();
    expect(fs.realpathSync(await app.evaluate(({ app }) => app.getPath("userData")))).toBe(
      fs.realpathSync(userData),
    );
    await stubDialogs(app);
    const page = await openNote(app);
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+e`);
    await expect(page.locator(".cm-content")).toBeVisible();
    await page.locator(".cm-content").click();
    await page.keyboard.press(`${modifier}+ArrowDown`);
    await page.keyboard.type(" editado-en-electron");
    await expect(page.locator(".cm-content")).toContainText("editado-en-electron");
    await expect(page.getByTestId("save-state")).toHaveText("Sin guardar");
    await expect(page.getByTestId("save-state")).toHaveText("Guardado", { timeout: 5_000 });
    // En pantallas pequeñas el panel de agente tapa el header; se oculta para el zoom.
    const agentToggle = page.getByRole("button", { name: /Mostrar u ocultar agente/ });
    if ((await agentToggle.getAttribute("aria-pressed")) === "true") await agentToggle.click();
    await page.getByTestId("page-zoom-in").click();
    await expect(page.getByTestId("page-zoom-reset")).toHaveText("110%");
    await page.locator('[role="treeitem"][data-path="otra.md"]').click();
    await expect(page.getByTestId("doc-title")).toContainText("otra.md");
    await expect(page.getByTestId("page-zoom-reset")).toHaveText("110%");
    await page.locator('[role="treeitem"][data-path="nota.md"]').click();
    await expect(page.getByTestId("doc-title")).toContainText("nota.md");
    mkdirSync(resolve("artifacts/screenshots/electron-e2e"), { recursive: true });
    await page.screenshot({ path: resolve("artifacts/screenshots/electron-e2e/after-save.png") });
    expect(readFileSync(join(workspace, "nota.md"), "utf8")).toContain("editado-en-electron");

    await page.getByTestId("menu-file-trigger").click();
    await page.getByText("Exportar metadatos…").click();
    await expect(page.getByText(/Metadatos exportados/)).toBeVisible();
    const sidecar = join(workspace, "nota.md.nrvn");
    expect(fs.existsSync(sidecar)).toBe(true);
    expect(JSON.parse(readFileSync(sidecar, "utf8")).format).toBe("nrvn.metadata");
    await app.close();
    app = undefined;

    // Relaunch with the same profile to prove persistence across process lifetime.
    app = await launch();
    await stubDialogs(app);
    const reopened = await openNote(app);
    await expect(reopened.locator(".prose")).toContainText("editado-en-electron");
    await expect(reopened.getByTestId("page-zoom-reset")).toHaveText("110%");
    expect(fs.existsSync(sidecar)).toBe(true);
  } finally {
    if (app) await app.close();
  }
});
