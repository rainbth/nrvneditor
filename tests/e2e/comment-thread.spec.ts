import { expect, type Page, test } from "@playwright/test";

async function openDocument(page: Page) {
  await page.goto("/");
  await expect(page.locator(".app-shell")).toBeVisible();
  await page
    .getByRole("button", { name: /Abrir carpeta/ })
    .first()
    .click();
  await page.locator('[role="treeitem"][data-path="guia-estilo.md"]').click();
  await expect(page.locator(".prose")).toBeVisible();
}

test("comment thread opens from context menu and supports add, resolve and escape", async ({
  page,
}) => {
  await openDocument(page);
  const block = page.locator('.prose [data-block-type="paragraph"]').first();
  await block.click({ button: "right" });
  const menu = page.getByTestId("block-context-menu");
  await menu.getByRole("menuitem", { name: "Comentar bloque" }).click();
  const thread = page.getByTestId("comment-thread");
  await expect(thread).toBeVisible();
  await thread.getByLabel("Comentario").pressSequentially("Revisar este bloque");
  await expect(thread.getByLabel("Comentario")).toHaveValue("Revisar este bloque");
  // ⌘↵ and Ctrl+↵ share the same handler branch (metaKey || ctrlKey).
  await thread.getByLabel("Comentario").press("Control+Enter");
  await expect(thread).toContainText("Revisar este bloque");
  await expect(block.getByTestId("block-comment-badge")).toHaveText("1");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("comment-thread")).toHaveCount(0);
  await block.getByTestId("block-comment-badge").click();
  await expect(page.getByTestId("comment-thread")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("comment-thread")).toHaveCount(0);
  await block.getByTestId("block-comment-badge").click();
  await expect(thread).toBeVisible();
  await thread.getByRole("button", { name: "Resolver" }).click();
  await expect(thread.locator("details")).toContainText("Resueltos (1)");
  await page.keyboard.press("Escape");
  await expect(thread).toHaveCount(0);
});
