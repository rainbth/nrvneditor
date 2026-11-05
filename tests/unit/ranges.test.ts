import { describe, expect, it } from "vitest";
import { splitBlocks } from "../../src/lib/blocks";
import { blockRangeForLines, isContiguous, rangeBetween, selectionKey } from "../../src/lib/ranges";

const blocks = splitBlocks("uno\n\ndos\n\ntres\n\ncuatro\n\ncinco");

describe("ranges", () => {
  it("devuelve un rango contiguo ascendente", () => {
    expect(rangeBetween(blocks, 1, 3)).toEqual([1, 2, 3]);
  });

  it("acepta ancla mayor que foco", () => {
    expect(rangeBetween(blocks, 4, 2)).toEqual([2, 3, 4]);
  });

  it("un único índice", () => {
    expect(rangeBetween(blocks, 2, 2)).toEqual([2]);
  });

  it("isContiguous detecta huecos falsos", () => {
    expect(isContiguous([0, 1, 2])).toBe(true);
    expect(isContiguous([0, 2])).toBe(false);
    expect(isContiguous([])).toBe(true);
  });

  it("selectionKey es estable y distingue órdenes", () => {
    expect(selectionKey(["a", "b"])).toBe(selectionKey(["a", "b"]));
    expect(selectionKey(["a", "b"])).not.toBe(selectionKey(["b", "a"]));
  });
});

const fixture = [
  "# Título",
  "línea uno",
  "línea dos",
  "línea tres",
  "",
  "```ts",
  "const a = 1;",
  "const b = 2;",
  "const c = 3;",
  "```",
  "",
  "- uno",
  "- dos",
].join("\n");

const fixtureBlocks = splitBlocks(fixture);

describe("blockRangeForLines", () => {
  it("una selección dentro de un párrafo multilínea devuelve 1 bloque completo", () => {
    expect(blockRangeForLines(fixtureBlocks, 2, 2)).toEqual({ start: 1, end: 1 });
  });

  it("cruce párrafo + heading devuelve los 2 bloques completos", () => {
    expect(blockRangeForLines(fixtureBlocks, 0, 2)).toEqual({ start: 0, end: 1 });
  });

  it("una línea del fence devuelve el bloque de código completo", () => {
    expect(blockRangeForLines(fixtureBlocks, 7, 7)).toEqual({ start: 2, end: 2 });
  });

  it("acepta el rango invertido", () => {
    expect(blockRangeForLines(fixtureBlocks, 2, 0)).toEqual({ start: 0, end: 1 });
  });

  it("sin intersección (hueco final) devuelve null", () => {
    expect(blockRangeForLines(fixtureBlocks, 13, 15)).toBeNull();
  });

  it("sin bloques devuelve null", () => {
    expect(blockRangeForLines([], 0, 3)).toBeNull();
  });
});
