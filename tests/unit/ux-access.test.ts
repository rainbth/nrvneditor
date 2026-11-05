import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8");

describe("UX access surfaces", () => {
  it("provides the floating reviewer picker and reduced-motion styles", () => {
    const tokens = read("src/styles/tokens.css");
    const agent = read("src/styles/agent.css");
    const global = read("src/styles/global.css");
    expect(tokens).toContain("--avatar-xl: 96px");
    expect(tokens).toContain("--motion-enter:");
    for (const text of [
      '.audience-avatar[data-size="xl"]',
      "width:var(--avatar-xl)",
      ".reviewer-picker",
    ])
      expect(agent.replaceAll(" ", "")).toContain(text.replaceAll(" ", ""));
    const picker = read("src/components/agent/ReviewerPicker.tsx");
    expect(picker).toContain('data-testid="reviewer-picker"');
    expect(picker).toContain('size="xl"');
    const toolbar = read("src/components/render/FormatToolbar.tsx");
    expect(toolbar).toContain('data-testid="bubble-review"');
    expect(toolbar).toContain('data-testid="bubble-ask"');
    const panel = read("src/components/agent/AgentPanelShell.tsx");
    expect(panel).not.toContain("AudienceRoster");
    expect(panel).not.toContain("AudienceSelector");
    expect(agent).toContain("@media (prefers-reduced-motion: reduce)");
    for (const styles of [agent, global])
      expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
