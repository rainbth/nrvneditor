import { describe, expect, it } from "vitest";
import { REVIEW_LENSES, reviewLensById, reviewLensGuidance } from "../../src/lib/review-lens";

describe("review lenses", () => {
  it("exposes the five ordered selectable lenses with icon metadata", () => {
    expect(REVIEW_LENSES.map(({ id, label }) => [id, label])).toEqual([
      ["works", "Qué ve bien"],
      ["problems", "Qué ve mal"],
      ["questions", "Qué preguntaría"],
      ["missing", "Qué le faltaría"],
      ["complete", "Revisión completa"],
    ]);
    expect(REVIEW_LENSES.every((lens) => lens.icon && lens.description)).toBe(true);
    expect(
      REVIEW_LENSES.every((lens) => typeof lens.icon === "string" && lens.icon.endsWith(".png")),
    ).toBe(true);
    expect(new Set(REVIEW_LENSES.map((lens) => lens.icon)).size).toBe(5);
    expect(reviewLensById("questions")?.label).toBe("Qué preguntaría");
  });
  it("defines focus, prohibition, and correct output coverage per lens", () => {
    const focuses = new Set<string>();
    const prohibitions = new Set<string>();
    const coverages = new Set<string>();
    for (const { id } of REVIEW_LENSES) {
      const guidance = reviewLensGuidance(id);
      expect(guidance.focus).toBeTruthy();
      expect(guidance.avoid).toBeTruthy();
      expect(guidance.coverage).toBeTruthy();
      focuses.add(guidance.focus);
      prohibitions.add(guidance.avoid);
      coverages.add(guidance.coverage);
    }
    expect(focuses.size).toBe(5);
    expect(prohibitions.size).toBe(5);
    expect(coverages.size).toBe(5);
    expect(reviewLensGuidance("works").coverage).toContain('"works"');
    expect(reviewLensGuidance("complete").coverage).toContain('"problems"');
    expect(reviewLensGuidance("inventada")).toEqual(reviewLensGuidance("complete"));
  });
});
