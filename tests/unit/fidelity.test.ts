import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIENCES } from "../../src/lib/audiences";
import {
  buildAgentBlockPrompt,
  buildDocumentPrompt,
  buildPrompt,
  buildReviewPrompt,
  buildVariantInstruction,
  fidelityRules,
  REVIEWER_AUDIENCE_DEFINITION,
} from "../../src/lib/prompt";

const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8");
const block = { key: "b", type: "paragraph", raw: "Texto." };

const prompts = {
  buildPrompt: buildPrompt({
    path: null,
    headingTrail: [],
    blocks: [block],
    instruction: "Edita.",
  }),
  buildDocumentPrompt: buildDocumentPrompt({
    path: null,
    content: "Texto.",
    blockCount: 1,
    instruction: "Edita.",
  }),
  buildAgentBlockPrompt: buildAgentBlockPrompt({
    path: null,
    headingTrail: [],
    target: { key: "b", raw: "Texto." },
    instruction: "Escribe.",
  }),
  buildReviewPrompt: buildReviewPrompt({
    path: null,
    headingTrail: [],
    blocks: [block],
    audience: AUDIENCES[0],
    targetAudience: null,
    instruction: "Revisa.",
  }),
};

describe("política de fidelidad al autor", () => {
  it("define una única fuente con intervención mínima, voz, ritmo y formato", () => {
    const rules = fidelityRules().join(" ");
    expect(rules).toContain("Intervención mínima");
    expect(rules).toContain("voz y el registro");
    expect(rules).toContain("longitud aproximada y el ritmo");
    expect(rules).toContain("estructura y el formato Markdown");
    expect(rules).toContain("No reescribas lo que ya funciona");
    expect(rules).toContain("vocabulario que el autor no usaría");
  });

  it("se inyecta en todos los prompts de generación y revisión", () => {
    for (const [name, prompt] of Object.entries(prompts)) {
      expect(prompt, name).toContain("Reglas de fidelidad");
      for (const rule of fidelityRules()) expect(prompt, name).toContain(rule);
    }
  });

  it("comparte la definición revisor ≠ audiencia en los prompts y la variante", () => {
    for (const name of ["buildPrompt", "buildDocumentPrompt", "buildReviewPrompt"] as const) {
      expect(prompts[name], name).toContain(REVIEWER_AUDIENCE_DEFINITION);
    }
    expect(buildVariantInstruction({ works: ["Ok"], problems: [], suggestions: [] })).toContain(
      REVIEWER_AUDIENCE_DEFINITION,
    );
  });
});

describe("variante desde revisión", () => {
  const instruction = buildVariantInstruction({
    works: ["El tono funciona"],
    problems: [{ severity: "media", issue: "Falta un ejemplo", evidence: "Párrafo 2" }],
    suggestions: ["Añade un ejemplo concreto tras la definición"],
  });

  it("exige cambio mínimo y prohíbe reescribir lo que funciona", () => {
    expect(instruction).toContain(
      "Aplica solo los cambios necesarios para resolver los problemas listados. No toques el resto del bloque.",
    );
    expect(instruction).toContain("mínimo y quirúrgico");
    expect(instruction).toContain("No reescribas bloques que ya funcionan");
    for (const rule of fidelityRules()) expect(instruction).toContain(rule);
  });

  it("conserva la revisión y sus sugerencias puntuales", () => {
    expect(instruction).toContain("Conserva lo que funciona:");
    expect(instruction).toContain("El tono funciona");
    expect(instruction).toContain("Falta un ejemplo");
    expect(instruction).toContain("Añade un ejemplo concreto tras la definición");
  });
});

describe("prompt de revisión quirúrgico", () => {
  it("pide sugerencias puntuales y prohíbe cambios de estilo gratuitos", () => {
    const prompt = buildReviewPrompt({
      path: null,
      headingTrail: [],
      blocks: [block],
      audience: AUDIENCES[0],
      targetAudience: null,
      instruction: "Revisa.",
    });
    expect(prompt).toContain('"suggestions" son quirúrgicas y ejecutables');
    expect(prompt).toContain("no reescribas el bloque");
    expect(prompt).toContain("Prohibido proponer cambios de estilo gratuitos");
  });
});

describe("copy de UI revisor ≠ audiencia", () => {
  it("presenta el selector como un ayudante con un rol concreto", () => {
    const picker = read("src/components/agent/ReviewerPicker.tsx");
    expect(picker).toContain("Elige un ayudante");
    expect(picker).toContain("Un ayudante con un rol concreto que critica este bloque");
    expect(picker).toContain("No es la audiencia");
  });

  it("presenta el chip como para quién escribes y modula el tono, sin criticar", () => {
    const chip = read("src/components/agent/AudienceChip.tsx");
    expect(chip).toContain("Para quién escribo");
    expect(chip).toContain("Para quién escribes · modula el tono, no critica");
  });
});
