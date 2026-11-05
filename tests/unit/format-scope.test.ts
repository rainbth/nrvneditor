import { describe, expect, it } from "vitest";
import { selectionScopeLabel, shouldShowBubble } from "../../src/lib/format-scope";

describe("format toolbar scope", () => {
  it("labels selection, word, line, paragraph, block, and no-target scopes", () => {
    expect(selectionScopeLabel("selection", "paragraph")).toBe("Selección");
    expect(selectionScopeLabel("word", "block")).toBe("Palabra");
    expect(selectionScopeLabel("line", null)).toBe("Línea");
    expect(selectionScopeLabel("none", "paragraph")).toBe("Párrafo activo");
    expect(selectionScopeLabel("none", "block")).toBe("Bloque activo");
    expect(selectionScopeLabel("none", null)).toBe("Sin selección");
  });
  it("checks all bubble visibility conditions", () => {
    const input = {
      mode: "render",
      critiqueOpen: false,
      proposalOpen: false,
      hasElement: true,
      blocks: 1,
      selectionMode: "none",
      contentEditable: false,
      elementIsActive: true,
      dismissed: false,
    };
    expect(shouldShowBubble(input)).toBe(true);
    for (const patch of [
      { mode: "markdown" },
      { critiqueOpen: true },
      { proposalOpen: true },
      { hasElement: false },
      { blocks: 0 },
      { elementIsActive: false },
      { dismissed: true },
    ]) {
      expect(shouldShowBubble({ ...input, ...patch })).toBe(false);
    }
  });
});
