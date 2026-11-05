import { describe, expect, it } from "vitest";
import { buildFittingInstruction } from "../../src/lib/prompt";

describe("buildFittingInstruction", () => {
  it("incluye revisor, lente, fidelidad y contrato sin texto extra", () => {
    const prompt = buildFittingInstruction({
      reviewer: { name: "Editora", role: "editora técnica" },
      lens: "problems",
      problems: [{ severity: "high", issue: "vago", evidence: "texto" }],
      suggestions: ["concretar"],
    });
    expect(prompt).toContain("Editora (editora técnica)");
    expect(prompt).toContain("Qué ve mal");
    expect(prompt).toContain("SOLO el párrafo");
    expect(prompt).toContain("Intervención mínima");
    expect(prompt).toContain("voz y el registro");
    expect(prompt).toContain("formato Markdown");
    expect(prompt).toContain("Sugerencia de mejora para el párrafo revisado.");
    expect(prompt).toContain("Prohibido explicar");
    expect(prompt).toContain("Corrige solo los problemas más críticos listados.");
    expect(prompt).toContain("[high] vago: texto");
  });
});
