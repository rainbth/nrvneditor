import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { settingsSchema } from "../../electron/types";

describe("page size settings and styles", () => {
  it("defaults page size and tree outline ratio", () => {
    const settings = settingsSchema.parse({});
    expect(settings.render.pageSize).toBe("letter");
    expect(settings.panelHeights.treeOutline).toBe(0.5);
  });

  it("accepts all page presets and rejects unknown presets", () => {
    for (const pageSize of ["a4", "wide", "web", "letter"]) {
      expect(settingsSchema.safeParse({ render: { pageSize } }).success).toBe(true);
    }
    expect(settingsSchema.safeParse({ render: { pageSize: "tabloid" } }).success).toBe(false);
  });

  it("defines page dimensions that scale with the page zoom", () => {
    const css = readFileSync("src/styles/global.css", "utf8");
    // La hoja entera escala con --page-zoom: ancho, padding y alto.
    expect(css).toContain("--page-width: calc(816px * var(--page-zoom, 1))");
    expect(css).toContain("--page-padding: calc(96px * var(--page-zoom, 1))");
    expect(css).toContain('[data-page-size="a4"]');
    expect(css).toContain("--page-width: calc(794px * var(--page-zoom, 1))");
    expect(css).toContain("--page-width: calc(960px * var(--page-zoom, 1))");
    expect(css).toContain("--page-padding: calc(48px * var(--page-zoom, 1))");
    expect(css.match(/\.document-sheet[^}]*transform:\s*scale/s)).toBeNull();
  });
});
