import { describe, expect, it } from "vitest";
import { buildDocumentPrompt } from "../../src/lib/prompt";

describe("buildDocumentPrompt", () => {
  it("incluye el documento completo, sus marcadores y el contrato de salida", () => {
    const content = "# Guía\n\nEscribe con frases cortas.";
    const prompt = buildDocumentPrompt({
      path: "guia-estilo.md",
      content,
      blockCount: 2,
      instruction: "Hazlo más claro.",
    });

    expect(prompt).toContain(
      "Eres el agente editor de nrvn. Trabajas sobre el documento Markdown completo.",
    );
    expect(prompt).toContain("Archivo: guia-estilo.md");
    expect(prompt).toContain("Modo: documento completo");
    expect(prompt).toContain("Bloques: 2");
    expect(prompt).toContain(`Caracteres: ${content.length}`);
    expect(prompt).toContain("<<<NRVN_DOCUMENT>>>");
    expect(prompt).toContain(content);
    expect(prompt).toContain("<<<NRVN_END>>>");
    expect(prompt).toContain("Contrato de salida:");
    expect(prompt).toContain("Instrucción:\nHazlo más claro.");
    expect(prompt).not.toContain("<<<NRVN_BLOCK");
  });

  it("documento vacío escribe exactamente el marcador de vacío y ningún contenido", () => {
    const prompt = buildDocumentPrompt({
      path: null,
      content: "",
      blockCount: 0,
      instruction: "Crea un documento.",
    });

    expect(prompt).toContain("Archivo: Borrador sin título");
    expect(prompt).toContain("Bloques: 0");
    expect(prompt).toContain("Caracteres: 0");
    expect(prompt).toContain("Documento vacío (0 caracteres)");
    expect(prompt.match(/Documento vacío \(0 caracteres\)/g)).toHaveLength(1);
  });

  it("coloca el documento anterior rechazado antes de la instrucción", () => {
    const prompt = buildDocumentPrompt({
      path: "notas.md",
      content: "# Actual\n",
      blockCount: 1,
      instruction: "Prueba otro enfoque.",
      previousDocument: { before: "# Actual\n", after: "# Propuesto\n" },
    });

    expect(prompt).toContain("Documento anterior (rechazado):");
    expect(prompt).toContain("antes:\n# Actual\n");
    expect(prompt).toContain("después:\n# Propuesto\n");
    expect(prompt.indexOf("Documento anterior (rechazado):")).toBeLessThan(
      prompt.indexOf("Instrucción:"),
    );
  });
});
