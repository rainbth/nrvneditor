import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const theme of ["claro", "oscuro"] as const) {
  test(`axe: accesibilidad del editor en tema ${theme}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/");
    await expect(page.locator(".app-shell")).toBeVisible();
    await page
      .getByRole("button", { name: /Abrir carpeta/ })
      .first()
      .click();
    await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
    await expect(page.locator(".prose")).toBeVisible();
    if (theme === "oscuro") {
      await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
      await expect(page.locator('html[data-theme="dark"]')).toBeVisible();
    }
    mkdirSync(resolve("artifacts/screenshots/a11y"), { recursive: true });
    await page.screenshot({
      path: resolve(`artifacts/screenshots/a11y/${theme}.png`),
      fullPage: true,
    });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const violations = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(
      violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          detail: node.any.map((check) => check.message).filter(Boolean),
        })),
      })),
    ).toEqual([]);
  });
}
