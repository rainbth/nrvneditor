import { expect, test } from "@playwright/test";

test("muestra onboarding al primer arranque con sus tres pasos y CTAs", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nrvn.mock.settings", JSON.stringify({ onboarding: { done: false } }));
  });
  await page.goto("/");
  const dialog = page.getByTestId("onboarding-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("ol li")).toHaveCount(3);
  await expect(dialog.getByRole("button", { name: "Abrir carpeta" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Empezar con un borrador" })).toBeVisible();
});

test("borrador completa onboarding de forma persistente", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("nrvn.mock.settings") === null) {
      localStorage.setItem("nrvn.mock.settings", JSON.stringify({ onboarding: { done: false } }));
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Empezar con un borrador" }).click();
  await expect(page.getByTestId("onboarding-dialog")).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("nrvn.mock.settings") ?? "{}").onboarding.done,
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByTestId("onboarding-dialog")).toBeHidden();
});

test("Abrir carpeta completa onboarding y muestra el árbol", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nrvn.mock.settings", JSON.stringify({ onboarding: { done: false } }));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir carpeta" }).click();
  await expect(page.getByTestId("onboarding-dialog")).toBeHidden();
  await expect(page.getByRole("tree", { name: "Archivos Markdown" })).toBeVisible();
});

test("Guía rápida reabre el diálogo sin resetear done", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("nrvn.mock.settings") === null) {
      localStorage.setItem("nrvn.mock.settings", JSON.stringify({ onboarding: { done: true } }));
    }
  });
  await page.goto("/");
  await expect(page.getByTestId("onboarding-dialog")).toBeHidden();
  await page.getByTestId("menu-view-trigger").click();
  await page.getByRole("menuitem", { name: "Guía rápida" }).click();
  await expect(page.getByTestId("onboarding-dialog")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("nrvn.mock.settings") ?? "{}").onboarding.done,
      ),
    )
    .toBe(true);
});

test("el default del mock no muestra onboarding", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("onboarding-dialog")).toBeHidden();
});
