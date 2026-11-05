import { describe, expect, it } from "vitest";
import { splitBlocks } from "../../src/lib/blocks";
import { findTextMatches, replaceTextMatches } from "../../src/lib/find-replace";

describe("find and replace", () => {
  it("supports insensitive, sensitive and regex search", () => {
    const blocks = splitBlocks("Alpha alpha");
    expect(findTextMatches(blocks, "ALPHA")).toHaveLength(2);
    expect(findTextMatches(blocks, "ALPHA", { caseSensitive: true })).toHaveLength(0);
    expect(findTextMatches(blocks, "a.+a", { useRegex: true, caseSensitive: true })).toHaveLength(
      1,
    );
  });
  it("excludes code and frontmatter and replaces all matches", () => {
    const content = "---\ntitle: alpha\n---\n\nalpha\n\n```\nalpha\n```";
    const blocks = splitBlocks(content);
    const result = replaceTextMatches(content, blocks, "alpha", "beta");
    expect(result.count).toBe(1);
    expect(result.content).toContain("\nbeta\n");
    expect(findTextMatches(blocks, "[", { useRegex: true })).toEqual([]);
  });
});
