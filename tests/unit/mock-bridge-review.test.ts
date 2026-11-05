import { describe, expect, it } from "vitest";
import { mockAssistantText } from "../../src/lib/mock-bridge";
import { parseReview } from "../../src/lib/proposal";

const promptFor = (audience: string) =>
  `Audiencia objetivo: ${audience}\n<<<NRVN_BLOCK key="block-a">>>\nTexto\nContrato de salida (revisión estructurada en 3 bloques):`;
const promptForReviewer = (id: string) =>
  `Revisor: Director/a (Visión y ambición)\nId del revisor: ${id}\nPerspectiva del revisor: Evalúa\nAudiencia objetivo: Lector general\n<<<NRVN_BLOCK key="block-a">>>\nTexto\nContrato de salida (revisión estructurada en 3 bloques):`;

describe("mock review response", () => {
  it("returns a parseable review without a defined audience", () => {
    const response = mockAssistantText(promptFor("sin definir (texto general)"));
    const parsed = parseReview(response, new Set(["block-a"]), null);
    expect(response).toContain('"audience":null');
    expect(parsed.ok).toBe(true);
  });

  it("returns no findings when all blocks contain fewer than twelve words", () => {
    const response = mockAssistantText(promptFor("sin definir (texto general)"));
    expect(response).toContain('"works":[],"problems":[],"suggestions":[],"fitting":null');
  });

  it("provides five complete review points for sufficiently long text", () => {
    const prompt = `Audiencia objetivo: sin definir (texto general)\n<<<NRVN_BLOCK key="block-a">>>\nEste es un párrafo suficientemente largo con detalles verificables, contexto, ejemplos, explicación y una conclusión clara para evaluar.\n<<<NRVN_END>>>\nLente de revisión: Completa (id: complete)\nContrato de salida (revisión estructurada)`;
    const response = mockAssistantText(prompt);
    expect(
      JSON.parse(response.split("<<<NRVN_REVIEW>>>")[1].split("<<<NRVN_END>>>")[0]).works,
    ).toHaveLength(5);
  });

  it("returns the audience id from the audience line", () => {
    const response = mockAssistantText(promptFor("Editor/a de mesa (editor)"));
    expect(response).toContain('"audience":"editor"');
  });

  it("returns the reviewer id from the new prompt and parses the review", () => {
    const response = mockAssistantText(promptForReviewer("director"));
    const parsed = parseReview(response, new Set(["block-a"]), "director");
    expect(response).toContain('"audience":"director"');
    expect(parsed.ok).toBe(true);
  });
});
