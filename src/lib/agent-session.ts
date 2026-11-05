import type { AgentMode, AgentRuntime, AgentSessionScope } from "../../electron/types";
import { nrvn } from "./ipc";

/**
 * Adaptador fino entre el store del panel y el bridge de agente. Concentra las
 * claves de documento/workspace y la creación perezosa de sesiones para que el
 * store no duplique esas reglas.
 */

/** Clave estable para documentos sin ruta (borrador sin título). */
export const UNTITLED_DOC_KEY = "__untitled__";

/** Workspace lógico cuando todavía no hay carpeta abierta. */
export const UNTITLED_WORKSPACE = "__untitled__";

export const WORKSPACE_THREAD_KEY = "__workspace__";

export function threadKeyForScope(scope: AgentSessionScope, docKey: string): string {
  return scope === "workspace" ? WORKSPACE_THREAD_KEY : docKey;
}

/**
 * Señal explícita de migración de hilo. Solo «Guardar como» la marca: abrir un
 * archivo cualquiera no debe arrastrar el hilo del borrador.
 */
let pendingThreadMigration: { from: string; to: string } | null = null;

export function markThreadMigration(from: string, to: string): void {
  pendingThreadMigration = { from, to };
}

export function consumeThreadMigration(from: string, to: string): boolean {
  if (pendingThreadMigration === null) return false;
  const match = pendingThreadMigration.from === from && pendingThreadMigration.to === to;
  if (match) pendingThreadMigration = null;
  return match;
}

export function docKeyForPath(path: string | null): string {
  return path ?? UNTITLED_DOC_KEY;
}

/**
 * Clave de hilo por documento. Los borradores sin ruta se aíslan con su
 * `localId`, de modo que Cmd+N abre un hilo distinto y una propuesta vieja no
 * cruza a otro borrador.
 */
export function docKeyForDocument(path: string | null, localId: string): string {
  return path ?? localId;
}

export function workspaceRootFor(root: string | null): string {
  return root ?? UNTITLED_WORKSPACE;
}

export interface EnsureSessionInput {
  sessionID: string | null;
  directory: string;
  agent: string;
  model: { providerID: string; id: string } | null;
  title?: string;
}

/** Reutiliza la sesión del hilo o crea una nueva con la selección actual. */
export async function ensureAgentSession(input: EnsureSessionInput): Promise<string> {
  if (input.sessionID !== null && input.sessionID.length > 0) return input.sessionID;
  const created = await nrvn.agent.createSession({
    directory: input.directory,
    agent: input.agent,
    model: input.model,
    ...(input.title === undefined ? {} : { title: input.title }),
  });
  return created.sessionID;
}

/**
 * Reconcilia el agente elegido con el catálogo del runtime conectado: conserva
 * la elección si existe, cae a `build` en local y a `nrvn-editor` en embedded.
 */
export function reconcileAgentSelection(
  runtime: AgentRuntime,
  agents: { id: string }[],
  current: string,
): string {
  const has = (id: string): boolean => agents.some((agent) => agent.id === id);
  if (has(current)) return current;
  if (runtime === "local") return has("build") ? "build" : (agents[0]?.id ?? current);
  return has("nrvn-editor") ? "nrvn-editor" : current;
}

export function agentModeOrDefault(mode: AgentMode): AgentMode {
  return mode === "local" || mode === "auto" ? mode : "embedded";
}
