import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS_DIR = path.join("artifacts", "screenshots", "b6");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1400, height: 900 } });

async function openDocument(page: Page): Promise<void> {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  const tree = page.getByRole("tree", { name: /Archivos Markdown/ });
  await tree.waitFor({ state: "visible", timeout: 1500 }).catch(() => {});
  if (!(await tree.isVisible().catch(() => false))) {
    const toggle = page.getByRole("button", { name: /Mostrar u ocultar el árbol/ });
    const pressed = await toggle.getAttribute("aria-pressed").catch(() => null);
    if (pressed !== "true") await toggle.click();
  }
  await expect(tree).toBeVisible();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.getByTestId("doc-title")).toContainText("guia-estilo.md");
  await expect(page.locator(".prose")).toBeVisible();
}

test("B6: la burbuja reserva espacio sin cubrir el inserto y permanece estable", async ({
  page,
}) => {
  test.setTimeout(240_000);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await openDocument(page);
  const scroller = page.locator("[data-document-scroll]");
  const scrollBy = (delta: number) =>
    scroller.evaluate((el, dy) => {
      el.scrollTop += dy;
    }, delta);
  const blocks = page.locator('.prose [data-block-type="paragraph"]');
  const block = blocks.nth(1);
  await block.evaluate((element) => {
    const scrollContainer = element.closest("[data-document-scroll]");
    if (!(scrollContainer instanceof HTMLElement))
      throw new Error("No se encontró el scroller del documento");
    scrollContainer.scrollTop +=
      element.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top;
  });
  // Shift+click selects the rendered block without entering inline edit mode,
  // keeping that block's FloatingInsert mounted beside the bubble.
  await block.click({ modifiers: ["Shift"] });
  const enteringAnimations = await block.evaluate((el) =>
    el.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty),
  );
  expect(
    enteringAnimations.some(
      (property) => property === "margin-top" || property === "margin-bottom",
    ),
  ).toBe(true);
  const bubble = page.getByTestId("block-bubble");
  const immediate = await page.evaluate(
    () =>
      new Promise<{ visible: boolean; bottom: number; activeTop: number }>((resolve) =>
        requestAnimationFrame(() => {
          const b = document.querySelector<HTMLElement>("[data-testid=block-bubble]");
          const a = document.querySelector<HTMLElement>(".prose .block[data-bubble-reserve]");
          const br = b?.getBoundingClientRect();
          const ar = a?.getBoundingClientRect();
          resolve({
            visible: !!b && getComputedStyle(b).visibility !== "hidden",
            bottom: br?.bottom ?? 0,
            activeTop: ar?.top ?? 0,
          });
        }),
      ),
  );
  expect(!immediate.visible || immediate.bottom <= immediate.activeTop + 2).toBe(true);
  await expect(bubble).toBeVisible();
  await expect(block).toHaveAttribute("data-bubble-reserve", /above|below/);
  await page.waitForTimeout(250);
  const selectedStyle = await block.evaluate((el) => {
    const style = getComputedStyle(el);
    const band = getComputedStyle(el, "::after");
    return {
      transitions: style.transitionProperty.split(",").map((part) => part.trim()),
      bandBackground: band.backgroundColor,
      bandRadius: band.borderRadius,
    };
  });
  expect(selectedStyle.transitions).toEqual(
    expect.arrayContaining(["margin-top", "margin-bottom"]),
  );
  expect(selectedStyle.bandBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(selectedStyle.bandRadius).toContain("5px");
  await expect(bubble).toHaveAttribute("data-revealed", "true");
  const geometry = async () =>
    page.evaluate(() => {
      const active = document.querySelector<HTMLElement>(".prose .block[data-bubble-reserve]");
      const toolbar = document.querySelector<HTMLElement>("[data-testid=block-bubble]");
      if (!active || !toolbar) throw new Error("No se encontró bloque reservado o burbuja");
      const previousBlock = active.previousElementSibling as HTMLElement;
      const bubbleRect = toolbar.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const previousRect = previousBlock.getBoundingClientRect();
      const reserveValue = active.dataset.bubbleReserveValue;
      const add = active.querySelector<HTMLElement>(".floating-insert");
      const button = add?.querySelector<HTMLElement>("[data-testid=floating-insert-trigger]");
      const line = add?.querySelector<HTMLElement>(".floating-insert-line");
      if (!add || !button || !line) throw new Error("No se encontró el inserto flotante");
      return {
        bubbleTop: bubbleRect.top,
        bubbleBottom: bubbleRect.bottom,
        activeTop: activeRect.top,
        previousBottom: previousRect.bottom,
        reserveValue,
        blockCenter: activeRect.left + activeRect.width / 2,
        buttonCenter:
          button.getBoundingClientRect().left + button.getBoundingClientRect().width / 2,
        lineCenter: line.getBoundingClientRect().left + line.getBoundingClientRect().width / 2,
      };
    });
  await expect(page.locator(".floating-insert").last()).toBeVisible();
  const initial = await geometry();
  expect(initial.bubbleBottom).toBeLessThanOrEqual(initial.activeTop + 2);
  expect(initial.bubbleTop).toBeGreaterThanOrEqual(initial.previousBottom - 2);
  expect(Math.abs(initial.buttonCenter - initial.blockCenter)).toBeLessThanOrEqual(2);
  expect(Math.abs(initial.lineCenter - initial.blockCenter)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: path.join(SHOTS_DIR, "paragraph-bubble.png") });
  await page.screenshot({ path: path.join(SHOTS_DIR, "centered-insert.png") });

  const trigger = block.getByTestId("floating-insert-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("menuitem", { name: "Párrafo" })).toBeVisible();
  await page.keyboard.press("Escape");

  const stable = [];
  for (let index = 0; index < 3; index += 1) {
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
    await page.waitForTimeout(80);
    stable.push(await geometry());
  }
  for (const value of stable) {
    expect(value.reserveValue).toBe(initial.reserveValue);
    expect(value.bubbleTop).toBe(initial.bubbleTop);
  }

  // Put the selected non-first block genuinely below the threshold, then
  // cross it in small upward scroll increments.
  const prevBottom = await block.evaluate(
    (element) => (element.previousElementSibling as HTMLElement).getBoundingClientRect().bottom,
  );
  await scrollBy(prevBottom + 40);
  await expect(block).toHaveAttribute("data-bubble-reserve", "below");
  await expect
    .poll(
      async () => {
        const b = await bubble.boundingBox();
        const p = await block.getByTestId("floating-insert-trigger").boundingBox();
        if (!b || !p) return -1;
        return Math.abs(b.y - (p.y + p.height + 16));
      },
      { timeout: 2000 },
    )
    .toBeLessThanOrEqual(2);
  const belowBubble = await bubble.boundingBox();
  const plus = await block.getByTestId("floating-insert-trigger").boundingBox();
  if (!belowBubble || !plus) throw new Error("No se pudo medir burbuja/inserto bajo el borde");
  expect(belowBubble.y).toBeGreaterThanOrEqual(plus.y + plus.height + 16 - 2);
  expect(belowBubble.y).toBeLessThanOrEqual(plus.y + plus.height + 16 + 2);
  const followingTop = await block.evaluate(
    (element) =>
      (element.nextElementSibling as HTMLElement | null)?.getBoundingClientRect().top ?? Infinity,
  );
  expect(belowBubble.y + belowBubble.height).toBeLessThanOrEqual(followingTop - 16 + 2);
  await page.screenshot({ path: path.join(SHOTS_DIR, "top-edge-bubble-below.png") });
  const sweep: Array<{ placement: string | null; value: string | null }> = [];
  for (let index = 0; index < 12; index += 1) {
    await scrollBy(-8);
    await page.waitForTimeout(60);
    sweep.push(
      await block.evaluate((element) => ({
        placement: element.getAttribute("data-bubble-reserve"),
        value: element.getAttribute("data-bubble-reserve-value"),
      })),
    );
  }
  let placementChanges = 0;
  for (let index = 1; index < sweep.length; index += 1) {
    if (sweep[index]?.placement !== sweep[index - 1]?.placement) placementChanges += 1;
  }
  expect(placementChanges).toBeLessThanOrEqual(1);
  if (placementChanges === 1) {
    expect(
      sweep.find((value, index) => index > 0 && value.placement !== sweep[index - 1]?.placement)
        ?.placement,
    ).toBe("above");
    expect(sweep[0]?.placement).toBe("below");
  }
  const finalThree = sweep.slice(-3);
  expect(finalThree[0]?.placement).toBe(finalThree[1]?.placement);
  expect(finalThree[1]?.placement).toBe(finalThree[2]?.placement);
  expect(finalThree[0]?.value).toBe(finalThree[1]?.value);
  expect(finalThree[1]?.value).toBe(finalThree[2]?.value);
  const expectedAmounts = await block.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>("[data-testid=block-bubble]");
    const token =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--bubble-reserve"),
      ) || 48;
    const needed = Math.max(token, (toolbar?.offsetHeight ?? 0) + 32);
    const active = document.querySelector<HTMLElement>(".prose .block[data-bubble-reserve]");
    const activeRect = active?.getBoundingClientRect();
    const insert = active?.querySelector<HTMLElement>(".floating-insert");
    const strip =
      activeRect && insert
        ? Math.max(0, insert.getBoundingClientRect().bottom - activeRect.bottom)
        : 0;
    return { needed, below: needed + strip };
  });
  for (const entry of sweep) {
    if (entry.placement === "above") expect(Number(entry.value)).toBe(expectedAmounts.needed);
    if (entry.placement === "below") expect(Number(entry.value)).toBe(expectedAmounts.below);
  }

  // Inline editing removes FloatingInsert; the strip must be constant, so
  // entering edit mode cannot change the document rhythm.
  await page.keyboard.press("Escape");
  const paddingBeforeEdit = await block.evaluate((el) => getComputedStyle(el).paddingBottom);
  await block.click();
  await expect(block).toBeFocused();
  await expect(block.locator(".floating-insert")).toHaveCount(0);
  const paddingAfterEdit = await block.evaluate((el) => getComputedStyle(el).paddingBottom);
  expect(paddingAfterEdit).toBe(paddingBeforeEdit);
  expect(paddingBeforeEdit).toBe("22px");
  const inlineTop = await block.evaluate((element) => element.getBoundingClientRect().top);
  await scrollBy(inlineTop - 4);
  await expect(block).toHaveAttribute("data-bubble-reserve", "below");
  const inlineGeometry = await page.evaluate(() => {
    const active = document.querySelector<HTMLElement>(".prose .block[data-bubble-reserve]");
    const toolbar = document.querySelector<HTMLElement>("[data-testid=block-bubble]");
    if (!active || !toolbar) throw new Error("No se encontró la burbuja inline");
    const blockRect = active.getBoundingClientRect();
    return {
      top: toolbar.getBoundingClientRect().top,
      bottom: blockRect.bottom,
      value: Number(active.dataset.bubbleReserveValue),
      needed: Math.max(
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--bubble-reserve"),
        ) || 48,
        toolbar.offsetHeight + 32,
      ),
    };
  });
  expect(inlineGeometry.top).toBeGreaterThanOrEqual(inlineGeometry.bottom - 1);
  expect(inlineGeometry.value).toBe(inlineGeometry.needed);

  const top = await block.evaluate((element) => element.getBoundingClientRect().top);
  await scrollBy(top - 420);
  await expect(block).toHaveAttribute("data-bubble-reserve", "above");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.keyboard.press("Escape");
  await block.click({ modifiers: ["Shift"] });
  await expect(bubble).toBeVisible();
  await expect(block).toHaveAttribute("data-bubble-reserve", /above|below/, { timeout: 5000 });
  const placement = await block.getAttribute("data-bubble-reserve");
  expect(["above", "below"]).toContain(placement);
  // The deterministic scroll leaves ample viewport space above this block.
  expect(placement).toBe("above");
  const aboveNeeded = await block.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>("[data-testid=block-bubble]");
    const token = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--bubble-reserve"),
    );
    return Math.max(token || 48, (toolbar?.offsetHeight ?? 0) + 32);
  });
  expect(Number(await block.getAttribute("data-bubble-reserve-value"))).toBe(aboveNeeded);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const motion = await page
    .locator(".prose .block[data-bubble-reserve]")
    .evaluate((element) => getComputedStyle(element).getPropertyValue("--motion-base").trim());
  expect(motion).toBe("0ms");
});

