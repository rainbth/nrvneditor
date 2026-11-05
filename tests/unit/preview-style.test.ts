import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agentCss = readFileSync("src/styles/agent.css", "utf8");
const tokensCss = readFileSync("src/styles/tokens.css", "utf8");

function cssBlock(selector: string, source: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `missing CSS block ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("inline recommendation preview styles", () => {
  const preview = cssBlock(".block-preview", agentCss);

  it("uses document-width wash without a card, border, or shadow", () => {
    expect(preview).not.toMatch(/\bborder\s*:/);
    expect(preview).not.toContain("border-inline-start");
    expect(preview).not.toContain("box-shadow");
    expect(preview).not.toContain("border-radius");
    expect(preview).toContain("padding-block: 0 var(--space-2)");
    expect(preview).toContain("padding-inline: 0");
    expect(preview).not.toContain("padding: var(--space-3)");
    expect(agentCss).toMatch(
      /\[data-side="original"\]\s*\{\s*background:\s*var\(--color-diff-old-wash\)/,
    );
    expect(agentCss).toMatch(
      /\[data-side="proposed"\]\s*\{\s*background:\s*var\(--color-diff-new-wash\)/,
    );
  });

  it("defines an accent top rule, right aligned actions, and theme wash tokens", () => {
    const rule = cssBlock(".block-preview::before", agentCss);
    expect(rule).toContain("background: var(--color-diff-new-rule)");
    expect(rule).toContain("block-size: 2px");
    expect(cssBlock(".block-preview-actions", agentCss)).toContain("justify-content: flex-end");
    expect(cssBlock(".block-preview-actions .button", agentCss)).toContain("height: 32px");
    const root = tokensCss.slice(
      tokensCss.indexOf(":root {"),
      tokensCss.indexOf('[data-theme="dark"]'),
    );
    const dark = tokensCss.slice(tokensCss.indexOf('[data-theme="dark"]'));
    expect(root).toContain("--color-diff-old-wash:");
    expect(root).toContain("--color-diff-new-rule:");
    expect(dark).toContain("--color-diff-old-rule:");
    expect(dark).toContain("--color-diff-new-wash:");
  });

  it("removes selection chrome from selected preview blocks", () => {
    const selectors = agentCss.match(
      /\.prose \.block\[data-previewing="true"\]\[data-selected="true"\]::before,\s*\.prose \.block\[data-previewing="true"\]\[data-selected="true"\]::after,\s*\.prose \.block\[data-previewing="true"\]\[data-selected="true"\] \+ \.block\[data-selected="true"\]::before\s*\{([^}]*)\}/,
    );
    expect(selectors?.[1]).toContain("background: transparent");
    expect(selectors?.[1]).toContain("box-shadow: none");
  });

  it("animates entry and disables it for reduced motion", () => {
    expect(agentCss).toContain("@keyframes block-preview-in");
    expect(agentCss).toContain("@keyframes block-preview-actions-in");
    const reducedMotionStart = agentCss.lastIndexOf(
      "@media (prefers-reduced-motion: reduce)",
      agentCss.indexOf(".block-preview-actions .button {\n    animation: none"),
    );
    const reducedMotion = agentCss.slice(reducedMotionStart);
    expect(reducedMotion).toContain(".block-preview");
    expect(reducedMotion).toContain("animation: none");
    expect(reducedMotion).toContain("transition: none");
  });
});
