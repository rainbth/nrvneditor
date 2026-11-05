import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const tokens = fs.readFileSync(path.resolve("src/styles/tokens.css"), "utf8");
const root = tokens.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";

function token(name: string): string {
  const value = root.match(new RegExp(`${name}:\\s*(#[\\da-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`No se encontró ${name} en :root`);
  return value;
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)
    ?.map((part) => Number.parseInt(part, 16) / 255);
  if (!channels) throw new Error(`Hex inválido: ${hex}`);
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ratio = (a: string, b: string) => {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

describe("CSS accessibility tokens", () => {
  it("keeps muted and accent hover text at WCAG AA", () => {
    const muted = token("--color-muted");
    expect(ratio(muted, token("--color-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(muted, token("--color-sunken"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token("--color-accent-hover"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("defines ordered shared layers and uses current design tokens", () => {
    const layers = ["--z-base", "--z-floating", "--z-menu", "--z-overlay", "--z-modal"];
    for (const layer of layers) expect(root).toMatch(new RegExp(`${layer}:\\s*\\d+`));
    const values = layers.map((layer) =>
      Number(root.match(new RegExp(`${layer}:\\s*(\\d+)`))?.[1]),
    );
    expect(values).toEqual([...values].sort((a, b) => a - b));
    for (const file of ["global.css", "agent.css", "menu.css", "comments.css"]) {
      const css = fs.readFileSync(path.resolve(`src/styles/${file}`), "utf8");
      expect(css).not.toMatch(/var\(--(?:border|surface|text-muted)\)/);
    }
  });
});
