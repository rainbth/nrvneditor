import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesDir = path.resolve("src/styles");
const cssFiles = fs.readdirSync(stylesDir).filter((file) => file.endsWith(".css"));
const css = new Map(
  cssFiles.map((file) => [file, fs.readFileSync(path.join(stylesDir, file), "utf8")]),
);

describe("design tokens", () => {
  it("keeps literal colors exclusively in tokens.css", () => {
    for (const [file, source] of css) {
      if (file !== "tokens.css") expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it("uses tokenized focus rings and has no dead spacing tokens", () => {
    for (const source of css.values())
      expect(source).not.toContain("outline: 2px solid var(--color-accent)");
    const tokens = css.get("tokens.css") ?? "";
    expect(tokens).not.toMatch(/--space-(11|12)\s*:/);
  });

  it("has a single owner for pending and editable block rules", () => {
    for (const selector of [".pending-badge", '.prose .block[data-block-editable="true"]']) {
      const owners = [...css].filter(([, source]) => source.includes(selector));
      expect(owners.length, selector).toBeLessThanOrEqual(1);
    }
  });

  it("defines focus and overlay tokens in light and dark themes", () => {
    const tokens = css.get("tokens.css") ?? "";
    const root = tokens.slice(tokens.indexOf(":root {"), tokens.indexOf('[data-theme="dark"]'));
    const dark = tokens.slice(tokens.indexOf('[data-theme="dark"]'));
    for (const token of [
      "--focus-ring",
      "--focus-offset",
      "--focus-offset-inset",
      "--color-overlay",
    ])
      expect(root).toContain(`${token}:`);
    expect(dark).toContain("--color-overlay:");
  });

  it("derives the insert strip from its parts", () => {
    const tokens = css.get("tokens.css") ?? "";
    const px = (name: string) =>
      Number.parseFloat(tokens.match(new RegExp(`${name}:\\s*([\\d.]+)px`))?.[1] ?? "NaN");
    const line = px("--insert-line");
    const button = px("--insert-button");
    const overflow = px("--insert-overflow");
    expect(line + 2 + button - overflow).toBe(22);
    expect(tokens).toContain("--insert-strip: calc(");
  });

  it("keeps documented colors and spacing in sync with the design tokens", () => {
    const docs = ["docs/design-system.md", "docs/design-system.es.md", "BRD.md", "BRD.en.md"].map(
      (file) => fs.readFileSync(path.resolve(file), "utf8"),
    );
    const tokens = css.get("tokens.css") ?? "";
    const light = tokens.slice(tokens.indexOf(":root {"), tokens.indexOf('[data-theme="dark"]'));
    const lineStrong = light.match(/--color-line-strong:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(lineStrong).toBeDefined();
    for (const doc of docs) {
      expect(doc).not.toMatch(/#?9aa1a8/i);
      expect(doc).not.toMatch(/--space-(11|12)\b/);
      expect(doc.toLowerCase()).toContain(lineStrong?.toLowerCase());
    }
  });
});
