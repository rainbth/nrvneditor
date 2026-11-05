import { describe, expect, it } from "vitest";
import { classifyToast } from "../../src/lib/toast";

describe("classifyToast", () => {
  it("classifies informational, actionable and error messages", () => {
    expect(classifyToast("Markdown copiado")).toEqual({ tone: "info", durationMs: 4000 });
    expect(classifyToast("Bloque eliminado · ⌘Z para deshacer")).toEqual({
      tone: "action",
      durationMs: 10000,
    });
    expect(classifyToast("No se pudo copiar")).toEqual({ tone: "error", durationMs: 10000 });
  });
});
