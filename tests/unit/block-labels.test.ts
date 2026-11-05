import { describe, expect, it } from "vitest";
import { contextLabel } from "../../src/lib/block-labels";
import { splitBlocks } from "../../src/lib/blocks";

describe("contextLabel", () => {
  it("labels document, paragraph, section, selection and pending", () => {
    expect(contextLabel([])).toBe("Editando documento completo");
    expect(contextLabel(splitBlocks("12345678901234567890"))).toBe(
      "Editando párrafo: “12345678901234567890”",
    );
    expect(contextLabel(splitBlocks("123456789012345678901234"))).toBe(
      "Editando párrafo: “12345678901234567890…”",
    );
    expect(contextLabel(splitBlocks("# Hola"))).toBe("Editando sección: “Hola”");
    expect(contextLabel(splitBlocks("# Hola\n\nTexto"), new Set(), "section")).toBe(
      "Editando sección: “Hola”",
    );
    const sectionWithPending = splitBlocks("# Nueva sección\n\nTexto");
    expect(contextLabel(sectionWithPending, new Set([sectionWithPending[1].key]), "range")).toBe(
      "Editando sección: “Nueva sección”",
    );
    expect(contextLabel(splitBlocks("uno\n\ndos"))).toContain("Editando 2 bloques");
    const block = splitBlocks("uno")[0];
    expect(contextLabel([block], new Set([block.key]))).toBe("Editando párrafo nuevo");
  });
});
