import { describe, expect, it } from "vitest";
import { splitBlocks } from "../../src/lib/blocks";
import {
  insertRawsAfter,
  joinBlockRaws,
  removeBlockRange,
  replaceBlockRaw,
  splitBlockRaw,
} from "../../src/lib/insert";

describe("pure insertion helpers", () => {
  it("replaces and inserts", () => {
    const content = "one\n\ntwo";
    const blocks = splitBlocks(content);
    expect(replaceBlockRaw(content, blocks[0], "ONE")).toBe("ONE\n\ntwo");
    expect(insertRawsAfter(content, blocks, 0, ["mid"]).content).toBe("one\n\nmid\n\ntwo");
    expect(insertRawsAfter(content, blocks, 1, ["end"]).content).toBe("one\n\ntwo\n\nend");
  });
  it("splits, joins and removes", () => {
    expect(splitBlockRaw("abcd", 2)).toEqual({ left: "ab", right: "cd" });
    expect(joinBlockRaws(splitBlocks("# title")[0], "text")).toBe("# title text");
    expect(joinBlockRaws(splitBlocks("para")[0], "text")).toBe("para\ntext");
    expect(removeBlockRange("one\n\ntwo", ...splitBlocks("one\n\ntwo"))).toBe("");
  });
});
