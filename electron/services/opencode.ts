import { mkdirSync } from "node:fs";
import path from "node:path";
import { OpenCode as OpenCodeClient } from "@opencode/client";
import { Service } from "@opencode/client/service";
import { OpenCode } from "@opencode/sdk";
import { app, BrowserWindow, shell } from "electron";
import { CHANNELS } from "../ipc";
import { logInfo, logWarn } from "../lib/logger";
import {
  buildAgentConfig,
  disableMcpPlugin,
  hasNoToolsPermissions,
  type PermissionRule,
} from "../lib/opencode-config";
import {
  type CredentialEntryLike,
  extractAccount,
  NRVN_EMBEDDED_AGENT,
  selectPrimaryAgents,
} from "../lib/opencode-mode";
import {
  createRestrictedSession,
  normalizeSessionDirectory,
  sessionCreationError,
} from "../lib/opencode-session";
import { isStaleTurnEvent } from "../lib/turn-guard";
import type {
  AgentAccount,
  AgentCatalog,
  AgentConnectionState,
  AgentEvent,
  AgentMode,
  AgentOAuthStart,
  AgentOAuthState,
  AgentOAuthStatus,
  AgentRuntime,
  AgentStatus,
} from "../types";

/** Cliente mínimo compartido por el host embebido y el servicio local. */
type AgentClient = ReturnType<typeof OpenCodeClient.make>;

const CONNECT_TIMEOUT_MS = 30_000;
const SERVICE_PROBE_TIMEOUT_MS = 5_000;

const LOCAL_START_ERROR =
  "No se pudo iniciar el servicio local de OpenCode. Abre OpenCode o cambia el modo a Automático en el panel del agente.";
const NO_PRIMARY_AGENTS_ERROR =
  "El servicio local de OpenCode no expone ningún agente primario. Revisa la configuración de OpenCode y reintenta.";

let mode: AgentMode = "auto";
let runtime: AgentRuntime | null = null;
let client: AgentClient | null = null;
let connection: AgentConnectionState = "disconnected";
let catalog: AgentCatalog | null = null;
let account: AgentAccount | null = null;
let abortController: AbortController | null = null;
let hostClose: (() => Promise<void>) | null = null;
let lastReason: string | undefined;
let inflight: Promise<AgentStatus> | null = null;
/** Sesiones cuya señal `done` ya se reenvió en el turno actual. */
const doneSessions = new Set<string>();
/** Instante en que se lanzó el prompt en curso, por sesión. */
const doneGuard = new Map<string, number>();
/** Intentos OAuth vivos, con el cliente local que los creó. */
const oauthAttempts = new Map<string, AgentClient>();
/** Sesiones creadas o enviadas por nrvn en el servicio compartido. */
const knownSessions = new Set<string>();
/** URL del servicio local activo (sólo se emite en runtime `local`). */
let localServiceUrl: string | null = null;
/** Indica si el servicio local usa basic auth; nunca se guarda el valor. */
let localServiceAuth = false;
/** Si el servicio confirmó los permisos sin herramientas; `null` = sin verificar. */
let permissionsVerified: boolean | null = null;

function sessionsDirectory(): string {
  return path.join(app.getPath("userData"), "opencode", "sessions");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

function status(): AgentStatus {
  const isLocal = runtime === "local";
  return {
    state: connection,
    mode,
    ...(runtime === null ? {} : { runtime }),
    ...(lastReason === undefined ? {} : { reason: lastReason }),
    ...(catalog === null ? {} : { catalog }),
    sessionsDir: sessionsDirectory(),
    ...(isLocal && localServiceUrl !== null ? { serviceUrl: localServiceUrl } : {}),
    ...(isLocal ? { serviceAuth: localServiceAuth } : {}),
    ...(permissionsVerified === null ? {} : { permissionsVerified }),
    account,
  };
}

function emit(event: AgentEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(CHANNELS.eventAgent, event);
  }
}

