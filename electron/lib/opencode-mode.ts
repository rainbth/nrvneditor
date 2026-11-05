import type { AgentAccount, AgentDescriptor, AgentRuntime } from "../types";

/** ID estable del agente embebido de nrvn. */
export const NRVN_EMBEDDED_AGENT = "nrvn-editor";
/** Agente primario preferido cuando el servicio local está disponible. */
export const DEFAULT_LOCAL_AGENT = "build";

/** Reglas que deniegan toda acción sobre todo recurso (formato V2). */
export const DENY_ALL_PERMISSIONS = [{ action: "*", resource: "*", effect: "deny" }] as const;

export interface RawAgent {
  id: string;
  name: string;
  mode: "primary" | "subagent" | "all";
  hidden: boolean;
  description?: string;
}

function toDescriptor(agent: RawAgent): AgentDescriptor {
  return {
    id: agent.id,
    name: agent.name.length > 0 ? agent.name : agent.id,
    ...(agent.description === undefined ? {} : { description: agent.description }),
    mode: agent.mode,
  };
}

/**
 * Agentes que el usuario puede elegir: primarios o `all`, no ocultos. `build`
 * va primero y el resto se ordena alfabéticamente por id.
 */
export function selectPrimaryAgents(agents: RawAgent[]): AgentDescriptor[] {
  return agents
    .filter((agent) => (agent.mode === "primary" || agent.mode === "all") && !agent.hidden)
    .map(toDescriptor)
    .sort((a, b) => {
      if (a.id === DEFAULT_LOCAL_AGENT) return -1;
      if (b.id === DEFAULT_LOCAL_AGENT) return 1;
      return a.id.localeCompare(b.id, "es");
    });
}

/** Agente por defecto según el runtime: `build` en local, `nrvn-editor` en embebido. */
export function defaultAgentFor(runtime: AgentRuntime, agents: AgentDescriptor[]): string | null {
  if (runtime === "embedded") {
    return agents.some((agent) => agent.id === NRVN_EMBEDDED_AGENT) ? NRVN_EMBEDDED_AGENT : null;
  }
  const build = agents.find((agent) => agent.id === DEFAULT_LOCAL_AGENT);
  if (build !== undefined) return build.id;
  return agents.length > 0 ? agents[0].id : null;
}

/** Conserva el agente actual si sigue existiendo; si no, aplica el default. */
export function reconcileAgent(
  runtime: AgentRuntime,
  agents: AgentDescriptor[],
  current: string,
): string {
  if (current.length > 0 && agents.some((agent) => agent.id === current)) return current;
  return defaultAgentFor(runtime, agents) ?? current;
}

export interface CredentialEntryLike {
  id: string;
  integrationID: string;
  label: string;
  active: boolean;
  value: { type: string; metadata?: Record<string, unknown> };
}

const EMAIL_KEYS = ["email", "mail", "login"] as const;
const ORG_KEYS = ["organization", "org", "workspace", "team", "account"] as const;
const LABEL_KEYS = ["name", "login", "email", "account"] as const;

function firstString(
  metadata: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/**
 * Extrae la cuenta pública de OpenCode Console a partir de las credenciales del
 * servicio. Nunca copia `access`, `refresh`, `key` ni ningún otro secreto.
 */
export function extractAccount(entries: CredentialEntryLike[]): AgentAccount | null {
  const candidates = entries.filter((entry) => entry.integrationID === "opencode");
  if (candidates.length === 0) return null;
  const entry = candidates.find((candidate) => candidate.active) ?? candidates[0];
  const metadata =
    typeof entry.value.metadata === "object" && entry.value.metadata !== null
      ? entry.value.metadata
      : {};
  const email = firstString(metadata, EMAIL_KEYS);
  const organization = firstString(metadata, ORG_KEYS);
  const label =
    firstString(metadata, LABEL_KEYS) ??
    (entry.label.trim().length > 0 ? entry.label.trim() : entry.id);

  return {
    id: entry.id,
    label,
    ...(email === undefined ? {} : { email }),
    ...(organization === undefined ? {} : { organization }),
  };
}
