import { describe, expect, it } from "vitest";
import { AUDIENCES } from "../../src/lib/audiences";
import { buildDocumentPrompt, buildPrompt, buildReviewPrompt } from "../../src/lib/prompt";

const behavior = "  Mantén un tono amable.  ";
const block = { key: "b", type: "paragraph", raw: "Texto." };

describe("preset prompt behavior", () => {
  it.each([
    [
      "buildPrompt",
      (behavior?: string) =>
        buildPrompt({
          path: null,
          headingTrail: [],
          blocks: [block],
          instruction: "Edita.",
          behavior,
        }),
    ],
    [
      "buildDocumentPrompt",
      (behavior?: string) =>
        buildDocumentPrompt({
          path: null,
          content: "Texto.",
          blockCount: 1,
          instruction: "Edita.",
          behavior,
        }),
    ],
    [
      "buildReviewPrompt",
      (behavior?: string) =>
        buildReviewPrompt({
          path: null,
          headingTrail: [],
          blocks: [block],
          audience: AUDIENCES[0],
          targetAudience: null,
          instruction: "Revisa.",
          behavior,
        }),
    ],
  ])("%s inserta comportamiento recortado y omite el vacío", (_name, build) => {
    const withBehavior = build(behavior);
    expect(withBehavior).toContain("Comportamiento del preset:\nMantén un tono amable.");
    expect(withBehavior.indexOf("Comportamiento del preset:")).toBeLessThan(
      withBehavior.indexOf("Instrucción:"),
    );
    expect(build(undefined)).not.toContain("Comportamiento del preset:");
    expect(build("  ")).not.toContain("Comportamiento del preset:");
  });
});
