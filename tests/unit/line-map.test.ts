import { describe, expect, it } from "vitest";
import { blockIndexAtOffset, blocksForLineRange, splitBlocks } from "../../src/lib/blocks";

const TEXT = "uno\n\ndos\n\ntres\n\ncuatro";

describe("line map", () => {
  const blocks = splitBlocks(TEXT);

  it("blocksForLineRange intersecta rangos", () => {
    const selected = blocksForLineRange(blocks, 2, 4);
    expect(selected.map((block) => block.raw)).toEqual(["dos", "tres"]);
  });

  it("blocksForLineRange incluye extremos y normaliza el orden", () => {
    expect(blocksForLineRange(blocks, 4, 2).map((block) => block.raw)).toEqual(["dos", "tres"]);
  });

  it("blockIndexAtOffset acierta en offsets exactos", () => {
    expect(blockIndexAtOffset(blocks, blocks[1].startOffset)).toBe(1);
    expect(blockIndexAtOffset(blocks, blocks[2].endOffset - 1)).toBe(2);
  });

  it("blockIndexAtOffset devuelve el bloque anterior en una línea en blanco", () => {
    expect(blockIndexAtOffset(blocks, blocks[0].endOffset)).toBe(0);
    expect(blockIndexAtOffset(blocks, blocks[1].startOffset - 1)).toBe(0);
  });

  it("blockIndexAtOffset devuelve -1 con lista vacía", () => {
    expect(blockIndexAtOffset([], 3)).toBe(-1);
  });
});
