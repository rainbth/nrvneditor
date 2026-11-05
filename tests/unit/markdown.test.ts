import { describe, expect, it } from "vitest";
import { activeOutlineKeyForLine, type OutlineItem } from "../../src/lib/markdown";

const OUTLINE: OutlineItem[] = [
  { key: "h-0", level: 1, text: "Uno", line: 0, blockIndex: 0 },
  { key: "h-5", level: 2, text: "Dos", line: 5, blockIndex: 1 },
  { key: "h-10", level: 2, text: "Tres", line: 10, blockIndex: 2 },
];

describe("activeOutlineKeyForLine", () => {
  it("una línea vacía de outline devuelve null", () => {
    expect(activeOutlineKeyForLine([], 0)).toBeNull();
    expect(activeOutlineKeyForLine([], 99)).toBeNull();
  });

  it("antes del primer heading devuelve null", () => {
    const shifted = OUTLINE.map((item) => ({ ...item, line: item.line + 1 }));
    expect(activeOutlineKeyForLine(shifted, 0)).toBeNull();
  });

  it("en la línea exacta del heading activa ese heading", () => {
    expect(activeOutlineKeyForLine(OUTLINE, 0)).toBe("h-0");
    expect(activeOutlineKeyForLine(OUTLINE, 5)).toBe("h-5");
    expect(activeOutlineKeyForLine(OUTLINE, 10)).toBe("h-10");
  });

  it("entre headings mantiene el último heading anterior", () => {
    expect(activeOutlineKeyForLine(OUTLINE, 4)).toBe("h-0");
    expect(activeOutlineKeyForLine(OUTLINE, 9)).toBe("h-5");
  });

  it("después del último heading mantiene el último", () => {
    expect(activeOutlineKeyForLine(OUTLINE, 99)).toBe("h-10");
  });

  it("no muta el outline", () => {
    const before = OUTLINE.map((item) => ({ ...item }));
    activeOutlineKeyForLine(OUTLINE, 9);
    expect(OUTLINE).toEqual(before);
  });
});
