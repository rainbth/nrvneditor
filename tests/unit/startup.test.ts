import { describe, expect, it } from "vitest";
import { initialDocument } from "../../src/lib/startup";

describe("initialDocument", () => {
  it("crea un borrador vacío listo para escribir", () => {
    const doc = initialDocument();
    expect(doc.status).toBe("ready");
    expect(doc.path).toBeNull();
    expect(doc.content).toBe("");
    expect(doc.original).toBe("");
    expect(doc.blocks).toEqual([]);
    expect(doc.outline).toEqual([]);
    expect(doc.dirty).toBe(false);
    expect(doc.saveState).toBe("saved");
    expect(doc.saveError).toBeNull();
    expect(doc.error).toBeNull();
  });

  it("genera un localId nuevo en cada llamada", () => {
    const first = initialDocument();
    const second = initialDocument();
    expect(first.localId.startsWith("untitled-")).toBe(true);
    expect(second.localId.startsWith("untitled-")).toBe(true);
    expect(first.localId).not.toBe(second.localId);
  });

  it("devuelve un objeto nuevo (colecciones incluidas) en cada llamada", () => {
    const first = initialDocument();
    const second = initialDocument();
    expect(first).not.toBe(second);
    expect(first.blocks).not.toBe(second.blocks);
    expect(first.outline).not.toBe(second.outline);
    first.blocks.push({
      key: "x",
      type: "paragraph",
      headingPath: [],
      ordinal: 0,
      startLine: 0,
      endLine: 0,
      startOffset: 0,
      endOffset: 0,
      raw: "x",
      hash: "x",
    });
    expect(second.blocks).toEqual([]);
  });
});
