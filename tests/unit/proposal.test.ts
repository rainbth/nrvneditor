import { describe, expect, it } from "vitest";
import { splitBlocks } from "../../src/lib/blocks";
import { buildReplacement, parseProposal } from "../../src/lib/proposal";

const ALLOWED = new Set(["a", "b"]);

function replacementBlocks(content: string) {
  return splitBlocks(content).map((block) => ({
    key: block.key,
    startOffset: block.startOffset,
    endOffset: block.endOffset,
    raw: block.raw,
  }));
}

describe("parseProposal", () => {
  it("parsea una propuesta feliz con dos bloques", () => {
    const text = [
      '<<<NRVN_BLOCK key="a">>>',
      "Uno actualizado",
      "<<<NRVN_END>>>",
      "",
      "<<<NRVN_BLOCK key='b'>>>",
      "Dos actualizado",
      "<<<NRVN_END>>>",
    ].join("\n");

    expect(parseProposal(text, ALLOWED)).toEqual({
      ok: true,
      blocks: [
        { key: "a", after: "Uno actualizado" },
        { key: "b", after: "Dos actualizado" },
      ],
    });
  });

  it("tolera espacios variables, comillas simples y CRLF", () => {
    const text =
      "<<< NRVN_BLOCK key = 'a' >>>\r\nuno\r\ndos\r\n<<< NRVN_END >>>\r\n" +
      '<<<NRVN_BLOCK   key="b"   >>>\r\ntres\r\n<<<NRVN_END>>>';

    expect(parseProposal(text, ALLOWED)).toEqual({
      ok: true,
      blocks: [
        { key: "a", after: "uno\r\ndos" },
        { key: "b", after: "tres" },
      ],
    });
  });

  it("invalida toda la propuesta si una clave no pertenece a la selección", () => {
    const text = [
      '<<<NRVN_BLOCK key="a">>>',
      "Uno",
      "<<<NRVN_END>>>",
      '<<<NRVN_BLOCK key="intruso">>>',
      "No permitido",
      "<<<NRVN_END>>>",
    ].join("\n");

    const result = parseProposal(text, ALLOWED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.raw).toBe(text);
      expect(result.reason).toContain("intruso");
    }
  });

  it("rechaza claves duplicadas", () => {
    const text = [
      '<<<NRVN_BLOCK key="a">>>',
      "Uno",
      "<<<NRVN_END>>>",
      '<<<NRVN_BLOCK key="a">>>',
      "Otra vez",
      "<<<NRVN_END>>>",
    ].join("\n");

    const result = parseProposal(text, ALLOWED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("repetido");
  });

  it("rechaza texto no blanco fuera de los bloques", () => {
    const text = [
      "Claro, aquí está el cambio:",
      '<<<NRVN_BLOCK key="a">>>',
      "Uno",
      "<<<NRVN_END>>>",
    ].join("\n");

    const result = parseProposal(text, ALLOWED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("fuera de los bloques");
  });

  it("interpreta NRVN_NO_CHANGE como propuesta vacía", () => {
    expect(parseProposal("  <<<NRVN_NO_CHANGE>>>\n", ALLOWED)).toEqual({ ok: true, blocks: [] });
  });

  it("preserva fences, listas y sangría byte a byte dentro de after", () => {
    const after = ["```ts", "  const a = 1;", "```", "", "- item"].join("\n");
    const text = `<<<NRVN_BLOCK key="a">>>\n${after}\n<<<NRVN_END>>>`;

    expect(parseProposal(text, ALLOWED)).toEqual({
      ok: true,
      blocks: [{ key: "a", after }],
    });
  });

  it("falla si no hay bloques ni NRVN_NO_CHANGE", () => {
    const result = parseProposal("No puedo ayudarte con eso.", ALLOWED);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("No se encontró ninguna propuesta.");
  });
});

describe("buildReplacement", () => {
  it("reemplaza por offsets de mayor a menor sin desplazar los siguientes", () => {
    const content = "# T\n\nuno\n\ndos";
    const result = buildReplacement(content, replacementBlocks(content), [
      { key: "T#paragraph:0", after: "UNO" },
      { key: "T#paragraph:1", after: "DOS" },
    ]);

    expect(result).toEqual({ ok: true, content: "# T\n\nUNO\n\nDOS" });
  });

  it("falla si el bloque cambió desde que se propuso (prefijo sin tocar)", () => {
    const content = "# T\n\nuno";
    const blocks = replacementBlocks(content).map((block) =>
      block.key === "T#paragraph:0" ? { ...block, raw: "contenido anterior" } : block,
    );

    const result = buildReplacement(content, blocks, [{ key: "T#paragraph:0", after: "nuevo" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("cambió");
  });

  it("falla si la clave ya no existe", () => {
    const content = "# T\n\nuno";
    const result = buildReplacement(content, replacementBlocks(content), [
      { key: "T#paragraph:9", after: "nuevo" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("ya no existe");
  });

  it("una propuesta vacía deja el contenido intacto", () => {
    const content = "# T\n\nuno";
    expect(buildReplacement(content, [], [])).toEqual({ ok: true, content });
  });

  it("acepta bloques before en CRLF contra contenido LF", () => {
    const content = "# T\n\nuno\n\ndos";
    const blocks = replacementBlocks(content).map((block) => ({
      ...block,
      raw: block.raw.replace(/\n/g, "\r\n"),
    }));

    expect(buildReplacement(content, blocks, [{ key: "T#paragraph:0", after: "UNO" }])).toEqual({
      ok: true,
      content: "# T\n\nUNO\n\ndos",
    });
  });
});
