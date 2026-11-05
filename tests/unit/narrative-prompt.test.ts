import { describe, expect, it } from "vitest";
import { mockAssistantText } from "../../src/lib/mock-bridge";
import { buildNarrativePrompt, narrativeEligibility } from "../../src/lib/prompt";
import { parseProposal } from "../../src/lib/proposal";

const base = {
  path: "guia-estilo.md",
  headingTrail: ["Guía de estilo", "Escritura"],
  target: { key: "Guía › Escritura#paragraph:0", raw: "Escribir en presente y con frases cortas." },
  before: { raw: "La pauta general es simple." },
  after: { raw: "Cuando dudes, prioriza la claridad." },
};

describe("narrativeEligibility", () => {
  const long =
    "Esta frase tiene suficientes palabras para poder reducirse sin perder su sentido completo.";
  it("admite párrafo, cita y lista", () => {
    expect(narrativeEligibility("paragraph", long, "extend").ok).toBe(true);
    expect(narrativeEligibility("quote", long, "reduce").ok).toBe(true);
    expect(narrativeEligibility("list", long, "reduce").ok).toBe(true);
  });
  it("rechaza tipos no reescribibles, frontmatter y bloques vacíos", () => {
    for (const type of ["heading", "code", "table", "hr", "html"] as const)
      expect(narrativeEligibility(type, long, "extend").ok).toBe(false);
    expect(narrativeEligibility("paragraph", "---\ntitle: x\n---", "extend")).toMatchObject({
      ok: false,
      reason: "No se reescribe el frontmatter",
    });
    expect(narrativeEligibility("heading", long, "extend").reason).toContain("encabezados");
    expect(narrativeEligibility("paragraph", "   \n ", "extend").ok).toBe(false);
  });
  it("bloquea extender un bloque de menos de seis palabras", () => {
    expect(narrativeEligibility("paragraph", "solo tres palabras", "extend")).toMatchObject({
      ok: false,
      reason: "El bloque es demasiado corto para extender",
    });
  });
  it("aplica exactamente los límites de extensión y reducción", () => {
    expect(narrativeEligibility("paragraph", "uno dos tres cuatro cinco seis", "extend").ok).toBe(
      true,
    );
    expect(narrativeEligibility("paragraph", "uno dos tres cuatro cinco", "extend")).toMatchObject({
      ok: false,
      reason: "El bloque es demasiado corto para extender",
    });
    expect(
      narrativeEligibility("paragraph", "uno dos tres cuatro cinco seis siete ocho", "reduce").ok,
    ).toBe(true);
    expect(
      narrativeEligibility("paragraph", "uno dos tres cuatro cinco seis siete", "reduce").ok,
    ).toBe(false);
  });
  it("bloquea reducir un bloque demasiado corto", () => {
    expect(narrativeEligibility("paragraph", "dos palabras", "reduce")).toMatchObject({
      ok: false,
      reason: "El bloque es demasiado corto para reducir",
    });
  });
});

describe("buildNarrativePrompt", () => {
  it("extiende con reglas de preservación y sin invención", () => {
    const prompt = buildNarrativePrompt({ ...base, kind: "extend" });
    expect(prompt).toContain('<<<NRVN_BLOCK key="Guía › Escritura#paragraph:0">>>');
    expect(prompt).toContain(base.target.raw);
    expect(prompt).toContain("Contexto anterior (solo lectura, no lo devuelvas):");
    expect(prompt).toContain("Contexto siguiente (solo lectura, no lo devuelvas):");
    expect(prompt).toContain("entre 1,6 y 2,2 veces");
    expect(prompt).toContain("prioriza la fidelidad sobre la longitud objetivo");
    expect(prompt).not.toContain("el objetivo de longitud de la tarea prevalece");
    expect(prompt).toContain("Prohibido inventar datos, cifras, nombres o citas");
    expect(prompt).toContain("persona gramatical");
    expect(prompt).toContain("Preserva el formato Markdown");
    expect(prompt).toContain("<<<NRVN_END>>>");
    expect(prompt).not.toContain("entre el 40 % y el 60 %");
  });
  it("reduce con objetivo de longitud y conserva la conclusión", () => {
    const prompt = buildNarrativePrompt({ ...base, kind: "reduce" });
    expect(prompt).toContain("entre el 40 % y el 60 %");
    expect(prompt).toContain("conclusión");
    expect(prompt).toContain("No elimines la conclusión");
    expect(prompt).toContain("No reduzcas por debajo de 6 palabras");
    expect(prompt).not.toContain("entre 1,6 y 2,2 veces");
  });
});

describe("mock de reescritura narrativa", () => {
  it("devuelve una propuesta parseable que alarga y otra que acorta", () => {
    const extend = mockAssistantText(buildNarrativePrompt({ ...base, kind: "extend" }));
    const reduce = mockAssistantText(buildNarrativePrompt({ ...base, kind: "reduce" }));
    const parsedExtend = parseProposal(extend, new Set([base.target.key]));
    const parsedReduce = parseProposal(reduce, new Set([base.target.key]));
    expect(parsedExtend.ok).toBe(true);
    expect(parsedReduce.ok).toBe(true);
    if (!parsedExtend.ok || !parsedReduce.ok) return;
    expect(parsedExtend.blocks[0]?.after.length).toBeGreaterThan(base.target.raw.length);
    expect(parsedReduce.blocks[0]?.after.length).toBeLessThan(base.target.raw.length);
  });
});
