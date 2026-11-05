import { describe, expect, it } from "vitest";
import {
  applyBlockFormat,
  canEditInlineBlock,
  isBlockFormatSupported,
  toggleInlineFormat,
} from "../../src/lib/format-actions";

describe("render formatting helpers", () => {
  it("formats block markdown", () => {
    expect(applyBlockFormat("# hi\nthere", "paragraph")).toBe("hi\nthere");
    expect(applyBlockFormat("one\n\ntwo", "bullet-list")).toBe("- one\n\n- two");
    expect(applyBlockFormat("one\ntwo", "quote")).toBe("> one\n> two");
    expect(applyBlockFormat("one", "h1")).toBe("# one");
    expect(applyBlockFormat("one", "h3")).toBe("### one");
    expect(applyBlockFormat("code", "code-block")).toBe("```\ncode\n```");
    expect(applyBlockFormat("x", "hr")).toBe("---");
  });
  it("toggles inline formats", () => {
    for (const format of ["bold", "italic", "inline-code", "link"] as const) {
      const wrapped = toggleInlineFormat("word", { start: 0, end: 4 }, format);
      expect(toggleInlineFormat(wrapped.raw, wrapped.selection, format).raw).toBe("word");
    }
  });
  it("filters editable types", () => {
    expect(isBlockFormatSupported("code")).toBe(false);
    expect(canEditInlineBlock("paragraph")).toBe(true);
  });
});
