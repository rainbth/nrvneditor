import { describe, expect, it } from "vitest";
import {
  type CredentialEntryLike,
  DENY_ALL_PERMISSIONS,
  defaultAgentFor,
  extractAccount,
  type RawAgent,
  reconcileAgent,
  selectPrimaryAgents,
} from "../../electron/lib/opencode-mode";
import type { AgentDescriptor } from "../../electron/types";
import { settingsSchema } from "../../electron/types";

const agents: AgentDescriptor[] = [
  { id: "build", name: "build", mode: "primary" },
  { id: "loop", name: "loop", mode: "all" },
];

const rawAgents: RawAgent[] = [
  { id: "zeta", name: "Zeta", mode: "primary", hidden: false },
  { id: "plan", name: "Plan", mode: "primary", hidden: true },
  { id: "loop", name: "Loop", mode: "all", hidden: false },
  { id: "explore", name: "Explore", mode: "subagent", hidden: false },
  { id: "build", name: "Build", mode: "primary", hidden: false, description: "general" },
  { id: "alpha", name: "Alpha", mode: "primary", hidden: false },
];

describe("selectPrimaryAgents", () => {
  it("sólo devuelve primarios/all visibles, con build primero", () => {
    const selected = selectPrimaryAgents(rawAgents);
    expect(selected.map((agent) => agent.id)).toEqual(["build", "alpha", "loop", "zeta"]);
    expect(selected[0].description).toBe("general");
    expect(selected.some((agent) => agent.id === "plan")).toBe(false);
    expect(selected.some((agent) => agent.id === "explore")).toBe(false);
  });
});

describe("defaultAgentFor / reconcileAgent", () => {
  it("en local prefiere build y si no el primero", () => {
    expect(defaultAgentFor("local", agents)).toBe("build");
    expect(defaultAgentFor("local", [{ id: "plan", name: "Plan", mode: "primary" }])).toBe("plan");
    expect(defaultAgentFor("local", [])).toBeNull();
  });

  it("en embebido prefiere nrvn-editor y si no hay agentes devuelve null", () => {
    expect(
      defaultAgentFor("embedded", [{ id: "nrvn-editor", name: "nrvn-editor", mode: "primary" }]),
    ).toBe("nrvn-editor");
    expect(
      defaultAgentFor("embedded", [{ id: "build", name: "build", mode: "primary" }]),
    ).toBeNull();
  });

  it("conserva el agente actual si existe y aplica el default si no", () => {
    expect(reconcileAgent("local", agents, "loop")).toBe("loop");
    expect(reconcileAgent("local", agents, "desaparecido")).toBe("build");
    expect(reconcileAgent("embedded", [], "nrvn-editor")).toBe("nrvn-editor");
  });
});

describe("DENY_ALL_PERMISSIONS", () => {
  it("deniega toda acción sobre todo recurso", () => {
    expect(DENY_ALL_PERMISSIONS).toEqual([{ action: "*", resource: "*", effect: "deny" }]);
  });
});

describe("settingsSchema · migración de modo", () => {
  it("migra el modo antiguo service a local", () => {
    const parsed = settingsSchema.parse({ agent: { mode: "service" } });
    expect(parsed.agent.mode).toBe("local");
  });

  it("usa auto por defecto y conserva el agente nrvn-editor", () => {
    const parsed = settingsSchema.parse({});
    expect(parsed.agent).toEqual({
      mode: "auto",
      model: null,
      agent: "nrvn-editor",
      presets: [],
      preset: null,
      sessionScope: "document",
    });
  });
});

describe("extractAccount", () => {
  it("prefiere la credencial activa y saca email/org de metadata", () => {
    const entries: CredentialEntryLike[] = [
      {
        id: "inactive",
        integrationID: "opencode",
        label: "vieja",
        active: false,
        value: { type: "oauth", metadata: { email: "vieja@example.com" } },
      },
      {
        id: "active",
        integrationID: "opencode",
        label: "cuenta",
        active: true,
        value: {
          type: "oauth",
          metadata: { email: "ana@example.com", organization: "nrvn", name: "Ana" },
        },
      },
      {
        id: "otra",
        integrationID: "github",
        label: "github",
        active: true,
        value: { type: "key", metadata: { email: "no@example.com" } },
      },
    ];

    expect(extractAccount(entries)).toEqual({
      id: "active",
      label: "Ana",
      email: "ana@example.com",
      organization: "nrvn",
    });
  });

  it("sin credenciales de OpenCode devuelve null", () => {
    expect(extractAccount([])).toBeNull();
    expect(
      extractAccount([
        {
          id: "x",
          integrationID: "github",
          label: "GitHub",
          active: true,
          value: { type: "key" },
        },
      ]),
    ).toBeNull();
  });

  it("nunca expone access, refresh ni key en el resultado", () => {
    const entry = {
      id: "secret",
      integrationID: "opencode",
      label: "Cuenta",
      active: true,
      value: {
        type: "oauth",
        access: "access-token-secreto",
        refresh: "refresh-token-secreto",
        key: "key-secreta",
        metadata: { email: "ana@example.com", organization: "nrvn" },
      },
    } as unknown as CredentialEntryLike;

    const serialized = JSON.stringify(extractAccount([entry]));
    expect(serialized).not.toContain("access-token-secreto");
    expect(serialized).not.toContain("refresh-token-secreto");
    expect(serialized).not.toContain("key-secreta");
    expect(serialized).not.toContain("access");
    expect(serialized).not.toContain("refresh");
  });
});
