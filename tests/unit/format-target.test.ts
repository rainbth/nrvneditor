import { describe, expect, it } from "vitest";
import {
  applyBlockFormat,
  resolveInlineTarget,
  toggleInlineFormat,
} from "../../src/lib/format-actions";

describe("inline target resolution", () => {
  it("prefers a clamped selection", () => {
    expect(resolveInlineTarget("hello", { start: -2, end: 99 })).toEqual({
      target: { start: 0, end: 5 },
      scope: "selection",
    });
  });
  it("targets a word only when the caret is inside it", () => {
    expect(resolveInlineTarget("hello world", { start: 2, end: 2 })).toEqual({
      target: { start: 0, end: 5 },
      scope: "word",
    });
  });
  it("uses line at boundaries and between words", () => {
    for (const offset of [0, 5, 6, 11])
      expect(resolveInlineTarget("hello world", { start: offset, end: offset }).scope).toBe("line");
    expect(resolveInlineTarget("# hello  \nnext", { start: 0, end: 0 }).target).toEqual({
      start: 2,
      end: 7,
    });
  });
  it("uses the line at the start/end and after a word-separating space", () => {
    expect(resolveInlineTarget("hello", { start: 0, end: 0 }).scope).toBe("line");
    expect(resolveInlineTarget("hello", { start: 5, end: 5 }).scope).toBe("line");
    expect(resolveInlineTarget("hello world", { start: 6, end: 6 }).scope).toBe("line");
  });
  it("has no target on an empty line", () => {
    expect(resolveInlineTarget("  \nnext", { start: 1, end: 1 })).toEqual({
      target: null,
      scope: "none",
    });
  });
});

describe("inline formatting", () => {
  it("wraps a selected word and unwraps that same selection on the second toggle", () => {
    const wrapped = toggleInlineFormat("word", { start: 0, end: 4 }, "bold");
    expect(wrapped.raw).toBe("**word**");
    expect(toggleInlineFormat(wrapped.raw, wrapped.selection, "bold").raw).toBe("word");
  });
  it("toggles already selected markdown markers", () => {
    const formatted = toggleInlineFormat("**word**", { start: 0, end: 8 }, "bold");
    expect(formatted.raw).toBe("word");
    expect(toggleInlineFormat("word", { start: 0, end: 4 }, "bold").raw).not.toContain("****");
    const first = toggleInlineFormat("word", { start: 0, end: 4 }, "bold");
    expect(toggleInlineFormat(first.raw, first.selection, "bold").raw).toBe("word");
  });
  it("removes a bold span around a partial selection without duplicating markers", () => {
    const once = toggleInlineFormat("**xy**", { start: 2, end: 3 }, "bold");
    expect(once.raw).toBe("xy");
    expect(once.raw).toContain("xy");
    expect(once.raw).not.toContain("****");
    expect(once.selection).toEqual({ start: 0, end: 1 });
    // A second toggle bolds only the selected x, yielding a valid, non-nested span.
    const twice = toggleInlineFormat(once.raw, once.selection, "bold");
    expect(twice.raw).toBe("**x**y");
  });
  it("unwraps a selection that includes one edge marker of a bold span", () => {
    const result = toggleInlineFormat("**xy**", { start: 1, end: 4 }, "bold");
    expect(result.raw).toBe("xy");
    expect(result.raw).not.toContain("****");
  });
  it("unwraps a link when toggled on selected link text or the full link", () => {
    expect(toggleInlineFormat("[x](https://a.com)", { start: 1, end: 2 }, "link").raw).toBe("x");
    expect(toggleInlineFormat("[x](https://a.com)", { start: 0, end: 18 }, "link").raw).toBe("x");
  });
  it("preserves bold markers when italic is toggled over the complete bold span", () => {
    expect(toggleInlineFormat("**x**", { start: 0, end: 5 }, "italic").raw).toBe("***x***");
  });
  it("keeps neighboring bold spans separate when formatting the text between them", () => {
    expect(toggleInlineFormat("**a** b **c**", { start: 6, end: 7 }, "bold").raw).toBe(
      "**a** **b** **c**",
    );
  });
  it("keeps neighboring inline-code spans separate", () => {
    expect(toggleInlineFormat("`a` and `b`", { start: 4, end: 7 }, "inline-code").raw).toBe(
      "`a` `and` `b`",
    );
  });
  it("keeps neighboring italic spans separate", () => {
    expect(toggleInlineFormat("*a* and *b*", { start: 4, end: 7 }, "italic").raw).toBe(
      "*a* *and* *b*",
    );
  });
  it("does not wrap a selection containing an existing bold span", () => {
    const result = toggleInlineFormat("**x** y", { start: 0, end: 7 }, "bold");
    expect(result.raw).toBe("**x** y");
    expect(result.raw).not.toContain("****");
  });
  it("does not wrap a selection ending on an existing bold span marker", () => {
    const result = toggleInlineFormat("y **x**", { start: 0, end: 6 }, "bold");
    expect(result.raw).toBe("y **x**");
    expect(result.raw).not.toContain("****");
  });
  it("reverses italic applied around an existing bold span", () => {
    const once = toggleInlineFormat("**x**", { start: 0, end: 5 }, "italic");
    expect(once.raw).toBe("***x***");
    expect(once.selection).toEqual({ start: 1, end: 6 });
    const twice = toggleInlineFormat(once.raw, once.selection, "italic");
    expect(twice.raw).toBe("**x**");
  });
  it("allows italic around text already wrapped in bold", () => {
    expect(toggleInlineFormat("**word**", { start: 2, end: 6 }, "italic").raw).toBe("***word***");
  });
  it("allows bold around text already wrapped in italic", () => {
    expect(toggleInlineFormat("*word*", { start: 1, end: 5 }, "bold").raw).toBe("***word***");
  });
  it("does not interpret list bullets as italic delimiters", () => {
    expect(toggleInlineFormat("* item one\n* item two", { start: 2, end: 6 }, "italic").raw).toBe(
      "* *item* one\n* item two",
    );
  });
});

describe("block formatting", () => {
  it("covers horizontal rule and paragraph formats", () => {
    expect(applyBlockFormat("uno", "hr")).toBe("---");
    expect(applyBlockFormat("texto", "paragraph")).toBe("texto");
  });
});
