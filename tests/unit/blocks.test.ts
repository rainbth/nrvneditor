import { describe, expect, it } from "vitest";
import {
  blockHashCacheSize,
  blockHashComputationCount,
  isFrontmatterBlock,
  splitBlocks,
} from "../../src/lib/blocks";

describe("splitBlocks", () => {
  it("reuses hashes for repeated input within the cache capacity", () => {
    const markdown = Array.from({ length: 300 }, (_, index) => `unique paragraph ${index}`).join(
      "\n\n",
    );
    const before = blockHashComputationCount();
    const blocks = splitBlocks(markdown);
    const afterFirst = blockHashComputationCount();
    splitBlocks(markdown);
    const afterSecond = blockHashComputationCount();
    expect(afterFirst - before).toBe(blocks.length);
    expect(afterSecond).toBe(afterFirst);
  });

  it("bounds the FIFO cache when processing more than 600 unique raws", () => {
    const markdown = Array.from({ length: 620 }, (_, index) => `unique paragraph ${index}`).join(
      "\n\n",
    );
    splitBlocks(markdown);
    expect(blockHashCacheSize()).toBeLessThanOrEqual(512);
  });
  it("identifies frontmatter as protected content", () => {
    expect(isFrontmatterBlock("---\ntitle: Draft\n---")).toBe(true);
    expect(isFrontmatterBlock("---\ntitle: Draft\n...\n")).toBe(true);
    expect(isFrontmatterBlock("---\ntitle: Draft\n\ntext")).toBe(false);
  });
  it("separa párrafos por líneas en blanco (también con espacios)", () => {
    const blocks = splitBlocks("# Título\n\nHola mundo.\n   \nSegundo párrafo.");
    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "paragraph"]);
    expect(blocks[0].level).toBe(1);
    expect(blocks[1].key).toBe("Título#paragraph:0");
    expect(blocks[2].key).toBe("Título#paragraph:1");
    expect(blocks[1].headingPath).toEqual(["Título"]);
  });

  it("respeta niveles ATX y construye la ruta de headings", () => {
    const blocks = splitBlocks("# Guía\n\n## Escritura\n\nTexto\n\n### Detalle\n\nMás");
    expect(blocks[0].level).toBe(1);
    expect(blocks[1].level).toBe(2);
    expect(blocks[1].headingPath).toEqual(["Guía"]);
    expect(blocks[2].headingPath).toEqual(["Guía", "Escritura"]);
    expect(blocks[3].level).toBe(3);
    expect(blocks[4].headingPath).toEqual(["Guía", "Escritura", "Detalle"]);
    expect(blocks[4].key).toBe("Guía › Escritura › Detalle#paragraph:0");
  });

  it("no interpreta headings dentro de fences ```", () => {
    const blocks = splitBlocks("```ts\n# no es heading\nconst a = 1;\n```\n\nFuera");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("code");
    expect(blocks[0].raw).toContain("# no es heading");
    expect(blocks[1].type).toBe("paragraph");
  });

  it("soporta fences ~~~ con backticks dentro", () => {
    const blocks = splitBlocks("~~~\nconst a = `x`;\n~~~");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("code");
    expect(blocks[0].raw).toContain("`x`");
  });

  it("CIERRA una fence sólo con el mismo carácter y longitud >= (fence anidada)", () => {
    const blocks = splitBlocks("````\n```\ndentro\n```\n````\n\nDespués");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("code");
    expect(blocks[0].startLine).toBe(0);
    expect(blocks[0].endLine).toBe(4);
    expect(blocks[1].type).toBe("paragraph");
  });

  it("fence sin cerrar llega hasta EOF", () => {
    const blocks = splitBlocks("```\nabc\ndef");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("code");
    expect(blocks[0].endLine).toBe(2);
  });

  it("agrupa listas contiguas y reinicia ordinales por ruta", () => {
    const blocks = splitBlocks("- a\n- b\n\nTexto\n\n- c");
    expect(blocks.map((block) => block.type)).toEqual(["list", "paragraph", "list"]);
    expect(blocks[0].key).toBe("#list:0");
    expect(blocks[2].key).toBe("#list:1");
    expect(blocks[0].ordinal).toBe(0);
    expect(blocks[2].ordinal).toBe(1);
  });

  it("una línea en blanco entre ítems no rompe la lista", () => {
    const blocks = splitBlocks("- a\n\n- b");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("list");
    expect(blocks[0].endLine).toBe(2);
  });

  it("detecta citas contiguas", () => {
    const blocks = splitBlocks("> una\n> dos\n\nTexto");
    expect(blocks[0].type).toBe("quote");
    expect(blocks[0].endLine).toBe(1);
  });

  it("detecta tablas con separador", () => {
    const blocks = splitBlocks("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("table");
    expect(blocks[0].endLine).toBe(2);
  });

  it("detecta reglas horizontales", () => {
    const blocks = splitBlocks("Texto\n\n---\n\nMás");
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "hr", "paragraph"]);
  });

  it("agrupa HTML de bloque hasta su cierre", () => {
    const blocks = splitBlocks("<div>\n  <p>x</p>\n</div>\n\nTexto");
    expect(blocks[0].type).toBe("html");
    expect(blocks[0].endLine).toBe(2);
    expect(blocks[1].type).toBe("paragraph");
  });

  it("trata el frontmatter como paragraph sin ruta", () => {
    const blocks = splitBlocks("---\ntitle: X\n---\n\n# Doc\n\nBody");
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks[0].headingPath).toEqual([]);
    expect(blocks[0].endLine).toBe(2);
    expect(blocks[1].type).toBe("heading");
    expect(blocks[2].headingPath).toEqual(["Doc"]);
  });

  it("conserva offsets y raw exactos con CRLF", () => {
    const text = "A\r\nB\r\n\r\nWorld";
    const blocks = splitBlocks(text);
    expect(blocks[0].raw).toBe("A\r\nB");
    expect(blocks[0].startLine).toBe(0);
    expect(blocks[0].endLine).toBe(1);
    expect(text.slice(blocks[0].startOffset, blocks[0].endOffset)).toBe("A\r\nB");
    expect(blocks[1].raw).toBe("World");
    expect(blocks[1].startLine).toBe(3);
    expect(text.slice(blocks[1].startOffset, blocks[1].endOffset)).toBe("World");
  });
});
