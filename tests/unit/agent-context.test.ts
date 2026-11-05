import { describe, expect, it } from "vitest";
import { contextModeFor, documentContextLabel } from "../../src/lib/agent-context";

describe("contextModeFor", () => {
  it("documento vacío implica contexto documento", () => {
    expect(contextModeFor({ length: 0 }, [])).toBe("document");
  });

  it("sin selección implica documento completo", () => {
    expect(contextModeFor({ length: 3 }, [])).toBe("document");
  });

  it("una selección parcial implica selección", () => {
    expect(contextModeFor({ length: 3 }, [1])).toBe("selection");
    expect(contextModeFor({ length: 3 }, [0, 1])).toBe("selection");
  });

  it("seleccionar todos los bloques equivale a documento completo (⌘A)", () => {
    expect(contextModeFor({ length: 3 }, [0, 1, 2])).toBe("document");
    expect(contextModeFor({ length: 1 }, [0])).toBe("document");
  });

  it("índices incompletos o con huecos no cubren el documento", () => {
    expect(contextModeFor({ length: 3 }, [0, 2])).toBe("selection");
  });
});

describe("documentContextLabel", () => {
  it("distingue documento vacío de documento con bloques", () => {
    expect(documentContextLabel(0)).toBe("Documento vacío");
    expect(documentContextLabel(1)).toBe("Documento completo · 1 bloque");
    expect(documentContextLabel(4)).toBe("Documento completo · 4 bloques");
  });
});
