import { describe, expect, it } from "vitest";
import {
  deleteBlock,
  duplicateBlock,
  moveBlockDown,
  moveBlockRange,
  moveBlockUp,
} from "../../src/lib/block-ops";
import { splitBlocks } from "../../src/lib/blocks";

describe("block operations", () => {
  const content = "one\n\ntwo\n\nthree";
  const blocks = () => splitBlocks(content);
  it("moves blocks while preserving exact separators", () => {
    expect(moveBlockUp(content, blocks(), 1)).toMatchObject({
      ok: true,
      content: "two\n\none\n\nthree",
      indexMap: [1, 0, 2],
    });
    expect(moveBlockDown(content, blocks(), 0)).toMatchObject({
      ok: true,
      content: "two\n\none\n\nthree",
      indexMap: [1, 0, 2],
    });
  });
  it("moves a range, selects all moved blocks, and validates bounds", () => {
    const moved = moveBlockRange(content, blocks(), 1, 2, "up");
    expect(moved).toMatchObject({
      ok: true,
      content: "two\n\nthree\n\none",
      indexMap: [2, 0, 1],
    });
    const parsed = splitBlocks("two\n\nthree\n\none");
    expect(moved.ok && moved.selection).toEqual({
      start: parsed[0].startOffset,
      end: parsed[1].endOffset,
    });
    expect(moveBlockUp(content, blocks(), 0)).toEqual({ ok: false, reason: "bounds" });
  });
  it("rotates heterogeneous gaps when moving a multi-block range down", () => {
    const source = "# A\n\npara1\n\npara2\n# B";
    const result = moveBlockRange(source, splitBlocks(source), 1, 2, "down");
    const expected = "# A\n\n# B\npara1\n\npara2";
    expect(result.ok && result.content).toBe(expected);
    expect(
      splitBlocks(result.ok ? result.content : "").map(({ type, raw }) => ({ type, raw })),
    ).toEqual(splitBlocks(expected).map(({ type, raw }) => ({ type, raw })));
  });
  it("duplicates with a selection and unchanged map", () => {
    const result = duplicateBlock(content, blocks(), 1);
    expect(result).toMatchObject({
      ok: true,
      content: "one\n\ntwo\n\ntwo\n\nthree",
      indexMap: [0, 1, 3],
    });
    const parsed = splitBlocks(result.ok ? result.content : "");
    expect(result.ok && result.selection).toEqual({
      start: parsed[2].startOffset,
      end: parsed[2].endOffset,
    });
  });
  it("deletes middle and final blocks", () => {
    const deleted = deleteBlock(content, blocks(), 1);
    expect(deleted).toMatchObject({
      ok: true,
      content: "one\n\nthree",
      indexMap: [0, -1, 1],
    });
    const parsed = splitBlocks("one\n\nthree");
    expect(deleted.ok && deleted.selection).toEqual({
      start: parsed[1].startOffset,
      end: parsed[1].endOffset,
    });
    expect(deleteBlock(content, blocks(), 2)).toMatchObject({
      ok: true,
      content: "one\n\ntwo",
      indexMap: [0, 1, -1],
    });
  });
  it("rejects pending selection and neighbor", () => {
    const pending = blocks();
    pending[1].pending = true;
    expect(moveBlockUp(content, pending, 1)).toEqual({ ok: false, reason: "pending" });
    expect(deleteBlock(content, pending, 1)).toEqual({ ok: false, reason: "pending" });
    const neighbor = blocks();
    neighbor[0].pending = true;
    expect(moveBlockDown(content, neighbor, 0)).toEqual({ ok: false, reason: "pending" });
  });
  it("protects frontmatter and preserves duplicate separators", () => {
    const frontmatter = "---\ntitle: Example\n---\n\nbody";
    expect(deleteBlock(frontmatter, splitBlocks(frontmatter), 0)).toEqual({
      ok: false,
      reason: "protected",
    });
    expect(moveBlockUp(frontmatter, splitBlocks(frontmatter), 1)).toEqual({
      ok: false,
      reason: "protected",
    });
    expect(moveBlockDown(frontmatter, splitBlocks(frontmatter), 0)).toEqual({
      ok: false,
      reason: "protected",
    });

    const headings = "# A\n# B";
    const headingDuplicate = duplicateBlock(headings, splitBlocks(headings), 0);
    expect(headingDuplicate.ok && headingDuplicate.content).toBe("# A\n# A\n# B");
    expect(headingDuplicate.ok && headingDuplicate.content).not.toContain("\n\n\n");

    const crlf = "a\r\n\r\nb\r\n\r\nc";
    const crlfDuplicate = duplicateBlock(crlf, splitBlocks(crlf), 1);
    expect(crlfDuplicate.ok && crlfDuplicate.content).toBe("a\r\n\r\nb\r\n\r\nb\r\n\r\nc");
    expect(crlfDuplicate.ok && crlfDuplicate.content).not.toContain("\n\n");

    const fusionInput = "text\n# A";
    const fusionDuplicate = duplicateBlock(fusionInput, splitBlocks(fusionInput), 0);
    expect(fusionDuplicate).toMatchObject({
      ok: true,
      content: "text\n\ntext\n# A",
      indexMap: [0, 2],
    });
    const fusionParsed = splitBlocks(fusionDuplicate.ok ? fusionDuplicate.content : "");
    expect(fusionDuplicate.ok && fusionDuplicate.selection).toEqual({
      start: fusionParsed[1].startOffset,
      end: fusionParsed[1].endOffset,
    });
  });
});
