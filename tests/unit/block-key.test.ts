import { describe, expect, it } from "vitest";
import { shouldPreventBlockKey } from "../../src/lib/block-key";

describe("shouldPreventBlockKey", () => {
  it("solo bloquea Enter y espacio fuera de edición", () => {
    for (const key of ["Enter", " "]) {
      expect(shouldPreventBlockKey({ key }, true)).toBe(false);
      expect(shouldPreventBlockKey({ key }, false)).toBe(true);
    }
    expect(shouldPreventBlockKey({ key: "x" }, false)).toBe(false);
  });
});
