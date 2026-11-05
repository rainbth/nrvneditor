import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/ipc", () => ({ nrvn: {} }));

import type { AgentPreset } from "../../electron/types";
import { threadKeyForScope } from "../../src/lib/agent-session";
import {
  activePreset,
  newPresetId,
  presetBehavior,
  removePreset,
  upsertPreset,
} from "../../src/lib/presets";

const makePreset = (id: string, instruction = "  behavior  "): AgentPreset => ({
  id,
  name: id,
  agent: null,
  model: null,
  instruction,
});

describe("agent presets", () => {
  it("genera ids con prefijo preset", () => {
    expect(newPresetId()).toMatch(/^preset-.+/);
  });
  it("encuentra y normaliza el preset activo", () => {
    const preset = makePreset("one");
    expect(activePreset([preset], "one")).toBe(preset);
    expect(activePreset([preset], null)).toBeNull();
    expect(presetBehavior(preset)).toBe("behavior");
    expect(presetBehavior(makePreset("empty", "  "))).toBe("");
    expect(presetBehavior(null)).toBe("");
  });
  it("upsert reemplaza o añade sin mutar; remove filtra", () => {
    const original = [makePreset("one")];
    const replaced = makePreset("one", "updated");
    const updated = upsertPreset(original, replaced);
    expect(updated).toEqual([replaced]);
    expect(updated).not.toBe(original);
    expect(original[0].instruction).toBe("  behavior  ");
    expect(upsertPreset(original, makePreset("two"))).toEqual([...original, makePreset("two")]);
    expect(removePreset(original, "one")).toEqual([]);
    expect(original).toHaveLength(1);
  });
  it("deriva claves de hilo por ámbito", () => {
    expect(threadKeyForScope("document", "doc.md")).toBe("doc.md");
    expect(threadKeyForScope("workspace", "doc.md")).toBe("__workspace__");
  });
});
