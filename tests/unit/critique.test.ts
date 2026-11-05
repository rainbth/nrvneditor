import { describe, expect, it } from "vitest";
import { parseReview, sanitizeFitting } from "../../src/lib/proposal";

const keys = new Set(["a", "b"]);
const response = (data: unknown, outside = "") =>
  `${outside}<<<NRVN_REVIEW>>>${JSON.stringify(data)}<<<NRVN_END>>>`;
const valid = {
  audience: "editor",
  blocks: ["a", "b"],
  works: ["Claro"],
  problems: [{ severity: "media", issue: "Falta", evidence: "Texto" }],
  suggestions: ["Añade"],
};

describe("parseReview", () => {
  it("admite fitting opcional, claves extra y sanea formato razonable", () => {
    const missing = parseReview(response(valid), keys, "editor");
    expect(missing.ok && missing.review.fitting).toBeNull();
    expect(parseReview(response({ ...valid, extra: true }), keys, "editor").ok).toBe(true);
    const parsed = parseReview(
      response({ ...valid, fitting: "```markdown\n# Título\n- Uno\n> Dos\n\nTres\n```" }),
      keys,
      "editor",
    );
    expect(parsed.ok && parsed.review.fitting).toBe("Título Uno Dos Tres");
    const blank = parseReview(response({ ...valid, fitting: "```\n\n```" }), keys, "editor");
    expect(blank.ok && blank.review.fitting).toBeNull();
    for (const fitting of [42, {}])
      expect(parseReview(response({ ...valid, fitting }), keys, "editor").ok).toBe(false);
    const marker = parseReview(response({ ...valid, fitting: "<<<NRVN_BLOCK" }), keys, "editor");
    expect(marker.ok).toBe(false);
    if (!marker.ok) expect(marker.reason).toContain("marcadores");
    const emphasis = parseReview(
      response({ ...valid, fitting: "Con **énfasis** inline." }),
      keys,
      "editor",
    );
    expect(emphasis.ok && emphasis.review.fitting).toBe("Con **énfasis** inline.");
  });

  it("sanitizeFitting elimina fences y prefijos", () => {
    expect(sanitizeFitting("```markdown\n# Título\n- Uno\n> Dos\n\nTres\n```")).toBe(
      "Título Uno Dos Tres",
    );
    expect(sanitizeFitting("~~~\n  \n~~~")).toBeNull();
    expect(sanitizeFitting("> - Uno\n> 1. Dos")).toBe("Uno Dos");
  });

  it("valida los bloques exactos, audiencia y esquema de problemas", () => {
    expect(parseReview(response(valid), keys, "editor").ok).toBe(true);
    expect(parseReview(response({ ...valid, blocks: ["a"] }), keys, "editor").ok).toBe(false);
    expect(parseReview(response({ ...valid, blocks: ["a", "a"] }), keys, "editor").ok).toBe(false);
    expect(parseReview(response({ ...valid, audience: "pm" }), keys, "editor").ok).toBe(false);
    expect(parseReview(response({ ...valid, works: "texto" }), keys, "editor").ok).toBe(false);
    expect(parseReview(response({ ...valid, works: [""] }), keys, "editor").ok).toBe(false);
    expect(parseReview(response({ ...valid, suggestions: [""] }), keys, "editor").ok).toBe(false);
    expect(
      parseReview(
        response({ ...valid, problems: [{ ...valid.problems[0], extra: true }] }),
        keys,
        "editor",
      ).ok,
    ).toBe(true);
    expect(
      parseReview(
        response({ ...valid, problems: [{ ...valid.problems[0], severity: ["alta"] }] }),
        keys,
        "editor",
      ).ok,
    ).toBe(false);
    expect(
      parseReview(
        response({ ...valid, problems: [{ severity: "crítica", issue: "X", evidence: "Y" }] }),
        keys,
        "editor",
      ).ok,
    ).toBe(false);
    expect(parseReview("<<<NRVN_REVIEW>>>{bad}<<<NRVN_END>>>", keys, "editor").ok).toBe(false);
    expect(parseReview(response(valid, "exterior"), keys, "editor").ok).toBe(false);
    const fenced = `\`\`\`json\n${response(valid)}\n\`\`\``;
    expect(parseReview(fenced, keys, "editor").ok).toBe(true);
    const fourBackticks = `\`\`\`\`json\n${response(valid)}\n\`\`\`\``;
    expect(parseReview(fourBackticks, keys, "editor").ok).toBe(true);
    expect(parseReview(`prosa\n\`\`\`json\n${response(valid)}\n\`\`\``, keys, "editor").ok).toBe(
      false,
    );
    const emptyReview = { ...valid, works: [], problems: [], suggestions: [], fitting: null };
    expect(parseReview(response(emptyReview), keys, "editor").ok).toBe(true);
    expect(parseReview(response({ ...emptyReview, fitting: "Texto" }), keys, "editor").ok).toBe(
      false,
    );
  });

  it("acepta alias de audiencia y null cuando corresponde", () => {
    expect(parseReview(response({ ...valid, audience: "cualquiera" }), keys, "director").ok).toBe(
      false,
    );
    expect(
      parseReview(response({ ...valid, audience: "decisor-ejecutivo" }), keys, "director").ok,
    ).toBe(false);
    const alias = parseReview(response({ ...valid, audience: "producto" }), keys, "pm");
    expect(alias.ok && alias.review.audience).toBe("pm");
    expect(parseReview(response({ ...valid, audience: null }), keys, null).ok).toBe(true);
    expect(parseReview(response({ ...valid, audience: null }), keys, "editor").ok).toBe(false);
  });

  it("normaliza problemas y elimina reglas horizontales del fitting", () => {
    const parsed = parseReview(
      response({
        ...valid,
        problems: [{ ...valid.problems[0], extra: true, issue: "  Falta  ", evidence: " Texto " }],
      }),
      keys,
      "editor",
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok)
      expect(parsed.review.problems[0]).toEqual({
        severity: "media",
        issue: "Falta",
        evidence: "Texto",
      });
    expect(sanitizeFitting("Texto\n---\nMás")).toBe("Texto Más");
  });
});
