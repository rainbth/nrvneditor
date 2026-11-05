import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("S0-S1 startup, page layouts, splitter, theme and About", async ({ page }) => {
  const dir = path.join("artifacts", "screenshots", "s0-s1");
  fs.mkdirSync(dir, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  const titlebarVersion = page.getByTestId("titlebar-version");
  const version = await titlebarVersion.textContent();
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  // P2: con el panel de agente abierto a 1400 px no debe haber scroll horizontal.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Cierra el agente para medir la hoja a su ancho exacto de preset.
  await page.getByRole("button", { name: /Mostrar u ocultar agente/ }).click();
  const sheet = page.locator('.document-sheet[data-mode="render"]');
  const capture = async (name: string) => page.screenshot({ path: path.join(dir, name) });
  const metrics = async () =>
    sheet.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        paddingTop: Number.parseFloat(style.paddingTop),
        maxWidth: style.maxWidth,
      };
    });

  let value = await metrics();
  expect(value.width).toBeCloseTo(816, 0);
  expect(value.paddingTop).toBe(96);
  expect(value.maxWidth).toBe("816px");
  expect(value.height).toBeGreaterThanOrEqual(1056);
  await capture("carta-light.png");

  const chooseSize = async (name: string) => {
    await page.getByTestId("menu-view-trigger").click();
    await page.getByRole("menuitemradio", { name }).click();
  };
  await chooseSize("A4");
  value = await metrics();
  expect(value.width).toBeCloseTo(794, 0);
  expect(value.paddingTop).toBe(94);
  await capture("a4.png");
  await chooseSize("Ancha");
  value = await metrics();
  expect(value.width).toBeCloseTo(960, 0);
  await capture("ancha.png");
  await chooseSize("Web");
  value = await metrics();
  const areaWidth = await page
    .locator(".document-area")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(Math.abs(value.width - areaWidth)).toBeLessThanOrEqual(2);
  expect(value.paddingTop).toBe(48);
  await chooseSize("Carta");

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const splitter = page.getByRole("separator", { name: /árbol y outline/ });
  const outline = page.locator(".outline-slot");
  const initialOutlineHeight = (await outline.boundingBox())?.height ?? 0;
  const splitterBox = await splitter.boundingBox();
  if (!splitterBox) throw new Error("No se encontró el splitter");
  await page.mouse.move(
    splitterBox.x + splitterBox.width / 2,
    splitterBox.y + splitterBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    splitterBox.x + splitterBox.width / 2,
    splitterBox.y + splitterBox.height / 2 - 100,
  );
  await page.mouse.up();
  expect(((await outline.boundingBox())?.height ?? 0) - initialOutlineHeight).toBeGreaterThan(0);
  await capture("outline-ampliado.png");
  await splitter.dblclick();
  await expect
    .poll(async () => Math.abs(Number(await splitter.getAttribute("aria-valuenow")) - 50))
    .toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  await capture("dark.png");
  await page.getByTestId("menu-view-trigger").click();
  await page.getByRole("menuitem", { name: "Acerca de nrvn" }).click();
  const about = page.getByTestId("about-dialog");
  await expect(about).toBeVisible();
  await expect(page.getByTestId("about-version")).toHaveText(version!);
  await expect(page.getByTestId("about-features")).toBeVisible();
  await expect(page.getByTestId("about-feature")).toHaveCount(9);
  await expect(page.getByTestId("about-commit")).toHaveText("dev");
  await capture("about.png");
  await page.getByRole("button", { name: "Cerrar" }).click();
  await expect(about).toBeHidden();
  expect(pageErrors).toEqual([]);
});
