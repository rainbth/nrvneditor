import { describe, expect, it } from "vitest";
import { applyBlockReplacements } from "../../electron/lib/replace-blocks";

describe("applyBlockReplacements", () => {
  it("reemplaza un bloque y conserva el resto del documento", () => {
    const content = "# Título\n\nuno\n\ndos\n";
    const result = applyBlockReplacements(content, [
      { key: "Título#paragraph:0", before: "uno", after: "uno cambiado" },
    ]);
    expect(result).toEqual({
      ok: true,
      content: "# Título\n\nuno cambiado\n\ndos\n",
    });
  });

  it("aplica varios bloques en orden descendente sin desplazar offsets", () => {
    const content = "uno\n\ndos\n\ntres\n";
    const result = applyBlockReplacements(content, [
      { key: "#paragraph:0", before: "uno", after: "UNO" },
      { key: "#paragraph:2", before: "tres", after: "TRES" },
      { key: "#paragraph:1", before: "dos", after: "DOS" },
    ]);
    expect(result).toEqual({ ok: true, content: "UNO\n\nDOS\n\nTRES\n" });
  });

  it("rechaza una lista vacía", () => {
    const result = applyBlockReplacements("uno\n", []);
    expect(result.ok).toBe(false);
  });

  it("rechaza claves duplicadas", () => {
    const result = applyBlockReplacements("uno\n", [
      { key: "#paragraph:0", before: "uno", after: "a" },
      { key: "#paragraph:0", before: "uno", after: "b" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("repetida");
  });

  it("rechaza una clave ajena al documento", () => {
    const result = applyBlockReplacements("uno\n", [
      { key: "otro#paragraph:7", before: "uno", after: "a" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("ya no existe");
  });

  it("rechaza un before desactualizado", () => {
    const result = applyBlockReplacements("uno\n", [
      { key: "#paragraph:0", before: "viejo", after: "a" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("cambió en el documento");
  });
});
