import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "audit2");
test.use({ viewport: { width: 1400, height: 900 } });

async function openDocument(page: import("@playwright/test").Page): Promise<void> {
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await expect(page.getByRole("tree", { name: /Archivos Markdown/ })).toBeVisible();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.getByTestId("doc-title")).toContainText("guia-estilo.md");
}

test("Audit2: toast accionable permanece visible y se puede cerrar", async ({ page }) => {
  test.setTimeout(90000);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.goto("/");
  await openDocument(page);
  const block = page.locator('.prose .block[data-block-type="code"]').first();
  await block.click({ button: "right" });
  const contextMenu = page.getByTestId("block-context-menu");
  await expect(contextMenu).toBeVisible();
  await contextMenu.getByRole("menuitem", { name: "Eliminar bloque" }).click();
  const toast = page.locator(".toast");
  await expect(toast).toContainText("deshacer");
  await expect(toast).toHaveAttribute("role", "status");
  await expect(toast.getByTestId("toast-close")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS_DIR, "toast-actionable.png") });
  await page.waitForTimeout(2500);
  await expect(toast).toBeVisible();
  await toast.hover();
  await page.waitForTimeout(4500);
  await expect(toast).toBeVisible();
  await toast.getByTestId("toast-close").click();
  await expect(toast).toHaveCount(0);
});

test("Audit2: onboarding CTA crea un borrador", async ({ page }) => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.goto("/");
  await page.getByTestId("menu-view-trigger").click();
  await page.getByRole("menuitem", { name: "Guía rápida" }).click();
  await expect(page.getByTestId("onboarding-dialog")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS_DIR, "onboarding-cta.png") });
  await page.getByRole("button", { name: "Empezar con un borrador" }).click();
  await expect(page.getByTestId("doc-title")).toHaveText("Sin título");
  await expect(page.getByTestId("onboarding-dialog")).toHaveCount(0);
});
