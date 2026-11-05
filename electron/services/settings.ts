import fs from "node:fs";
import { app } from "electron";
import { readTextFile, writeFileAtomic } from "../lib/atomic";
import { logWarn } from "../lib/logger";
import type { Settings } from "../types";
import { settingsSchema } from "../types";

const DEFAULT_SETTINGS: Settings = {
  onboarding: { done: false },
  theme: "system",
  recentWorkspace: null,
  panelWidths: { tree: 248, agent: 380 },
  panels: { tree: true, agent: true },
  panelHeights: { treeOutline: 0.5 },
  render: { font: "lato", lineNumbers: true, pageSize: "letter", zoom: 100 },
  agent: {
    mode: "auto",
    model: null,
    agent: "nrvn-editor",
    presets: [],
    preset: null,
    sessionScope: "document",
  },
};

function settingsPath(): string {
  return `${app.getPath("userData")}/settings.json`;
}

function quarantineCorrupt(file: string): void {
  const target = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  try {
    fs.renameSync(file, target);
    logWarn("settings corrupto aislado", { target });
  } catch {
    logWarn("no se pudo aislar settings corrupto", { file });
  }
}

/** Lee `settings.json` de userData; corrupto o inválido → defaults. */
export function readSettings(): Settings {
  const file = settingsPath();
  let raw: string;
  try {
    raw = readTextFile(file).content;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const parsed = settingsSchema.parse(JSON.parse(raw));
    return parsed;
  } catch {
    quarantineCorrupt(file);
    return { ...DEFAULT_SETTINGS };
  }
}

/** Merge superficial de la config con validación zod y escritura atómica. */
export function patchSettings(partial: unknown): Settings {
  const current = readSettings();
  const input = typeof partial === "object" && partial !== null ? partial : {};
  const merged = {
    ...current,
    ...input,
    panelWidths: {
      ...current.panelWidths,
      ...(isRecord(input) && isRecord(input.panelWidths) ? input.panelWidths : {}),
    },
    panels: {
      ...current.panels,
      ...(isRecord(input) && isRecord(input.panels) ? input.panels : {}),
    },
    panelHeights: {
      ...current.panelHeights,
      ...(isRecord(input) && isRecord(input.panelHeights) ? input.panelHeights : {}),
    },
    render: {
      ...current.render,
      ...(isRecord(input) && isRecord(input.render) ? input.render : {}),
    },
    agent: {
      ...current.agent,
      ...(isRecord(input) && isRecord(input.agent) ? input.agent : {}),
    },
  };
  const next = settingsSchema.parse(merged);
  writeFileAtomic(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, {
    eol: "lf",
    bom: false,
  });
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
