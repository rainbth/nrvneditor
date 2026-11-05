import { describe, expect, it } from "vitest";
import { AUDIENCES, TARGET_AUDIENCES } from "../../src/lib/audiences";
import { buildReviewPrompt } from "../../src/lib/prompt";
import { REVIEW_LENSES, reviewLensGuidance } from "../../src/lib/review-lens";

describe("prompt de revisión", () => {
  it("exige un máximo de cuatro puntos honestos y respuesta vacía si no hay material", () => {
    for (const lens of REVIEW_LENSES) {
      const prompt = buildReviewPrompt({
        path: null,
        headingTrail: [],
        audience: AUDIENCES[0],
        instruction: "Evalúa",
        lens: lens.id,
        blocks: [
          {
            key: "k",
            type: "paragraph",
            raw: "Texto suficiente para una revisión completa y verificable del contenido.",
          },
        ],
      });
      expect(prompt).toContain("como máximo 4 elementos");
      expect(prompt).toContain("real y verificable");
      expect(prompt).toContain("demasiado breve o simple");
    }
  });
  it.each(REVIEW_LENSES)("inyecta foco y prohibición de la lente $id", (lens) => {
    const prompt = buildReviewPrompt({
      path: null,
      headingTrail: [],
      audience: AUDIENCES[0],
      instruction: "Evalúa",
      lens: lens.id,
      blocks: [{ key: "k", type: "paragraph", raw: "Hola." }],
    });
    expect(prompt).toContain(`Lente de revisión: ${lens.label} (id: ${lens.id})`);
    const guidance = reviewLensGuidance(lens.id);
    expect(prompt).toContain(`Foco: ${guidance.focus}`);
    expect(prompt).toContain(`Prohibición: ${guidance.avoid}`);
    expect(prompt).toContain(`Cobertura: ${guidance.coverage}`);
  });

  it("genera contratos de prompt distintos y conserva las reglas del lente completo", () => {
    const prompts = REVIEW_LENSES.map((lens) =>
      buildReviewPrompt({
        path: null,
        headingTrail: [],
        audience: AUDIENCES[0],
        instruction: "Evalúa",
        lens: lens.id,
        blocks: [{ key: "k", type: "paragraph", raw: "Hola." }],
      }),
    );
    expect(new Set(prompts).size).toBe(REVIEW_LENSES.length);
    const questions = prompts[REVIEW_LENSES.findIndex((lens) => lens.id === "questions")];
    const complete = prompts[REVIEW_LENSES.findIndex((lens) => lens.id === "complete")];
    expect(questions).not.toContain("cómo arreglar");
    expect(complete).toContain("cómo arreglar");
    expect(complete).toContain(
      '"works": lo que funciona. "problems": lo que no funciona, con evidencia. "suggestions": cómo arreglar cada punto.',
    );
    expect(complete).toContain("di qué cambiar puntualmente");
  });
  it("incluye revisor, audiencia objetivo, bloque y contrato de revisión", () => {
    const audience = AUDIENCES[0];
    const prompt = buildReviewPrompt({
      path: "guia.md",
      headingTrail: ["Inicio"],
      audience,
      instruction: "Evalúa",
      blocks: [{ key: "guia.md#paragraph:0", type: "paragraph", raw: "Hola." }],
    });
    expect(prompt).toContain(`Revisor: ${audience.name} (${audience.role})`);
    expect(prompt).toContain(`Id del revisor: ${audience.id}`);
    expect(prompt).toContain(`Perspectiva del revisor: ${audience.perspective}`);
    expect(prompt).toContain("Audiencia objetivo: sin definir (texto general)");
    expect(prompt).toContain("El revisor es un ayudante con un rol concreto que critica el texto");
    expect(prompt).toContain("la audiencia es el destinatario del texto");
    expect(prompt).toContain('key="guia.md#paragraph:0"');
    expect(prompt).toContain("NRVN_REVIEW");
    expect(prompt).toContain("works");
    expect(prompt).toContain("problems");
    expect(prompt).toContain("suggestions");
    expect(prompt).toContain('"fitting"');
    expect(prompt).toContain("más críticos");
    expect(prompt).toContain("único párrafo breve (Markdown plano");
    expect(prompt).toContain("No reescribas");
    expect(prompt).toContain('salvo en "fitting"');
  });

  it("describe una audiencia sin definir como texto general", () => {
    const prompt = buildReviewPrompt({
      path: "guia.md",
      headingTrail: [],
      audience: null,
      instruction: "Evalúa",
      blocks: [{ key: "guia.md#paragraph:0", type: "paragraph", raw: "Hola." }],
    });
    expect(prompt).toContain("sin definir (texto general)");
    expect(prompt).toContain('"audience" debe ser null: no hay revisor solicitado.');
  });

  it("fija el id literal del revisor y marca la audiencia objetivo como no usable", () => {
    const audience = AUDIENCES.find((item) => item.id === "director");
    const targetAudience = TARGET_AUDIENCES.find((item) => item.id === "decisor");
    expect(audience).toBeDefined();
    expect(targetAudience).toBeDefined();
    if (audience === undefined || targetAudience === undefined) return;
    const prompt = buildReviewPrompt({
      path: "guia.md",
      headingTrail: [],
      audience,
      targetAudience,
      instruction: "Evalúa",
      blocks: [{ key: "guia.md#paragraph:0", type: "paragraph", raw: "Hola." }],
    });
    expect(prompt).toContain(
      '"audience" debe contener exactamente el id del revisor solicitado: "director".',
    );
    expect(prompt).toContain("Audiencia objetivo: Decisor ejecutivo");
    expect(prompt).toContain('NO copies su id ni su nombre en "audience"');
    expect(prompt).not.toContain('"decisor"');
  });
});
