import { describe, expect, it } from "vitest";
import { agentBlockInstruction, buildAgentBlockPrompt } from "../../src/lib/prompt";

describe("agent block prompt", () => {
  it("limits the proposal marker to target and supplies plain-text context", () => {
    const prompt = buildAgentBlockPrompt({
      path: "guia.md",
      headingTrail: [],
      target: { key: "target", raw: "" },
      before: { raw: "anterior" },
      after: { raw: "siguiente" },
      instruction: "instrucción",
    });
    expect(prompt).toContain("Contexto anterior (solo lectura, no lo devuelvas):\nanterior");
    expect(prompt).toContain("Contexto siguiente (solo lectura, no lo devuelvas):\nsiguiente");
    expect(prompt.match(/^<<<NRVN_BLOCK/gm)).toHaveLength(1);
    expect(prompt).toContain('key="target"');
    expect(prompt).not.toContain('key="vecino"');
    expect(prompt).toContain("instrucción");
    expect(prompt).toContain("Contrato de salida");
  });
  it("selects instruction by available neighbors", () => {
    expect(agentBlockInstruction(true, true)).toContain("transición");
    expect(agentBlockInstruction(true, false)).toContain("continúe");
    expect(agentBlockInstruction(false, true)).toContain("introductorio");
    expect(agentBlockInstruction(false, false)).toContain("párrafo nuevo");
  });
});
