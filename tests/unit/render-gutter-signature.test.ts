import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/ipc", () => ({ nrvn: {} }));

import { gutterLayoutSignature } from "../../src/components/render/RenderGutter";
import { splitBlocks } from "../../src/lib/blocks";

describe("gutterLayoutSignature", () => {
  it("incluye la numeración aunque los extremos y el tamaño no cambien", () => {
    const original = splitBlocks("# First\n\nAlpha\nBeta\n\n# Last");
    const inserted = splitBlocks("# First\n\nAlpha\nInserted\nBeta\n\n# Last");
    expect(inserted).toHaveLength(original.length);
    expect(inserted[0].key).toBe(original[0].key);
    expect(inserted.at(-1)?.key).toBe(original.at(-1)?.key);
    expect(inserted[1].endLine).not.toBe(original[1].endLine);
    expect(gutterLayoutSignature(original, 800, 1000, 1200, 100)).not.toBe(
      gutterLayoutSignature(inserted, 800, 1000, 1200, 100),
    );
    expect(gutterLayoutSignature(original, 800, 1000, 1200, 130)).not.toBe(
      gutterLayoutSignature(original, 800, 1000, 1200, 100),
    );
  });
});
