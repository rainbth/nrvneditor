import { describe, expect, it } from "vitest";
import { computeGutterMarks, type GutterBlock } from "../../src/lib/line-gutter";

describe("computeGutterMarks", () => {
  it("numera cada bloque con su línea de inicio 1-based", () => {
    const blocks: GutterBlock[] = [
      { startLine: 1, lineCount: 1 },
      { startLine: 5, lineCount: 1 },
    ];
    const marks = computeGutterMarks(blocks, [0, 40], [24, 24]);

    expect(marks).toEqual([
      { line: 1, top: 0, tick: false },
      { line: 5, top: 40, tick: false },
    ]);
  });

  it("genera ticks internos repartidos por la altura del bloque", () => {
    const marks = computeGutterMarks([{ startLine: 3, lineCount: 4 }], [10], [80]);

    expect(marks).toEqual([
      { line: 3, top: 10, tick: false },
      { line: 4, top: 30, tick: true },
      { line: 5, top: 50, tick: true },
      { line: 6, top: 70, tick: true },
    ]);
  });

  it("un bloque de una sola línea no genera ticks", () => {
    const marks = computeGutterMarks([{ startLine: 7, lineCount: 1 }], [12], [30]);

    expect(marks).toHaveLength(1);
    expect(marks[0]).toEqual({ line: 7, top: 12, tick: false });
  });

  it("conserva offsets relativos de bloques consecutivos", () => {
    const blocks: GutterBlock[] = [
      { startLine: 1, lineCount: 2 },
      { startLine: 3, lineCount: 3 },
    ];
    const marks = computeGutterMarks(blocks, [0, 100], [40, 60]);

    expect(marks[0]).toEqual({ line: 1, top: 0, tick: false });
    expect(marks[1]).toEqual({ line: 2, top: 20, tick: true });
    expect(marks[2]).toEqual({ line: 3, top: 100, tick: false });
    expect(marks[3].line).toBe(4);
    expect(marks[3].top).toBeCloseTo(120, 6);
    expect(marks[4].line).toBe(5);
    expect(marks[4].top).toBeCloseTo(140, 6);
  });

  it("normaliza lineCount inválido a una sola línea", () => {
    const marks = computeGutterMarks([{ startLine: 2, lineCount: 0 }], [5], [10]);

    expect(marks).toEqual([{ line: 2, top: 5, tick: false }]);
  });
});