test("B6: el inserto `+` sigue clicable en multiselección", async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await openDocument(page);
  const blocks = page.locator(".prose [data-block-index]");
  const lower = blocks.nth(2);
  const upper = blocks.nth(1);
  // Shift+clic hacia arriba: el ancla es el bloque inferior y el activo queda en
  // medio del grupo, con un hermano posterior seleccionado que pinta su relleno
  // por encima del contexto de apilamiento del activo.
  await lower.click({ modifiers: ["Shift"] });
  await upper.click({ modifiers: ["Shift"] });
  await expect(upper).toHaveAttribute("data-selected", "true");
  await expect(lower).toHaveAttribute("data-selected", "true");
  // Lleva el bloque activo justo bajo el umbral: con la reserva `below` el
  // relleno del siguiente bloque seleccionado se extiende sobre el hueco
  // reservado, que es donde el `+` quedaba tapado.
  const scroller = page.locator("[data-document-scroll]");
  const prevBottom = await upper.evaluate(
    (element) => (element.previousElementSibling as HTMLElement).getBoundingClientRect().bottom,
  );
  await scroller.evaluate((element, delta) => {
    element.scrollTop += delta;
  }, prevBottom + 40);
  await expect(upper).toHaveAttribute("data-bubble-reserve", "below");
  const marginDuration = await upper.evaluate((element) => {
    const style = getComputedStyle(element);
    const properties = style.transitionProperty.split(",").map((part) => part.trim());
    const durations = style.transitionDuration.split(",").map((part) => part.trim());
    const index = properties.indexOf("margin-top");
    return index === -1 ? null : (durations[index % durations.length] ?? null);
  });
  expect(marginDuration).toBe("0.12s");
  const trigger = upper.getByTestId("floating-insert-trigger");
  await expect(trigger).toBeVisible();
  // Puntero directo: `locator.hover()` reencuadra el inserto bajo la barra fija.
  const box = await trigger.boundingBox();
  if (!box) throw new Error("No se pudo medir el inserto del bloque activo");
  expect(box.y).toBeGreaterThan(44);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // El relleno del grupo (`::before` del hermano posterior) tiene
  // `pointer-events: none`, así que su solape no se detecta por hit-test: se
  // comprueba el contexto de apilamiento que lo devuelve a la capa superior.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const active = document.querySelector<HTMLElement>(".prose .block[data-bubble-reserve]");
          if (!active) return { activeZ: "sin-activo", hovered: false, nextZ: null };
          const next = active.nextElementSibling;
          const button = active.querySelector<HTMLElement>("[data-testid=floating-insert-trigger]");
          const rect = button?.getBoundingClientRect();
          const hit = rect
            ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
            : null;
          return {
            activeZ: getComputedStyle(active).zIndex,
            nextZ: next instanceof HTMLElement ? getComputedStyle(next).zIndex : null,
            hovered: active.matches(":hover"),
            clickable: !!hit && !!button && (hit === button || button.contains(hit)),
          };
        }),
      { timeout: 2000 },
    )
    .toEqual({ activeZ: "1", nextZ: "0", hovered: true, clickable: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, "multiselect-insert.png") });
});

