import { describe, expect, it } from "vitest";
import {
  AUDIENCES,
  audienceAvatar,
  audienceById,
  audienceName,
  audienceTone,
  primaryCritiqueBlockKey,
  primaryReviewBlockKey,
  REVIEWERS,
  reviewerById,
  TARGET_AUDIENCES,
  targetAudienceById,
} from "../../src/lib/audiences";

describe("audiencias", () => {
  it("ofrece un roster estático con ids únicos y resolubles", () => {
    expect(AUDIENCES).toHaveLength(7);
    expect(REVIEWERS.map(({ id }) => id)).toEqual([
      "director",
      "ejecutivo",
      "par",
      "pm",
      "cliente-esceptico",
      "lector-tecnico",
      "editor",
    ]);
    expect(new Set(AUDIENCES.map(({ id }) => id)).size).toBe(AUDIENCES.length);
    for (const audience of AUDIENCES) {
      expect(audienceById(audience.id)).toBe(audience);
      expect(audience.defaultInstruction.trim()).not.toBe("");
      expect(audience.avatar.trim()).not.toBe("");
      expect(["blue", "sage", "lavender", "butter", "pearl", "accent"]).toContain(audience.tone);
    }
    expect(audienceById("inexistente")).toBeNull();
    expect(audienceName(null)).toBe("Sin revisor");
    expect(reviewerById("producto")?.id).toBe("pm");
    expect(audienceAvatar("missing")).toBe("👤");
    expect(audienceTone("missing")).toBe("blue");
    expect(primaryCritiqueBlockKey(null)).toBeNull();
    expect(primaryCritiqueBlockKey({ audience: "editor", blocks: [] })).toBeNull();
    expect(
      primaryCritiqueBlockKey({ audience: "editor", blocks: [{ key: "first" } as never] }),
    ).toBe("first");
    expect(primaryReviewBlockKey(null)).toBeNull();
    expect(primaryReviewBlockKey({ blocks: ["first"] })).toBe("first");
    expect(TARGET_AUDIENCES.map(({ id }) => id)).toEqual([
      "general",
      "tecnico",
      "decisor",
      "academico",
      "cliente",
    ]);
    expect(
      TARGET_AUDIENCES.some(({ id }) => REVIEWERS.some((reviewer) => reviewer.id === id)),
    ).toBe(false);
    expect(targetAudienceById("ejecutivo")?.id).toBe("decisor");
  });
});
