import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("S3 exporta e importa metadatos desde Archivo", async ({ page }) => {
  const dir = path.join("artifacts", "screenshots", "s3");
  fs.mkdirSync(dir, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();

  const capture = (name: string) => page.screenshot({ path: path.join(dir, name) });
  await page.getByTestId("menu-file-trigger").click();
  await expect(page.getByText("Exportar metadatos…")).toBeVisible();
  await expect(page.getByText("Importar metadatos…")).toBeVisible();
  await capture("menu-archivo.png");
  await page.getByText("Exportar metadatos…").click();
  await expect(page.getByText(/Metadatos exportados/)).toBeVisible();
  await capture("export-toast.png");
  await page.getByTestId("menu-file-trigger").click();
  await page.getByText("Importar metadatos…").click();
  const dialog = page.getByTestId("metadata-import-dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("El archivo .nrvn puede contener texto de tus conversaciones."),
  ).toBeVisible();
  await capture("dialogo-importacion.png");
  await page.getByTestId("metadata-import-confirm").click();
  await expect(page.getByText(/Metadatos importados/)).toBeVisible();
  expect(pageErrors).toEqual([]);
});
