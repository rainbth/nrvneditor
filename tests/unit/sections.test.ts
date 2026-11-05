import { describe, expect, it } from "vitest";
import { splitBlocks } from "../../src/lib/blocks";
import {
  headingTrail,
  headingTrailForSelection,
  sectionBlocks,
  sectionRange,
} from "../../src/lib/sections";

const DOC = "# A\n\n## B\n\ntexto B\n\n## C\n\ntexto C\n\n### D\n\ntexto D\n\n# E\n\nfinal";

describe("sections", () => {
  const blocks = splitBlocks(DOC);
  // 0 #A, 1 ##B, 2 texto B, 3 ##C, 4 texto C, 5 ###D, 6 texto D, 7 #E, 8 final

  it("un heading nivel 1 abarca hasta el siguiente nivel <= 1", () => {
    expect(sectionRange(blocks, 0)).toEqual({ start: 0, end: 6 });
  });

  it("un heading nivel 2 se detiene en el siguiente nivel 2", () => {
    expect(sectionRange(blocks, 1)).toEqual({ start: 1, end: 2 });
  });

  it("incluye subsecciones de nivel mayor", () => {
    expect(sectionRange(blocks, 3)).toEqual({ start: 3, end: 6 });
    expect(sectionBlocks(blocks, 3)).toHaveLength(4);
  });

  it("un índice no-heading devuelve solo ese bloque", () => {
    expect(sectionRange(blocks, 2)).toEqual({ start: 2, end: 2 });
    expect(sectionBlocks(blocks, 2)).toHaveLength(1);
  });

  it("headingTrail devuelve la ruta aplicable", () => {
    expect(headingTrail(blocks, 5)).toEqual(["A", "C"]);
    expect(headingTrail(blocks, -1)).toEqual([]);
  });
});

describe("headingTrailForSelection", () => {
  const GUIDE = `# Guía de estilo

## Principios

texto de principios

## Referencias

texto de referencias

## Apéndice

texto del apéndice`;
  const blocks = splitBlocks(GUIDE);
  // 0 #Guía, 1 ##Principios, 2 texto, 3 ##Referencias, 4 texto, 5 ##Apéndice, 6 texto

  it("la sección del H1 arranca en su propio heading", () => {
    expect(sectionRange(blocks, 0)).toEqual({ start: 0, end: 6 });
    expect(
      headingTrailForSelection(
        blocks,
        sectionBlocks(blocks, 0).map((_, i) => i),
      ),
    ).toEqual(["Guía de estilo"]);
  });

  it("un párrafo bajo ## Principios hereda la ruta completa", () => {
    expect(headingTrailForSelection(blocks, [2])).toEqual(["Guía de estilo", "Principios"]);
  });

  it("un heading H2 seleccionado incluye su propio texto", () => {
    expect(headingTrailForSelection(blocks, [1])).toEqual(["Guía de estilo", "Principios"]);
  });

  it("un rango que cruza un heading usa la ruta del primer bloque", () => {
    expect(headingTrailForSelection(blocks, [2, 3, 4])).toEqual(["Guía de estilo", "Principios"]);
  });

  it("una selección vacía o fuera de rango no tiene ruta", () => {
    expect(headingTrailForSelection(blocks, [])).toEqual([]);
    expect(headingTrailForSelection(blocks, [99])).toEqual([]);
  });
});
