import type { AgentPreset } from "../../electron/types";

export function newPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `preset-${crypto.randomUUID()}`;
  }
  return `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function activePreset(presets: AgentPreset[], id: string | null): AgentPreset | null {
  return id === null ? null : (presets.find((preset) => preset.id === id) ?? null);
}

export function presetBehavior(preset: AgentPreset | null): string {
  return preset?.instruction.trim() ?? "";
}

export function upsertPreset(list: AgentPreset[], preset: AgentPreset): AgentPreset[] {
  const index = list.findIndex((item) => item.id === preset.id);
  return index === -1
    ? [...list, preset]
    : list.map((item) => (item.id === preset.id ? preset : item));
}

export function removePreset(list: AgentPreset[], id: string): AgentPreset[] {
  return list.filter((preset) => preset.id !== id);
}
