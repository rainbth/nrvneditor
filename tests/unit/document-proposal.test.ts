import { describe, expect, it } from "vitest";
import { buildDocumentReplacement, parseDocumentProposal } from "../../src/lib/proposal";

describe("parseDocumentProposal", () => {
  it("acepta un documento multilínea con fences y preserva el contenido", () => {
    const content = "# Título\n\n```ts\nconst x = 1;\n```\n\nTexto.";
    const text = `<<<NRVN_DOCUMENT>>>\n${content}\n<<<NRVN_END>>>`;

    expect(parseDocumentProposal(text)).toEqual({ ok: true, content });
  });

  it("retira un único salto de cortesía CRLF en cada extremo", () => {
    const text = "<<<NRVN_DOCUMENT>>>\r\nA\r\nB\r\n<<<NRVN_END>>>";
    expect(parseDocumentProposal(text)).toEqual({ ok: true, content: "A\r\nB" });
  });

  it("permite un documento vacío entre marcadores", () => {
    expect(parseDocumentProposal("<<<NRVN_DOCUMENT>>><<<NRVN_END>>>")).toEqual({
      ok: true,
      content: "",
    });
  });

  it("falla si falta el marcador de cierre", () => {
    const result = parseDocumentProposal("<<<NRVN_DOCUMENT>>>\ncontenido");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("No se encontró el documento de la propuesta.");
    }
  });

  it("falla con texto antes o después de los marcadores", () => {
    expect(parseDocumentProposal("antes\n<<<NRVN_DOCUMENT>>>\nx\n<<<NRVN_END>>>").ok).toBe(false);
    expect(parseDocumentProposal("<<<NRVN_DOCUMENT>>>\nx\n<<<NRVN_END>>>\ndespués").ok).toBe(false);
  });

  it("falla con marcadores duplicados", () => {
    const text =
      "<<<NRVN_DOCUMENT>>>\nuno\n<<<NRVN_END>>>\n<<<NRVN_DOCUMENT>>>\ndos\n<<<NRVN_END>>>";
    expect(parseDocumentProposal(text).ok).toBe(false);
  });

  it("interpreta NRVN_NO_CHANGE como ausencia de propuesta", () => {
    expect(parseDocumentProposal("<<<NRVN_NO_CHANGE>>>")).toEqual({ ok: true, content: null });
    expect(parseDocumentProposal("  <<<NRVN_NO_CHANGE>>>  ")).toEqual({
      ok: true,
      content: null,
    });
  });

  it("falla si NRVN_NO_CHANGE va acompañado de texto", () => {
    expect(parseDocumentProposal("<<<NRVN_NO_CHANGE>>>\nexplica algo").ok).toBe(false);
  });
});

describe("buildDocumentReplacement", () => {
  it("devuelve el contenido nuevo si el actual coincide con el propuesto", () => {
    expect(buildDocumentReplacement("# Uno\n", "# Uno\n", "# Dos\n")).toEqual({
      ok: true,
      content: "# Dos\n",
    });
  });

  it("rechaza el reemplazo si el documento cambió", () => {
    const result = buildDocumentReplacement("# Cambiado\n", "# Uno\n", "# Dos\n");
    expect(result).toEqual({
      ok: false,
      error: "El documento cambió desde que se propuso el cambio.",
    });
  });

  it("acepta before en CRLF contra current en LF", () => {
    expect(
      buildDocumentReplacement("# Uno\n\nTexto\n", "# Uno\r\n\r\nTexto\r\n", "# Dos\n"),
    ).toEqual({ ok: true, content: "# Dos\n" });
  });
});
