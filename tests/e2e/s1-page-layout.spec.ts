import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("S1 page presets, responsive canvas and resizable tree/outline", async ({ page }) => {
  const dir = path.join("artifacts", "screenshots", "s1");
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
  const sheet = page.locator('.document-sheet[data-mode="render"]');
  const capture = async (name: string) => page.screenshot({ path: path.join(dir, name) });
  await page.getByRole("button", { name: /Mostrar u ocultar agente/ }).click();

  const metrics = async () =>
    sheet.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        padding: parseFloat(style.paddingTop),
        radius: parseFloat(style.borderRadius),
        shadow: style.boxShadow,
        maxWidth: style.maxWidth,
      };
    });
  let value = await metrics();
  expect(value.width).toBeCloseTo(816, 0);
  expect(value.padding).toBe(96);
  expect(value.height).toBeGreaterThanOrEqual(1056);
  expect(value.maxWidth).toBe("816px");
  expect(value.radius).toBe(12);
  expect(value.shadow).not.toBe("none");
  const proseMetrics = await page.locator(".prose").evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    font: getComputedStyle(element).fontSize,
  }));
  expect(proseMetrics.width).toBeGreaterThanOrEqual(620);
  expect(proseMetrics.width).toBeLessThanOrEqual(630);
  expect(proseMetrics.font).toBe("16.5px");
  await capture("s1-carta-light.png");

  const chooseSize = async (name: string) => {
    await page.getByTestId("menu-view-trigger").click();
    await page.getByRole("menuitemradio", { name }).click();
  };
  await chooseSize("A4");
  value = await metrics();
  expect(value.width).toBeCloseTo(794, 0);
  expect(value.padding).toBe(94);
  await capture("s1-a4.png");
  await chooseSize("Ancha");
  value = await metrics();
  expect(value.width).toBeCloseTo(960, 0);
  expect(value.padding).toBe(96);
  await capture("s1-ancha.png");
  await chooseSize("Web");
  value = await metrics();
  const areaWidth = await page
    .locator(".document-area")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(Math.abs(value.width - areaWidth)).toBeLessThanOrEqual(2);
  expect(value.padding).toBe(48);
  await chooseSize("Carta");

  const scroller = page.locator("[data-document-scroll]");
  const anchorHeading = page.locator('[data-block-type="heading"]').nth(3);
  const anchorKey = await anchorHeading.getAttribute("data-block-key");
  await scroller.evaluate((element, key) => {
    const target = document.querySelector(`[data-block-key="${key}"]`);
    if (!target) throw new Error("No se encontró el heading de ancla");
    element.scrollTop += target.getBoundingClientRect().top - element.getBoundingClientRect().top;
  }, anchorKey);
  const renderScrollTop = await scroller.evaluate((element) => element.scrollTop);
  await page.keyboard.press("Meta+e");
  const editorScroller = page.locator(".cm-scroller");
  await expect
    .poll(() => editorScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.keyboard.press("Meta+e");
  await expect
    .poll(async () => {
      return scroller.evaluate((element, key) => {
        const target = document.querySelector(`[data-block-key="${key}"]`);
        return target
          ? Math.abs(target.getBoundingClientRect().top - element.getBoundingClientRect().top)
          : Infinity;
      }, anchorKey);
    })
    .toBeLessThanOrEqual(60);
  expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(renderScrollTop).toBeGreaterThan(0);
  expect(
    Math.abs((await scroller.evaluate((element) => element.scrollTop)) - renderScrollTop),
  ).toBeLessThanOrEqual(80);
  await page.getByRole("button", { name: /Mostrar u ocultar agente/ }).click();
  const responsive = async () => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const sheetBox = await sheet.boundingBox();
    const areaBox = await page.locator(".document-area").boundingBox();
    expect(sheetBox && areaBox && sheetBox.x - areaBox.x).toBeGreaterThanOrEqual(31);
    expect(
      sheetBox && areaBox && areaBox.x + areaBox.width - sheetBox.x - sheetBox.width,
    ).toBeGreaterThanOrEqual(31);
  };
  await responsive();

  const splitter = page.getByRole("separator", { name: /árbol y outline/ });
  await expect(splitter).toBeVisible();
  await expect(splitter).toHaveAttribute("aria-valuemin", "30");
  await expect(splitter).toHaveAttribute("aria-valuemax", "70");
  expect(
    await splitter.evaluate((element) => parseFloat(getComputedStyle(element, "::after").width)),
  ).toBeGreaterThan(0);
  const outline = page.locator(".outline-slot");
  const initialOutline = (await outline.boundingBox())?.height ?? 0;
  const splitBox = await splitter.boundingBox();
  if (!splitBox) throw new Error("No se encontró el splitter");
  await page.mouse.move(splitBox.x + splitBox.width / 2, splitBox.y + splitBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(splitBox.x + splitBox.width / 2, splitBox.y + splitBox.height / 2 - 100);
  await page.mouse.up();
  expect(((await outline.boundingBox())?.height ?? 0) - initialOutline).toBeGreaterThanOrEqual(80);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nrvn.mock.settings") ?? "{}"),
  );
  expect(saved.panelHeights.treeOutline).toBeGreaterThan(0.3);
  await splitter.focus();
  for (let index = 0; index < 20; index += 1) await page.keyboard.press("ArrowUp");
  await expect.poll(() => splitter.getAttribute("aria-valuenow")).toBe("30");
  const treeScroll = page.locator(".tree-scroll");
  await expect
    .poll(async () => {
      const outlineBox = await outline.boundingBox();
      const treeBox = await treeScroll.boundingBox();
      return Boolean(outlineBox && treeBox && outlineBox.height > treeBox.height);
    })
    .toBe(true);
  const list = page.locator(".outline-list");
  await expect(list.locator(".outline-item")).toHaveCount(8);
  await expect(list.locator(".outline-item:visible")).toHaveCount(8);
  await capture("s1-outline-ampliado.png");
  await splitter.dblclick();
  await expect
    .poll(async () => Math.abs(Number(await splitter.getAttribute("aria-valuenow")) - 50))
    .toBeLessThanOrEqual(1);

  expect(await treeScroll.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  // El splitter hasta el máximo de árbol deja el outline mínimo y desplazable.
  await page.setViewportSize({ width: 1400, height: 400 });
  await expect
    .poll(async () => Number(await splitter.getAttribute("aria-valuemax")))
    .toBeLessThan(70);
  const currentSplit = await splitter.boundingBox();
  if (!currentSplit) throw new Error("No se encontró el splitter");
  await page.mouse.move(currentSplit.x + 2, currentSplit.y + 2);
  await page.mouse.down();
  await page.mouse.move(currentSplit.x + 2, currentSplit.y + 2 + 10000);
  await page.mouse.up();
  await expect
    .poll(async () => {
      const now = await splitter.getAttribute("aria-valuenow");
      const max = await splitter.getAttribute("aria-valuemax");
      return now === max;
    })
    .toBe(true);
  const maxTreeHeight = await treeScroll.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  const availableZoneHeight = await treeScroll.evaluate((element) => {
    const panel = element.closest(".tree-panel");
    const header = panel?.querySelector(".tree-header");
    return (
      (panel?.getBoundingClientRect().height ?? 0) -
      (header?.getBoundingClientRect().height ?? 44) -
      6
    );
  });
  expect(maxTreeHeight).toBeGreaterThanOrEqual(120);
  expect(maxTreeHeight).toBeLessThanOrEqual(availableZoneHeight * 0.7 + 2);
  expect((await outline.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(120);
  await expect
    .poll(() => list.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(splitter).toBeVisible();
  await page.setViewportSize({ width: 880, height: 800 });
  await responsive();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  await capture("s1-dark.png");
  expect(pageErrors).toEqual([]);
});