function emitStatus(): void {
  emit({ type: "status", status: status() });
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function requireClient(): AgentClient {
  if (client === null) {
    throw new Error("OpenCode no está conectado. Conecta el agente antes de continuar.");
  }
  return client;
}

function basicHeaders(
  auth: { username: string; password: string } | undefined,
): Record<string, string> | undefined {
  if (auth === undefined) return undefined;
  return {
    Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`,
  };
}

async function connectEmbedded(): Promise<void> {
  const directory = path.join(app.getPath("userData"), "opencode");
  mkdirSync(directory, { recursive: true });
  const config = buildAgentConfig();
  const host = await withTimeout(
    OpenCode.create({
      config: { content: JSON.stringify(config) },
      plugins: [disableMcpPlugin],
      database: { path: path.join(directory, "opencode.db") },
    }),
    CONNECT_TIMEOUT_MS,
    "El host embebido de OpenCode no respondió en 30 s. Revisa la instalación y reintenta.",
  );
  hostClose = () => host.close();
  client = host;
}

/**
 * Descubre el servicio local, lo arranca si hace falta y construye un cliente
 * autenticado. Cualquier fallo se traduce en un mensaje accionable.
 */
async function makeLocalClient(): Promise<AgentClient> {
  let endpoint: { url: string; auth?: { type: "basic"; username: string; password: string } };
  try {
    const discovered = await Service.discover();
    endpoint = discovered ?? (await Service.ensure());
  } catch (error) {
    logWarn("no se pudo descubrir/arrancar el servicio local", { message: messageOf(error) });
    throw new Error(LOCAL_START_ERROR);
  }
  if (endpoint.url.length === 0) throw new Error(LOCAL_START_ERROR);

  localServiceUrl = endpoint.url;
  localServiceAuth = endpoint.auth !== undefined;

  const remote = OpenCodeClient.make({
    baseUrl: endpoint.url,
    headers: basicHeaders(endpoint.auth),
  });
  try {
    await withTimeout(
      remote.server.info(),
      SERVICE_PROBE_TIMEOUT_MS,
      "El servicio local de OpenCode no respondió o no es compatible.",
    );
  } catch (error) {
    logWarn("el servicio local no pasó el probe", { message: messageOf(error) });
    throw new Error(LOCAL_START_ERROR);
  }
  return remote;
}

async function loadCatalog(activeRuntime: AgentRuntime): Promise<AgentCatalog> {
  const active = requireClient();
  const [agentsResult, modelsResult, defaultResult, providersResult] = await Promise.all([
    active.agent.list(),
    active.model.list(),
    active.model.default(),
    active.provider.list(),
  ]);

  const providerNames = new Map<string, string>();
  const providers = providersResult.data.map((provider) => {
    providerNames.set(provider.id, provider.name);
    return { id: provider.id, name: provider.name };
  });

  const models = modelsResult.data
    .filter((model) => model.enabled !== false)
    .map((model) => ({
      id: model.id,
      providerID: model.providerID,
      providerName: providerNames.get(model.providerID) ?? model.providerID,
      name: model.name,
    }))
    .sort((a, b) => {
      const provider = a.providerID.localeCompare(b.providerID);
      return provider !== 0 ? provider : a.name.localeCompare(b.name, "es");
    });

  let agents: AgentCatalog["agents"];
  if (activeRuntime === "local") {
    agents = selectPrimaryAgents(agentsResult.data);
    if (agents.length === 0) throw new Error(NO_PRIMARY_AGENTS_ERROR);
  } else {
    const embedded = agentsResult.data.find((agent) => agent.id === NRVN_EMBEDDED_AGENT);
    const selectable =
      embedded !== undefined &&
      (embedded.mode === "primary" || embedded.mode === "all") &&
      !embedded.hidden;
    agents = selectable
      ? [
          {
            id: embedded.id,
            name: embedded.name,
            ...(embedded.description === undefined ? {} : { description: embedded.description }),
            mode: embedded.mode,
          },
        ]
      : [];
  }

  const fallback = defaultResult.data;
  const defaultModel = fallback
    ? { providerID: fallback.providerID, id: fallback.id }
    : models.length > 0
      ? { providerID: models[0].providerID, id: models[0].id }
      : null;

  if (activeRuntime === "local") {
    try {
      account = await readAccount(active);
    } catch (error) {
      logWarn("no se pudieron leer las credenciales de OpenCode", { message: messageOf(error) });
      account = null;
    }
  }
  // En embebido se conserva la cuenta obtenida por OAuth: el host local puede
  // tener credenciales aunque el runtime activo no sea `local`.

  return { models, defaultModel, agents, providers };
}

async function readAccount(active: AgentClient): Promise<AgentAccount | null> {
  const credentials = (await active.credential.list()) as unknown as CredentialEntryLike[];
  return extractAccount(credentials);
}

function errorMessageOfEvent(data: unknown): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.length > 0) return message;
    }
  }
  return "El agente no pudo completar la respuesta.";
}

function startEventLoop(active: AgentClient): void {
  abortController = new AbortController();
  const signal = abortController.signal;

  const run = async (): Promise<void> => {
    try {
      // Sin filtro `types` por compatibilidad con 2.1.3: el servicio puede no
      // aceptar el array y devolver un error de suscripción.
      const stream = active.event.subscribe({ signal });
      for await (const event of stream) {
        if (signal.aborted) break;
        // El servicio local puede ser compartido: se ignoran los eventos de
        // sesiones que no creó nrvn para no mezclar conversaciones ajenas.
        const eventSessionID = (event.data as { sessionID?: unknown }).sessionID;
        if (typeof eventSessionID === "string" && !knownSessions.has(eventSessionID)) continue;
        if (event.type === "session.text.delta") {
          emit({
            type: "delta",
            sessionID: event.data.sessionID,
            delta: event.data.delta,
          });
          continue;
        }
        if (
          event.type === "session.text.ended" ||
          event.type === "session.execution.succeeded" ||
          event.type === "session.execution.interrupted" ||
          event.type === "session.idle"
        ) {
          const sessionID = event.data.sessionID;
          // Un evento con marca anterior al prompt actual pertenece a un turno
          // previo: no debe cerrar el turno en curso.
          if (isStaleTurnEvent(event.created, doneGuard.get(sessionID))) continue;
          // Varios eventos señalan el final del turno; sólo se reenvía uno.
          if (doneSessions.has(sessionID)) continue;
          doneSessions.add(sessionID);
          doneGuard.delete(sessionID);
          emit({ type: "done", sessionID });
          continue;
        }
        if (event.type === "session.execution.failed" || event.type === "session.step.failed") {
          emit({
            type: "error",
            sessionID: event.data.sessionID,
            message: errorMessageOfEvent(event.data),
          });
          continue;
        }
        if (
          event.type === "session.tool.called" ||
          event.type === "session.tool.failed" ||
          event.type === "permission.asked"
        ) {
          // No debería ocurrir: todas las herramientas están denegadas.
          emit({
            type: "error",
            sessionID: event.data.sessionID,
            message:
              event.type === "permission.asked"
                ? "El agente solicitó un permiso que nrvn no concede."
                : "El agente intentó usar una herramienta no permitida.",
          });
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        logWarn("el bucle de eventos de OpenCode terminó", { message: messageOf(error) });
        connection = "error";
        lastReason = "La conexión con OpenCode se interrumpió. Reconecta.";
        emitStatus();
        emit({ type: "error", message: lastReason });
      }
    }
  };

  void run();
}

async function teardown(): Promise<void> {
  abortController?.abort();
  abortController = null;
  doneSessions.clear();
  doneGuard.clear();
  knownSessions.clear();
  localServiceUrl = null;
  localServiceAuth = false;
  permissionsVerified = null;
  const close = hostClose;
  hostClose = null;
  client = null;
  catalog = null;
  account = null;
  runtime = null;
  if (close !== null) {
    try {
      await close();
    } catch (error) {
      logWarn("no se pudo cerrar el host de OpenCode", { message: messageOf(error) });
    }
  }
}

async function resolveRuntime(desired: AgentMode): Promise<AgentRuntime> {
  if (desired === "embedded") {
    await connectEmbedded();
    return "embedded";
  }
  if (desired === "local") {
    client = await makeLocalClient();
    hostClose = null;
    return "local";
  }
  // auto: intenta local; si falla, usa el host embebido.
  try {
    client = await makeLocalClient();
    hostClose = null;
    return "local";
  } catch (error) {
    logWarn("modo auto: sin servicio local, se usa el host embebido", {
      message: messageOf(error),
    });
    await connectEmbedded();
    return "embedded";
  }
}

async function doConnect(desired: AgentMode): Promise<AgentStatus> {
  mode = desired;
  connection = "connecting";
  lastReason = undefined;
  account = null;
  emitStatus();

  try {
    await teardown();
    runtime = await resolveRuntime(desired);
    try {
      catalog = await loadCatalog(runtime);
    } catch (error) {
      // Local responde pero su catálogo no es compatible (versión distinta):
      // en modo auto se cae al host embebido en vez de fallar la conexión.
      if (desired !== "auto" || runtime !== "local") throw error;
      logWarn("modo auto: catálogo local incompatible, se usa el host embebido", {
        message: messageOf(error),
      });
      await teardown();
      await connectEmbedded();
      runtime = "embedded";
      catalog = await loadCatalog("embedded");
      lastReason = "El servicio local no es compatible; usando el host embebido.";
    }
    if (catalog.agents.length === 0) {
      throw new Error(
        runtime === "embedded"
          ? "El host embebido no expone el agente nrvn-editor. Revisa la configuración y reintenta."
          : NO_PRIMARY_AGENTS_ERROR,
      );
    }
    connection = "ready";
    startEventLoop(requireClient());
    logInfo("OpenCode conectado", {
      mode: desired,
      runtime,
      models: catalog.models.length,
      agents: catalog.agents.length,
    });
    emitStatus();
    return status();
  } catch (error) {
    connection = "error";
    lastReason = messageOf(error);
    await teardown();
    logWarn("no se pudo conectar OpenCode", { mode: desired, message: lastReason });
    emitStatus();
    return status();
  }
}

/** Conecta el host de OpenCode (idempotente si ya está listo en el mismo modo). */
export async function connect(nextMode?: AgentMode): Promise<AgentStatus> {
  const desired = nextMode ?? mode;
  if (connection === "ready" && desired === mode) return status();
  // Cualquier conexión en vuelo se comparte: nunca se solapan dos `doConnect`.
  if (inflight !== null) return inflight;
  inflight = doConnect(desired).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Cierra el host, el bucle de eventos y deja el estado desconectado. */
export async function disconnect(): Promise<void> {
  // Espera a que termine la conexión en curso antes de desmontar el host.
  await inflight?.catch(() => undefined);
  await teardown();
  connection = "disconnected";
  lastReason = undefined;
  emitStatus();
}

export function getStatus(): AgentStatus {
  return status();
}

export function listCatalog(): AgentCatalog {
  if (catalog === null) {
    throw new Error("OpenCode no está conectado. Conecta el agente antes de continuar.");
  }
  return catalog;
}

const PERMISSIONS_NOT_APPLIED = "El servicio local no aplicó los permisos sin herramientas.";

/**
 * Verifica que el servicio local devuelva la sesión con el ruleset denegado.
 * Algunos servicios aceptan `session.update` sin aplicarlo: si lo confirma y no
 * está denegado, se elimina la sesión y se aborta. Si no expone permisos se
 * registra un aviso y se continúa (compatibilidad con versiones antiguas).
 */
async function verifyRestrictedSession(active: AgentClient, sessionID: string): Promise<void> {
  const getSession = (
    active.session as { get?: (input: { sessionID: string }) => Promise<unknown> }
  ).get;
  if (typeof getSession !== "function") {
    permissionsVerified = false;
    return;
  }

  let info: unknown;
  try {
    info = await getSession({ sessionID });
  } catch (error) {
    logWarn("no se pudieron verificar los permisos de la sesión local", {
      sessionID,
      message: messageOf(error),
    });
    permissionsVerified = false;
    return;
  }

  const container = info as { data?: unknown };
  const data = (
    typeof container.data === "object" && container.data !== null ? container.data : info
  ) as { permissions?: unknown };
  const permissions = data.permissions;
  if (permissions === undefined) {
    logWarn("el servicio local no devolvió los permisos de la sesión creada", { sessionID });
    permissionsVerified = false;
    return;
  }
  if (Array.isArray(permissions) && hasNoToolsPermissions(permissions as PermissionRule[])) {
    permissionsVerified = true;
    return;
  }

  try {
    await active.session.remove?.({ sessionID });
  } catch {
    // El borrado es best-effort; el error que importa es el de permisos.
  }
  throw new Error(PERMISSIONS_NOT_APPLIED);
}

export async function createSession(input: {
  directory: string;
  agent: string;
  model: { providerID: string; id: string } | null;
  title?: string;
}): Promise<{ sessionID: string }> {
  const activeCatalog = listCatalog();
  if (!activeCatalog.agents.some((agent) => agent.id === input.agent)) {
    throw new Error(`El agente "${input.agent}" no está disponible en este host.`);
  }
  const model = input.model ?? activeCatalog.defaultModel ?? undefined;
  const active = requireClient();

  // El renderer puede pedir un borrador sin ruta ("__untitled__") o una ruta
  // relativa: el servicio necesita un directorio absoluto existente. La ruta
  // normalizada es la única que llega a `location.directory`.
  const userData = app.getPath("userData");
  const directory = normalizeSessionDirectory(input.directory, userData);
  mkdirSync(directory, { recursive: true });

  if (runtime === "local") {
    let created: { sessionID: string };
    try {
      created = await createRestrictedSession(
        active,
        {
          directory,
          agent: input.agent,
          ...(model === undefined ? {} : { model }),
          ...(input.title === undefined ? {} : { title: input.title }),
        },
        { userDataDir: userData },
      );
    } catch (error) {
      throw sessionCreationError(directory, runtime, error);
    }
    await verifyRestrictedSession(active, created.sessionID);
    knownSessions.add(created.sessionID);
    return created;
  }

  let session: { id: string };
  try {
    session = await active.session.create({
      location: { directory },
      agent: input.agent,
      model: model ?? undefined,
      title: input.title,
    });
  } catch (error) {
    throw sessionCreationError(directory, runtime, error);
  }
  knownSessions.add(session.id);
  return { sessionID: session.id };
}

export async function prompt(input: { sessionID: string; text: string }): Promise<void> {
  knownSessions.add(input.sessionID);
  doneSessions.delete(input.sessionID);
  doneGuard.set(input.sessionID, Date.now());
  await requireClient().session.prompt({ sessionID: input.sessionID, text: input.text });
}

export async function interrupt(input: { sessionID: string }): Promise<void> {
  knownSessions.add(input.sessionID);
  await requireClient().session.interrupt({ sessionID: input.sessionID });
}

/**
 * Registra una sesión ya persistida (hilo restaurado) para que el bucle de
 * eventos vuelva a reenviar sus deltas. No valida su existencia en el host:
 * es una restauración best-effort.
 */
export function registerSession(input: { sessionID: string }): void {
  knownSessions.add(input.sessionID);
}

interface OAuthAttemptData {
  attemptID?: unknown;
  url?: unknown;
  instructions?: unknown;
  mode?: unknown;
  time?: { created?: unknown; expires?: unknown };
  expiresAt?: unknown;
}

function normalizeOAuthStart(output: unknown): AgentOAuthStart {
  if (typeof output !== "object" || output === null) {
    throw new Error("OpenCode devolvió una respuesta OAuth inesperada.");
  }
  const container = output as { data?: unknown };
  const raw = (
    typeof container.data === "object" && container.data !== null ? container.data : output
  ) as OAuthAttemptData;

  if (typeof raw.attemptID !== "string" || raw.attemptID.length === 0) {
    throw new Error("OpenCode no devolvió un identificador de intento OAuth.");
  }
  if (typeof raw.url !== "string" || raw.url.length === 0) {
    throw new Error("OpenCode no devolvió una URL de autorización.");
  }
  const expires =
    typeof raw.time?.expires === "number"
      ? raw.time.expires
      : typeof raw.expiresAt === "number"
        ? raw.expiresAt
        : null;

  return {
    attemptID: raw.attemptID,
    url: raw.url,
    instructions:
      typeof raw.instructions === "string" && raw.instructions.length > 0
        ? raw.instructions
        : "Abre la URL y autoriza el acceso desde OpenCode Console.",
    mode: typeof raw.mode === "string" && raw.mode.length > 0 ? raw.mode : "device",
    expiresAt: expires,
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

async function localClientForOAuth(): Promise<AgentClient> {
  if (runtime === "local" && client !== null) return client;
  return makeLocalClient();
}

/** Inicia el flujo OAuth device de OpenCode Console y abre la URL. */
export async function oauthStart(): Promise<AgentOAuthStart> {
  const active = await localClientForOAuth();
  const output = await active.integration.oauth.connect({
    integrationID: "opencode",
    methodID: "device",
    answer: { server: "https://opencode.ai/console" },
  });
  const start = normalizeOAuthStart(output);
  if (!isHttpUrl(start.url)) {
    throw new Error("OpenCode devolvió una URL de autorización no válida.");
  }
  oauthAttempts.set(start.attemptID, active);
  try {
    await shell.openExternal(start.url);
  } catch (error) {
    logWarn("no se pudo abrir la URL de autorización", { message: messageOf(error) });
  }
  return start;
}

function normalizeOAuthState(value: unknown): AgentOAuthState {
  if (value === "pending" || value === "complete" || value === "failed" || value === "expired") {
    return value;
  }
  return "pending";
}

/** Consulta el estado del intento; al completar recarga catálogo y cuenta. */
export async function oauthStatus(input: { attemptID: string }): Promise<AgentOAuthStatus> {
  const active = oauthAttempts.get(input.attemptID);
  if (active === undefined) {
    throw new Error("El intento de autorización ya no está activo. Inicia el flujo de nuevo.");
  }
  const output = await active.integration.oauth.status({
    integrationID: "opencode",
    attemptID: input.attemptID,
  });
  const container = output as { data?: unknown };
  const data = (
    typeof container.data === "object" && container.data !== null ? container.data : output
  ) as {
    status?: unknown;
    message?: unknown;
    label?: unknown;
  };
  if (typeof data.status !== "string" || data.status.length === 0) {
    throw new Error(
      "OpenCode no devolvió el estado de la autorización. Cancela e inicia el flujo de nuevo.",
    );
  }
  const state = normalizeOAuthState(data.status);

  if (state === "complete") {
    if (runtime !== null) {
      try {
        catalog = await loadCatalog(runtime);
      } catch (error) {
        logWarn("no se pudo recargar el catálogo tras completar OAuth", {
          message: messageOf(error),
        });
      }
    }
    // La cuenta vive en el servicio local del que se lanzó el OAuth: se lee
    // aunque el runtime activo sea el host embebido.
    try {
      const completed = await readAccount(active);
      if (completed !== null) account = completed;
    } catch (error) {
      logWarn("no se pudo leer la cuenta tras completar OAuth", { message: messageOf(error) });
    }
    emitStatus();
    return { status: "complete" };
  }

  if (state === "failed" || state === "expired") {
    const message =
      typeof data.message === "string" && data.message.length > 0
        ? data.message
        : state === "expired"
          ? "La autorización caducó. Inicia el flujo de nuevo."
          : "La autorización falló. Inténtalo de nuevo.";
    return { status: state, message };
  }

  return { status: "pending" };
}

/** Cancela un intento OAuth y olvida su cliente local. */
export async function oauthCancel(input: { attemptID: string }): Promise<void> {
  const active = oauthAttempts.get(input.attemptID);
  if (active === undefined) return;
  try {
    await active.integration.oauth.cancel({
      integrationID: "opencode",
      attemptID: input.attemptID,
    });
  } finally {
    oauthAttempts.delete(input.attemptID);
  }
}

/** Recarga catálogo y cuenta si hay una conexión lista. */
export async function refresh(): Promise<AgentStatus> {
  if (connection === "ready" && runtime !== null) {
    catalog = await loadCatalog(runtime);
    emitStatus();
  }
  return status();
}

export function getAccount(): AgentAccount | null {
  return account;
}

/** Cierre ordenado al salir de la app. */
export async function shutdownOpenCode(): Promise<void> {
  await disconnect();
}
