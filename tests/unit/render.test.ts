import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MarkdownBlock } from "../../src/components/render/MarkdownBlock";
import { splitBlocks } from "../../src/lib/blocks";

vi.mock("../../src/lib/ipc", () => ({
  nrvn: {
    app: { openExternal: async () => true },
    workspace: { onFileSaved: () => () => {} },
    onMenuCommand: () => () => {},
  },
}));

const MARKDOWN = [
  "# Título",
  "",
  "> Una cita",
  "",
  "- [x] hecha",
  "- [ ] pendiente",
  "",
  "| A | B |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```ts",
  "const x: number = 1;",
  "```",
  "",
  "[enlace](https://example.com)",
  "",
  "![alt de imagen](https://example.com/imagen.png)",
  "",
  "---",
  "",
  "<script>alert('xss')</script>",
].join("\n");

function renderDocument(markdown: string): string {
  const blocks = splitBlocks(markdown);
  return renderToStaticMarkup(
    createElement(
      "article",
      { className: "prose" },
      blocks.map((block, index) => createElement(MarkdownBlock, { key: block.key, block, index })),
    ),
  );
}

describe("MarkdownBlock", () => {
  it("renderiza GFM por bloques con ganchos data-block-*", () => {
    const html = renderDocument(MARKDOWN);

    expect(html).toContain('data-block-key="#heading:0"');
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("contains-task-list");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
    expect(html).toContain('class="code-block"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('<img src="https://example.com/imagen.png" alt="alt de imagen"');
    expect(html).toContain("<hr/>");
  });

  it("sanitiza el HTML crudo del usuario", () => {
    const html = renderDocument(MARKDOWN);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert(");
  });
});