test.describe("B6 responsive and dark", () => {
  test.use({ viewport: { width: 1024, height: 768 } });
  test("supported narrow viewport keeps bubble in bounds", async ({ page }) => {
    test.setTimeout(240_000);
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    await openDocument(page);
    const block = page.locator('.prose [data-block-type="paragraph"]').nth(1);
    await block.evaluate((el) => {
      const s = el.closest("[data-document-scroll]");
      if (s) s.scrollTop += el.getBoundingClientRect().top - s.getBoundingClientRect().top;
    });
    await block.click({ modifiers: ["Shift"] });
    const bubble = page.getByTestId("block-bubble");
    await expect(bubble).toBeVisible();
    const rect = await bubble.boundingBox();
    if (!rect) throw new Error("No se pudo medir la burbuja narrow");
    expect(rect.x).toBeGreaterThanOrEqual(8);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1016);
    const active = await block.boundingBox();
    if (!active) throw new Error("No se pudo medir el bloque activo");
    expect(rect.y + rect.height <= active.y + 2 || rect.y >= active.y + active.height - 2).toBe(
      true,
    );
    await page.screenshot({ path: path.join(SHOTS_DIR, "narrow-bubble.png") });
  });
});

test("B6 dark theme has sufficient border contrast", async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ colorScheme: "dark" });
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await openDocument(page);
  const block = page.locator('.prose [data-block-type="paragraph"]').nth(1);
  await block.click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("block-bubble")).toBeVisible();
  const contrast = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const rgb = (name: string) =>
      root
        .getPropertyValue(name)
        .trim()
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [];
    const lum = (c: number[]) =>
      c
        .map((v) => {
          const x = v / 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        })
        .reduce((s, v, i) => s + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    const a = lum(rgb("--color-line-strong"));
    const b = lum(rgb("--color-surface"));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: path.join(SHOTS_DIR, "dark-bubble.png") });
});
