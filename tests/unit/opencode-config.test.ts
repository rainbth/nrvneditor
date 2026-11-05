import { describe, expect, it } from "vitest";
import {
  buildAgentConfig,
  DISABLE_MCP_PLUGIN_ID,
  disableMcpPlugin,
  hasNoToolsPermissions,
  NRVN_AGENT_ID,
  NRVN_SYSTEM_PROMPT,
} from "../../electron/lib/opencode-config";

const REQUIRED_DENY_ACTIONS = [
  "*",
  "edit",
  "bash",
  "read",
  "glob",
  "grep",
  "webfetch",
  "websearch",
  "task",
  "question",
  "browser",
  "external_directory",
];

describe("buildAgentConfig", () => {
  it("incluye el agente nrvn-editor en modo primary con prompt de sistema", () => {
    const config = buildAgentConfig();
    const agent = config.agent[NRVN_AGENT_ID];
    expect(agent).toBeDefined();
    expect(agent.mode).toBe("primary");
    expect(agent.prompt).toBe(NRVN_SYSTEM_PROMPT);
    expect(agent.prompt).toContain('<<<NRVN_BLOCK key="');
    expect(agent.prompt).toContain("<<<NRVN_END>>>");
  });

  it("deniega todas las capacidades de herramienta", () => {
    const permission = buildAgentConfig().agent[NRVN_AGENT_ID].permission;
    for (const action of REQUIRED_DENY_ACTIONS) {
      expect(permission[action]).toBe("deny");
    }
    expect(Object.keys(permission).sort()).toEqual([...REQUIRED_DENY_ACTIONS].sort());
  });

  it("es serializable como JSON y válido para el host", () => {
    const config = buildAgentConfig();
    const parsed = JSON.parse(JSON.stringify(config)) as typeof config;
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(parsed.agent[NRVN_AGENT_ID].description.length).toBeGreaterThan(0);
  });

  it("el plugin de MCP tiene un id estable y setup", () => {
    expect(DISABLE_MCP_PLUGIN_ID).toBe("nrvn-disable-mcp");
    expect(disableMcpPlugin.id).toBe(DISABLE_MCP_PLUGIN_ID);
    expect(typeof disableMcpPlugin.setup).toBe("function");
  });
});

describe("hasNoToolsPermissions", () => {
  const rule = (action: string, effect: string, resource = "*") => ({ action, resource, effect });

  it("acepta un comodín deny", () => {
    expect(hasNoToolsPermissions([rule("*", "deny")])).toBe(true);
  });

  it("acepta comodín allow seguido de deny de cada herramienta conocida", () => {
    const rules = [rule("*", "allow")];
    for (const action of [...REQUIRED_DENY_ACTIONS].filter((action) => action !== "*")) {
      rules.push(rule(action, "deny"));
    }
    expect(hasNoToolsPermissions(rules)).toBe(true);
  });

  it("rechaza un catálogo sin reglas", () => {
    expect(hasNoToolsPermissions([])).toBe(false);
  });

  it("rechaza si alguna herramienta queda permitida", () => {
    expect(hasNoToolsPermissions([rule("*", "deny"), rule("read", "allow")])).toBe(false);
    expect(hasNoToolsPermissions([rule("*", "allow")])).toBe(false);
  });

  it("respeta la última regla para la misma acción", () => {
    expect(
      hasNoToolsPermissions([rule("read", "allow"), rule("read", "deny"), rule("*", "deny")]),
    ).toBe(true);
    expect(hasNoToolsPermissions([rule("*", "deny"), rule("read", "allow")])).toBe(false);
  });
});
