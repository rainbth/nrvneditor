import type {
  AgentCatalog,
  AgentEvent,
  AgentMode,
  AgentStatus,
  AgentThread,
  DocumentPayload,
  LanguageSet,
  LanguageTranslation,
  MetadataBundle,
  MetadataSummary,
  NrvnBridge,
  PendingEntry,
  ProposalApplyInput,
  ProposalApplyResult,
  SaveAsResult,
  Settings,
  TreeNode,
  WriteDocumentResult,
} from "../../electron/types";
import pkg from "../../package.json";
import { splitBlocks } from "./blocks";
import { sha256Hex } from "./hash";
import {
  canonicalLanguagePath,
  isLanguageCode,
  languageContentHash,
  languageSiblingPath,
  sourceLanguageOf,
  syncLanguageBlocks,
} from "./languages";
import { buildReplacement } from "./proposal";

const DEFAULT_SETTINGS: Settings = {
  onboarding: { done: true },
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

const MOCK_MODELS: AgentCatalog["models"] = [
  {
    id: "deepseek-v4.1-flash",
    providerID: "opencode-go",
    providerName: "OpenCode Go",
    name: "DeepSeek V4.1 Flash",
  },
  {
    id: "claude-sonnet-5",
    providerID: "opencode-go",
    providerName: "OpenCode Go",
    name: "Claude Sonnet 5",
  },
  { id: "gpt-6-sol", providerID: "opencode", providerName: "OpenCode", name: "GPT-6 Sol" },
];

const MOCK_PROVIDERS: AgentCatalog["providers"] = [
  { id: "opencode-go", name: "OpenCode Go" },
  { id: "opencode", name: "OpenCode" },
];

/** Catálogo embebido: sólo el agente propio de nrvn. */
const EMBEDDED_CATALOG: AgentCatalog = {
  models: MOCK_MODELS,
  defaultModel: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
  providers: MOCK_PROVIDERS,
  agents: [
    {
      id: "nrvn-editor",
      name: "nrvn-editor",
      description: "Editor de Markdown de nrvn. Propone cambios de documento.",
      mode: "primary",
    },
  ],
};

/** Catálogo local: refleja el servicio real, que no expone `nrvn-editor`. */
const LOCAL_CATALOG: AgentCatalog = {
  models: MOCK_MODELS,
  defaultModel: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
  providers: MOCK_PROVIDERS,
  agents: [
    {
      id: "build",
      name: "build",
      description: "Agente general del host de desarrollo.",
      mode: "primary",
    },
    {
      id: "loop",
      name: "loop",
      description: "Agente de producto con contexto del proyecto.",
      mode: "primary",
    },
    {
      id: "plan",
      name: "plan",
      description: "Agente de planificación sin escritura.",
      mode: "primary",
    },
    {
      id: "pm",
      name: "pm",
      description: "Agente de gestión de producto.",
      mode: "primary",
    },
  ],
};

const AGENT_STATUS: AgentStatus = {
  state: "disconnected",
  mode: "auto",
  catalog: undefined,
};

const OPEN_FOLDER_MS = 80;
const READ_DOCUMENT_MS = 120;
const READ_TREE_MS = 40;
const WRITE_DOCUMENT_MS = 160;

const SETTINGS_KEY = "nrvn.mock.settings";
const CONTENT_PREFIX = "nrvn.mock.";
const ROOT = "/mock/nrvn-workspace";

let annotationWriteQueue: Promise<void> = Promise.resolve();

function enqueueAnnotationWrite(task: () => Promise<void>): Promise<void> {
  const next = annotationWriteQueue.catch(() => undefined).then(task);
  annotationWriteQueue = next.catch(() => undefined);
  return next;
}

/**
 * Manifiesto de fixtures. Vite resuelve el glob desde la raíz del proyecto
 * (el renderer usa `root` = repo), así que `/fixtures/workspace/**` es válido.
 */
const rawFixtures = import.meta.glob("/fixtures/workspace/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

interface Fixture {
  path: string;
  type: "file" | "dir";
  excludedFromTree?: boolean;
  content: string;
}

function fromGlob(): Fixture[] {
  const prefix = "/fixtures/workspace/";
  const fixtures: Fixture[] = [];
  for (const [absolute, content] of Object.entries(rawFixtures)) {
    const path = absolute.startsWith(prefix) ? absolute.slice(prefix.length) : absolute;
    fixtures.push({ path, type: "file", content });
  }
  // Entradas que demuestran el filtro del árbol: existen en la carpeta pero no
  // son Markdown, así que nunca aparecen en `getTree()`.
  fixtures.push({
    path: "borrador.txt",
    type: "file",
    excludedFromTree: true,
    content: "Borrador",
  });
  fixtures.push({
    path: "diagrama.png",
    type: "file",
    excludedFromTree: true,
    content: "",
  });
  return fixtures;
}

const FIXTURES = fromGlob();

const BASE_MTIME = 1_700_000_000_000;

function mtimeFor(path: string): number {
  let sum = 0;
  for (let index = 0; index < path.length; index += 1) sum += path.charCodeAt(index);
  return BASE_MTIME + sum * 1000;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Contenido efectivo: fixture + overrides escritos en localStorage. */
function contentType(path: string): string | null {
  const store = storage();
  if (store) {
    const saved = store.getItem(`${CONTENT_PREFIX}${path}`);
    if (saved !== null) return saved;
  }
  const fixture = FIXTURES.find((item) => item.path === path && !item.excludedFromTree);
  return fixture ? fixture.content : null;
}

function readSettings(): Settings {
  const store = storage();
  if (!store) return { ...DEFAULT_SETTINGS };
  const raw = store.getItem(SETTINGS_KEY);
  if (raw === null) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
      onboarding: { ...DEFAULT_SETTINGS.onboarding, ...parsed.onboarding },
      recentWorkspace: parsed.recentWorkspace ?? DEFAULT_SETTINGS.recentWorkspace,
      panelWidths: {
        tree: parsed.panelWidths?.tree ?? DEFAULT_SETTINGS.panelWidths.tree,
        agent: parsed.panelWidths?.agent ?? DEFAULT_SETTINGS.panelWidths.agent,
      },
      panels: {
        tree: parsed.panels?.tree ?? DEFAULT_SETTINGS.panels.tree,
        agent: parsed.panels?.agent ?? DEFAULT_SETTINGS.panels.agent,
      },
      panelHeights: {
        treeOutline: parsed.panelHeights?.treeOutline ?? DEFAULT_SETTINGS.panelHeights.treeOutline,
      },
      render: {
        font: parsed.render?.font ?? DEFAULT_SETTINGS.render.font,
        lineNumbers: parsed.render?.lineNumbers ?? DEFAULT_SETTINGS.render.lineNumbers,
        pageSize: parsed.render?.pageSize ?? DEFAULT_SETTINGS.render.pageSize,
        zoom:
          typeof parsed.render?.zoom === "number" && Number.isFinite(parsed.render.zoom)
            ? Math.min(200, Math.max(50, Math.round(parsed.render.zoom / 10) * 10))
            : DEFAULT_SETTINGS.render.zoom,
      },
      agent: {
        mode: parsed.agent?.mode ?? DEFAULT_SETTINGS.agent.mode,
        model: parsed.agent?.model ?? DEFAULT_SETTINGS.agent.model,
        agent: parsed.agent?.agent ?? DEFAULT_SETTINGS.agent.agent,
        presets: parsed.agent?.presets ?? DEFAULT_SETTINGS.agent.presets,
        preset: parsed.agent?.preset ?? DEFAULT_SETTINGS.agent.preset,
        sessionScope: parsed.agent?.sessionScope ?? DEFAULT_SETTINGS.agent.sessionScope,
      },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: Settings): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Almacenamiento lleno o bloqueado: el mock sigue funcionando en memoria.
  }
}

/** Documentos guardados en el mock (claves `nrvn.mock.*.md[x]`). */
function storedDocumentPaths(): string[] {
  const store = storage();
  if (!store) return [];
  const paths: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!key?.startsWith(CONTENT_PREFIX)) continue;
    const path = key.slice(CONTENT_PREFIX.length);
    if (isMarkdownPath(path)) paths.push(path);
  }
  return paths;
}

function rememberRecent(root: string): void {
  const settings = readSettings();
  if (settings.recentWorkspace === root) return;
  writeSettings({ ...settings, recentWorkspace: root });
}

/*
 * `electron/lib/tree.ts` no se importa aquí: el tsconfig del renderer no cubre
 * `electron/**` y ese módulo depende de `node:path`. Se replica el filtrado
 * mínimo (solo .md/.mdx, directorios ordenados primero, sin node_modules/.git/dist).
 */
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist"]);

function isMarkdownPath(path: string): boolean {
  return /\.(md|mdx)$/i.test(path);
}

function sortEntries(entries: TreeNode[]): TreeNode[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  });
}

function buildTree(paths: string[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const dirs = new Map<string, TreeNode>();

  const ensureDir = (dirPath: string): TreeNode[] => {
    if (dirPath === "") return roots;
    const existing = dirs.get(dirPath);
    if (existing?.children) return existing.children;
    const slash = dirPath.lastIndexOf("/");
    const parentPath = slash === -1 ? "" : dirPath.slice(0, slash);
    const name = dirPath.slice(slash + 1);
    const children: TreeNode[] = [];
    const dir: TreeNode = { name, path: dirPath, type: "dir", children };
    ensureDir(parentPath).push(dir);
    dirs.set(dirPath, dir);
    return children;
  };

  for (const path of paths) {
    const parts = path.split("/").filter((part) => part.length > 0);
    if (parts.length === 0) continue;
    if (parts.some((part) => part.startsWith(".") || EXCLUDED_DIRS.has(part))) continue;
    if (!isMarkdownPath(parts[parts.length - 1])) continue;
    ensureDir(parts.slice(0, -1).join("/")).push({
      name: parts[parts.length - 1],
      path,
      type: "file",
    });
  }

  const prune = (nodes: TreeNode[]): TreeNode[] => {
    const kept: TreeNode[] = [];
    for (const node of nodes) {
      if (node.type === "dir") {
        const children = prune(node.children ?? []);
        if (children.length > 0) kept.push({ ...node, children });
        continue;
      }
      kept.push(node);
    }
    return sortEntries(kept);
  };

  return prune(roots);
}

function documentPayload(path: string, content: string): DocumentPayload {
  return {
    path,
    content,
    eol: content.includes("\r\n") ? "crlf" : "lf",
    bom: content.startsWith("\uFEFF"),
    mtimeMs: mtimeFor(path),
    size: new TextEncoder().encode(content).length,
  };
}

/* ------------------------------------------------------------------ */
/* Agente (mock sin red)                                               */
/* ------------------------------------------------------------------ */

const agentListeners = new Set<(event: AgentEvent) => void>();
let agentMode: AgentMode = "auto";
let mockSessionID: string | null = null;
let mockOAuthAttempt: string | null = null;
let mockOAuthPolls = 0;

const MOCK_ACCOUNT = {
  id: "mock-opencode-account",
  label: "demo@nrvn.local",
  email: "demo@nrvn.local",
  organization: "nrvn",
};

const AGENT_THREAD_PREFIX = "nrvn.mock.threads.";
const PENDING_PREFIX = "nrvn.mock.pending.";

function storedPending(docKey: string): PendingEntry[] {
  try {
    return JSON.parse(storage()?.getItem(`${PENDING_PREFIX}${docKey}`) ?? "[]") as PendingEntry[];
  } catch {
    return [];
  }
}

function metadataSummary(bundle: MetadataBundle): MetadataSummary {
  return {
    threads: bundle.threads.length,
    messages: bundle.threads.reduce((total, item) => total + item.thread.messages.length, 0),
    pending: bundle.pending.reduce((total, item) => total + item.entries.length, 0),
    history: bundle.history.length,
    comments: bundle.comments.length,
    critiques: bundle.critiques.length,
  };
}

function emitAgent(event: AgentEvent): void {
  for (const listener of [...agentListeners]) listener(event);
}

/** Catálogo del runtime activo: el embebido sólo conoce `nrvn-editor`. */
function catalogFor(runtime: AgentStatus["runtime"]): AgentCatalog {
  return runtime === "embedded" ? EMBEDDED_CATALOG : LOCAL_CATALOG;
}

function mockAgentStatus(state: AgentStatus["state"], reason?: string): AgentStatus {
  const runtime = agentMode === "embedded" ? "embedded" : "local";
  return {
    state,
    mode: agentMode,
    runtime,
    account: MOCK_ACCOUNT,
    ...(reason === undefined ? {} : { reason }),
    catalog: catalogFor(runtime),
    permissionsVerified: true,
    sessionsDir: "/mock/nrvn-userdata/opencode/sessions",
    ...(runtime === "local" ? { serviceUrl: "http://127.0.0.1:49374", serviceAuth: false } : {}),
  };
}

function storedThread(docKey: string): AgentThread {
  const store = storage();
  const raw = store?.getItem(`${AGENT_THREAD_PREFIX}${docKey}`);
  if (raw === undefined || raw === null) return { sessionID: null, messages: [], proposal: null };
  try {
    return JSON.parse(raw) as AgentThread;
  } catch {
    return { sessionID: null, messages: [], proposal: null };
  }
}

function persistThread(docKey: string, thread: AgentThread): void {
  try {
    storage()?.setItem(`${AGENT_THREAD_PREFIX}${docKey}`, JSON.stringify(thread));
  } catch {
    // El mock sigue funcionando en memoria si localStorage está lleno.
  }
}

export function mockAssistantText(prompt: string): string {
  const narrativeKind = /Tarea de reescritura narrativa: (extender|reducir)/.exec(prompt)?.[1];
  if (narrativeKind !== undefined) {
    const key = /<<<NRVN_BLOCK key="([^"]+)">>>/.exec(prompt)?.[1];
    if (key === undefined) return "Respuesta inválida: falta la clave del bloque.";
    const marker = `<<<NRVN_BLOCK key="${key}">>>`;
    const start = prompt.indexOf(marker);
    const rawStart = start + marker.length;
    const rawEnd = prompt.indexOf("<<<NRVN_END>>>", rawStart);
    const original = prompt.slice(rawStart, rawEnd).replace(/^\n/, "").replace(/\n$/, "").trim();
    let after: string;
    if (narrativeKind === "extender") {
      const clean = original.replace(/\s+/g, " ").trim();
      after = `${clean}${/[.!?]$/.test(clean) ? "" : "."} El desarrollo añade contexto y matices sin traicionar la intención original.`;
    } else {
      const sentences = original
        .replace(/\s+/g, " ")
        .trim()
        .split(/(?<=[.!?])\s+/);
      after =
        sentences.length === 1
          ? (sentences[0] ?? "")
              .split(/\s+/)
              .slice(0, Math.max(1, Math.ceil((sentences[0] ?? "").split(/\s+/).length * 0.5)))
              .join(" ")
          : sentences.slice(0, Math.max(1, Math.ceil(sentences.length * 0.5))).join(" ");
      if (!/[.!?]$/.test(after)) after += ".";
    }
    return `<<<NRVN_BLOCK key="${key}">>>\n${after}\n<<<NRVN_END>>>`;
  }
  if (prompt.includes("Sugerencia de mejora para el párrafo revisado.")) {
    if (
      (globalThis as typeof globalThis & { __NRVN_MOCK_FITTING_FAIL__?: boolean })
        .__NRVN_MOCK_FITTING_FAIL__ === true
    )
      return "respuesta plana inválida";
    const key = /<<<NRVN_BLOCK key="([^"]+)"/.exec(prompt)?.[1];
    if (key === undefined) return "Respuesta inválida: falta la clave del bloque.";
    return `<<<NRVN_BLOCK key="${key}">>>\nEste párrafo presenta la idea con mayor claridad y aporta el contexto necesario para que el lector pueda comprenderla y aplicarla.\n<<<NRVN_END>>>`;
  }
  if (prompt.includes("Contrato de salida (revisión estructurada")) {
    const lens = /Lente de revisión: .*\(id: ([a-z]+)\)/.exec(prompt)?.[1] ?? "complete";
    const reviewerId = /Id del revisor: ([a-z0-9-]+)/.exec(prompt)?.[1];
    const line = /Audiencia objetivo: (.+)/.exec(prompt)?.[1]?.trim() ?? "";
    const audience =
      reviewerId ??
      (line.startsWith("sin definir") ? null : (/\(([^)]+)\)/.exec(line)?.[1] ?? null));
    const keys = [...prompt.matchAll(/<<<NRVN_BLOCK key="([^"]+)"/g)].map((match) => match[1]);
    const raws = [...prompt.matchAll(/<<<NRVN_BLOCK key="[^"]+">>>([\s\S]*?)<<<NRVN_END>>>/g)].map(
      (match) => match[1].trim(),
    );
    const wordCount = raws.join(" ").split(/\s+/).filter(Boolean).length;
    if (wordCount < 12) {
      return `<<<NRVN_REVIEW>>>${JSON.stringify({ audience, blocks: keys, works: [], problems: [], suggestions: [], fitting: null })}<<<NRVN_END>>>`;
    }
    const fixture =
      lens === "complete"
        ? {
            works: [
              "El texto comunica la idea principal.",
              "La estructura permite seguir la explicación.",
              "El vocabulario es claro.",
              "El ejemplo apoya la idea.",
              "El cierre resume el argumento.",
            ],
            problems: [1, 2, 3, 4, 5].map((n) => ({
              severity: "media",
              issue: `Problema verificable ${n}.`,
              evidence: `Evidencia textual ${n}.`,
            })),
            suggestions: [
              "Añade contexto concreto.",
              "Aclara el término central.",
              "Incluye un ejemplo.",
              "Conecta las ideas.",
              "Refuerza el cierre.",
            ],
            fitting:
              "Esta guía reúne las decisiones de escritura del proyecto nrvn. Está pensada para que cualquier persona que edite documentación encuentre rápido el criterio acordado y pueda aplicarlo con un ejemplo concreto.",
          }
        : lens === "works"
          ? {
              works: [
                "La tesis aparece con claridad.",
                "La estructura ordena las ideas.",
                "El vocabulario es preciso.",
                "El ejemplo concreta el argumento.",
                "El cierre mantiene el foco.",
              ],
              problems: [],
              suggestions: [],
              fitting: null,
            }
          : lens === "problems"
            ? {
                works: [],
                problems: [1, 2, 3, 4, 5].map((n) => ({
                  severity: "media",
                  issue: `Problema verificable ${n}.`,
                  evidence: `Evidencia textual ${n}.`,
                })),
                suggestions: [],
                fitting: null,
              }
            : lens === "questions"
              ? {
                  works: [],
                  problems: [],
                  suggestions: [
                    "¿Qué contexto necesita el lector?",
                    "¿Qué término conviene definir?",
                    "¿Qué ejemplo aclararía la idea?",
                    "¿Qué relación debe explicitarse?",
                    "¿Qué conclusión espera el lector?",
                  ],
                  fitting: null,
                }
              : {
                  works: [],
                  problems: [],
                  suggestions: [
                    "Añade el contexto necesario.",
                    "Incluye un dato de apoyo.",
                    "Aporta un ejemplo concreto.",
                    "Aclara el alcance.",
                    "Explica el límite relevante.",
                  ],
                  fitting: null,
                };
    return `<<<NRVN_REVIEW>>>${JSON.stringify({ audience, blocks: keys, ...fixture })}<<<NRVN_END>>>`;
  }
  if (prompt.includes("Modo: documento completo")) {
    const content = prompt.includes("Documento vacío (0 caracteres)")
      ? "# Documento creado por el agente\n\nEste es el contenido generado por el mock."
      : "# Documento actualizado por el mock\n\nContenido completo generado por el mock.";
    return `<<<NRVN_DOCUMENT>>>\n${content}\n<<<NRVN_END>>>`;
  }
  const key = /key="([^"]+)"/.exec(prompt)?.[1];
  if (key === undefined) {
    return "El mock no recibió una clave de bloque; responde con texto plano.";
  }
  return [
    `<<<NRVN_BLOCK key="${key}">>>`,
    "Un párrafo de transición que conecta la decisión anterior con el principio que viene, revisado por el agente.",
    "<<<NRVN_END>>>",
  ].join("\n");
}

async function streamMockResponse(prompt: string): Promise<void> {
  const sessionID = mockSessionID ?? "mock-session-1";
  const text = mockAssistantText(prompt);
  const chunks = Math.max(3, Math.min(6, Math.ceil(text.length / 18)));
  const size = Math.max(1, Math.ceil(text.length / chunks));
  for (let index = 0; index < text.length; index += size) {
    await delay(30);
    emitAgent({ type: "delta", sessionID, delta: text.slice(index, index + size) });
  }
  emitAgent({ type: "done", sessionID });
}

/**
 * Bridge completo para `VITE_MOCK_BRIDGE=1`: fixtures en memoria, latencias
 * simuladas y persistencia en localStorage. Sin red, sin disco y sin créditos.
 */
export const mockBridge: NrvnBridge = {
  annotations: {
    load: async (docKey) => {
      try {
        const raw = storage()?.getItem(`nrvn.mock.annotations.${docKey}`) ?? null;
        return raw === null
          ? { history: [], comments: [], critiques: [], blockVersions: [], exists: false }
          : { ...JSON.parse(raw), exists: true };
      } catch {
        return { history: [], comments: [], critiques: [], blockVersions: [], exists: false };
      }
    },
    saveComments: async (docKey, comments) => {
      await enqueueAnnotationWrite(async () => {
        const loaded = await mockBridge.annotations.load(docKey);
        storage()?.setItem(
          `nrvn.mock.annotations.${docKey}`,
          JSON.stringify({
            history: loaded.history,
            comments,
            critiques: loaded.critiques,
            blockVersions: loaded.blockVersions,
          }),
        );
      });
    },
    saveCritiques: async (docKey, critiques) => {
      await enqueueAnnotationWrite(async () => {
        const loaded = await mockBridge.annotations.load(docKey);
        storage()?.setItem(
          `nrvn.mock.annotations.${docKey}`,
          JSON.stringify({
            history: loaded.history,
            comments: loaded.comments,
            critiques,
            blockVersions: loaded.blockVersions,
          }),
        );
      });
    },
    saveBlockVersions: async (docKey, blockVersions) => {
      await enqueueAnnotationWrite(async () => {
        const loaded = await mockBridge.annotations.load(docKey);
        storage()?.setItem(
          `nrvn.mock.annotations.${docKey}`,
          JSON.stringify({ ...loaded, blockVersions }),
        );
      });
    },
    appendHistory: async (docKey, event) => {
      await enqueueAnnotationWrite(async () => {
        const loaded = await mockBridge.annotations.load(docKey);
        storage()?.setItem(
          `nrvn.mock.annotations.${docKey}`,
          JSON.stringify({
            history: [...loaded.history, event].slice(-5000),
            comments: loaded.comments,
            critiques: loaded.critiques,
            blockVersions: loaded.blockVersions,
          }),
        );
      });
    },
  },
  metadata: {
    exportDocument: async ({ relPath, docKey }) => {
      const thread = storedThread(docKey);
      const entries = storedPending(docKey);
      let annotations: {
        history: unknown[];
        comments: unknown[];
        critiques: unknown[];
        blockVersions: unknown[];
      } = { history: [], comments: [], critiques: [], blockVersions: [] };
      try {
        annotations = JSON.parse(
          storage()?.getItem(`nrvn.mock.annotations.${docKey}`) ??
            '{"history":[],"comments":[],"critiques":[],"blockVersions":[]}',
        );
      } catch {
        // El mock exporta arrays vacíos si el almacenamiento está corrupto.
      }
      const bundle: MetadataBundle = {
        format: "nrvn.metadata",
        version: 1,
        document: { path: relPath, hash: null, savedAt: Date.now() },
        app: { version: pkg.version },
        threads: [{ docKey, thread }],
        pending: [{ docKey, entries }],
        history: annotations.history,
        comments: annotations.comments,
        critiques: annotations.critiques,
        blockVersions: annotations.blockVersions,
        languages: {},
        provenance: {},
      };
      const basename = (relPath?.split("/").at(-1) ?? "document").replace(/\.(md|mdx)$/i, "");
      const path = `/mock/exports/${basename}.nrvn`;
      storage()?.setItem(`nrvn.mock.metadata.exports.${docKey}`, JSON.stringify(bundle));
      return {
        canceled: false,
        path,
        bytes: new TextEncoder().encode(JSON.stringify(bundle)).length,
      };
    },
    pickImport: async ({ relPath, docKey }) => {
      const thread: AgentThread = {
        sessionID: null,
        messages: [
          {
            id: "imported-msg",
            role: "assistant",
            text: "Mensaje importado de otro dispositivo",
            createdAt: Date.now(),
            status: "done",
          },
        ],
        proposal: null,
      };
      const bundle: MetadataBundle = {
        format: "nrvn.metadata",
        version: 1,
        document: { path: relPath, hash: null, savedAt: Date.now() },
        app: { version: pkg.version },
        threads: [{ docKey, thread }],
        pending: [{ docKey, entries: [{ key: "imported-pending", anchorKey: null }] }],
        history: [],
        comments: [],
        critiques: [],
        blockVersions: [],
        languages: {},
        provenance: {},
      };
      return {
        canceled: false,
        sourcePath: "/mock/import.nrvn",
        bundle,
        summary: metadataSummary(bundle),
        hasExisting: storedThread(docKey).messages.length > 0 || storedPending(docKey).length > 0,
        hashConflict: false,
        localHash: null,
        importedHash: null,
      };
    },
    applyImport: async ({ docKey, bundle, resolution }) => {
      const importedThread = bundle.threads.find((item) => item.docKey === docKey)?.thread;
      const local = storedThread(docKey);
      const preferredMessages =
        resolution === "imported" ? (importedThread?.messages ?? []) : local.messages;
      const secondaryMessages =
        resolution === "imported" ? local.messages : (importedThread?.messages ?? []);
      const mergedThread: AgentThread = {
        ...importedThread,
        ...local,
        messages: [
          ...new Map(
            [...secondaryMessages, ...preferredMessages].map((message) => [message.id, message]),
          ).values(),
        ],
      };
      persistThread(docKey, mergedThread);
      const importedEntries = bundle.pending.find((item) => item.docKey === docKey)?.entries ?? [];
      const localEntries = storedPending(docKey);
      const preferredEntries = resolution === "imported" ? importedEntries : localEntries;
      const secondaryEntries = resolution === "imported" ? localEntries : importedEntries;
      const mergedEntries = [
        ...new Map(
          [...secondaryEntries, ...preferredEntries].map((entry) => [entry.key, entry]),
        ).values(),
      ];
      storage()?.setItem(`${PENDING_PREFIX}${docKey}`, JSON.stringify(mergedEntries));
      const persistedBundle: MetadataBundle = {
        ...bundle,
        blockVersions: bundle.blockVersions ?? [],
        threads: [{ docKey, thread: mergedThread }],
        pending: [{ docKey, entries: mergedEntries }],
      };
      return { ok: true, summary: metadataSummary(persistedBundle) };
    },
  },
  pending: {
    load: async (docKey) => {
      try {
        return JSON.parse(
          localStorage.getItem(`${PENDING_PREFIX}${docKey}`) ?? "[]",
        ) as PendingEntry[];
      } catch {
        return [];
      }
    },
    save: async (docKey, entries) => {
      localStorage.setItem(`nrvn.mock.pending.${docKey}`, JSON.stringify(entries));
    },
  },
  workspace: {
    getLanguages: async (relPath): Promise<LanguageSet> => {
      const originalPath = canonicalLanguagePath(relPath);
      const store = storage();
      try {
        const parsed = JSON.parse(
          store?.getItem(`nrvn.mock.languages.${originalPath}`) ?? "null",
        ) as LanguageSet | null;
        if (parsed) return parsed;
      } catch {
        /* empty */
      }
      return { originalPath, sourceLang: sourceLanguageOf(originalPath), translations: {} };
    },
    createLanguage: async (relPath, lang) => {
      if (!isLanguageCode(lang)) return { ok: false as const, error: "Código de idioma inválido." };
      const sourcePath = canonicalLanguagePath(relPath);
      const source = contentType(sourcePath);
      if (source === null)
        return { ok: false as const, error: "No se encontró el documento original." };
      const targetRel = languageSiblingPath(sourcePath, lang);
      const set = await mockBridge.workspace.getLanguages(sourcePath);
      const existing = contentType(targetRel);
      if (existing !== null) {
        if (!set.translations[lang])
          set.translations[lang] = {
            path: targetRel,
            lang,
            sourceHash: "",
            updatedAt: "",
            stale: true,
            humanEditedBlocks: [],
            blocks: [],
          };
      } else {
        storage()?.setItem(`${CONTENT_PREFIX}${targetRel}`, source);
        set.translations[lang] = {
          path: targetRel,
          lang,
          sourceHash: languageContentHash(source),
          updatedAt: new Date().toISOString(),
          stale: false,
          humanEditedBlocks: [],
          blocks: splitBlocks(source).map((b) => ({
            key: b.key,
            sourceHash: b.hash,
            targetHash: b.hash,
            humanEdited: false,
          })),
        };
      }
      storage()?.setItem(`nrvn.mock.languages.${sourcePath}`, JSON.stringify(set));
      return { ok: true as const, created: existing === null, path: targetRel, set };
    },
    syncLanguage: async (relPath, lang) => {
      const sourcePath = canonicalLanguagePath(relPath);
      const set = await mockBridge.workspace.getLanguages(sourcePath);
      const targetRel = set.translations[lang]?.path ?? languageSiblingPath(sourcePath, lang);
      const source = contentType(sourcePath);
      const target = contentType(targetRel);
      if (source === null || target === null)
        return {
          ok: false as const,
          error: `No existe el documento de origen o la versión ${lang}.`,
        };
      const record: LanguageTranslation = set.translations[lang] ?? {
        path: targetRel,
        lang,
        sourceHash: "",
        updatedAt: "",
        stale: true,
        humanEditedBlocks: [],
        blocks: [],
      };
      const outcome = syncLanguageBlocks(source, target, record);
      if (outcome.content !== target)
        storage()?.setItem(`${CONTENT_PREFIX}${targetRel}`, outcome.content);
      set.translations[lang] = outcome.record;
      storage()?.setItem(`nrvn.mock.languages.${sourcePath}`, JSON.stringify(set));
      return {
        ok: true as const,
        path: targetRel,
        hash: sha256Hex(outcome.content),
        changedBlocks: outcome.changedBlocks,
        protectedBlocks: outcome.protectedBlocks,
        set,
      };
    },
    openFolder: async () => {
      await delay(OPEN_FOLDER_MS);
      return { canceled: false, root: ROOT, name: "workspace" };
    },

    getTree: async (): Promise<TreeNode[]> => {
      await delay(READ_TREE_MS);
      const paths = new Set<string>();
      for (const item of FIXTURES) {
        if (!item.excludedFromTree) paths.add(item.path);
      }
      for (const path of storedDocumentPaths()) paths.add(path);
      return buildTree([...paths]);
    },

    readDocument: async (relPath) => {
      await delay(READ_DOCUMENT_MS);
      const content = contentType(relPath);
      if (content === null) throw new Error(`No se encontró el archivo: ${relPath}`);
      return documentPayload(relPath, content);
    },

    writeDocument: async (relPath, content): Promise<WriteDocumentResult> => {
      // Latencia simulada: hace visible el estado `Guardando…` en la UI y en E2E.
      await delay(WRITE_DOCUMENT_MS);
      const store = storage();
      if (store) {
        try {
          store.setItem(`${CONTENT_PREFIX}${relPath}`, content);
        } catch {
          return { ok: false, error: "No se pudo persistir el documento en el mock" };
        }
      }
      return { ok: true, mtimeMs: Date.now(), hash: sha256Hex(content) };
    },

    saveDocumentAs: async (content, sourceDocKey, resetMetadata): Promise<SaveAsResult> => {
      await delay(WRITE_DOCUMENT_MS);
      // El mock reutiliza siempre el mismo borrador guardado.
      const relPath = "sin-titulo.md";
      const store = storage();
      if (store) {
        try {
          store.setItem(`${CONTENT_PREFIX}${relPath}`, content);
        } catch {
          return { canceled: true };
        }
        if (resetMetadata === true) {
          store.removeItem(`${AGENT_THREAD_PREFIX}${relPath}`);
          store.removeItem(`${PENDING_PREFIX}${relPath}`);
        } else if (sourceDocKey && sourceDocKey !== "sin-titulo.md") {
          const targetDocKey = "sin-titulo.md";
          const thread = storedThread(sourceDocKey);
          const pending = storedPending(sourceDocKey);
          persistThread(targetDocKey, thread);
          store.setItem(`${PENDING_PREFIX}${targetDocKey}`, JSON.stringify(pending));
          store.removeItem(`${AGENT_THREAD_PREFIX}${sourceDocKey}`);
          store.removeItem(`${PENDING_PREFIX}${sourceDocKey}`);
        }
      }
      rememberRecent(ROOT);
      return {
        canceled: false,
        root: ROOT,
        name: "workspace",
        relPath,
        mtimeMs: Date.now(),
        hash: sha256Hex(content),
      };
    },

    revealPath: async () => true,

    copyPath: async () => true,

    openRecent: async () => {
      await delay(OPEN_FOLDER_MS);
      if (readSettings().recentWorkspace === null) return { canceled: true };
      return { canceled: false, root: ROOT, name: "workspace" };
    },

    onTreeChanged: () => () => {},
    onFileSaved: () => () => {},
  },

  settings: {
    get: async () => readSettings(),
    patch: async (partial) => {
      const next: Settings = {
        onboarding: { ...readSettings().onboarding, ...partial.onboarding },
        theme: partial.theme ?? readSettings().theme,
        recentWorkspace:
          partial.recentWorkspace !== undefined
            ? partial.recentWorkspace
            : readSettings().recentWorkspace,
        panelWidths: {
          ...readSettings().panelWidths,
          ...partial.panelWidths,
        },
        panels: {
          ...readSettings().panels,
          ...partial.panels,
        },
        panelHeights: { ...readSettings().panelHeights, ...partial.panelHeights },
        render: {
          ...readSettings().render,
          ...partial.render,
        },
        agent: {
          ...readSettings().agent,
          ...partial.agent,
        },
      };
      writeSettings(next);
      return next;
    },
  },

  agent: {
    getStatus: async () => (mockSessionID === null ? AGENT_STATUS : mockAgentStatus("ready")),

    connect: async (mode) => {
      // `auto` resuelve al runtime local, como en el host real.
      agentMode = mode === "auto" || mode === undefined ? "local" : mode;
      emitAgent({ type: "status", status: mockAgentStatus("connecting") });
      await delay(10);
      emitAgent({ type: "status", status: mockAgentStatus("ready") });
      return mockAgentStatus("ready");
    },

    disconnect: async () => {
      mockSessionID = null;
      emitAgent({ type: "status", status: AGENT_STATUS });
    },

    listCatalog: async () => catalogFor(agentMode === "embedded" ? "embedded" : "local"),

    refresh: async () => mockAgentStatus("ready"),

    getAccount: async () => MOCK_ACCOUNT,

    oauthStart: async () => {
      mockOAuthAttempt = "mock-oauth-attempt";
      mockOAuthPolls = 0;
      return {
        attemptID: mockOAuthAttempt,
        url: "https://opencode.ai/console/device?user_code=NRVN-MOCK",
        instructions: "Enter code: NRVN-MOCK",
        mode: "auto",
        expiresAt: Date.now() + 300_000,
      };
    },

    oauthStatus: async (input) => {
      if (mockOAuthAttempt === null || input.attemptID !== mockOAuthAttempt) {
        return { status: "expired" as const, message: "El intento de autorización no existe." };
      }
      mockOAuthPolls += 1;
      return mockOAuthPolls <= 1 ? { status: "pending" as const } : { status: "complete" as const };
    },

    oauthCancel: async (input) => {
      if (mockOAuthAttempt !== null && input.attemptID === mockOAuthAttempt) {
        mockOAuthAttempt = null;
        mockOAuthPolls = 0;
      }
    },

    createSession: async (_input) => {
      await delay(10);
      mockSessionID = "mock-session-1";
      return { sessionID: mockSessionID };
    },

    prompt: async (input) => {
      mockSessionID = input.sessionID;
      void streamMockResponse(input.text);
    },

    interrupt: async (input) => {
      emitAgent({ type: "done", sessionID: input.sessionID });
    },

    registerSession: async () => {
      // El mock no filtra eventos por sesión: no hay nada que restaurar.
    },

    loadThread: async (_workspaceRoot, docKey) => storedThread(docKey),

    saveThread: async (_workspaceRoot, docKey, thread) => {
      persistThread(docKey, thread);
    },

    applyProposal: async (input: ProposalApplyInput): Promise<ProposalApplyResult> => {
      const current = contentType(input.relPath);
      if (current === null) return { ok: false, error: "No se encontró el documento." };
      const normalized = current.replace(/\r\n/g, "\n");
      if (sha256Hex(normalized) !== input.expectedHash) {
        return { ok: false, error: "El documento cambió en disco. Recarga antes de aplicar." };
      }
      const replacement = buildReplacement(
        normalized,
        splitBlocks(normalized).map((block) => ({
          key: block.key,
          startOffset: block.startOffset,
          endOffset: block.endOffset,
          raw: block.raw,
        })),
        input.blocks.map((block) => ({ key: block.key, after: block.after })),
      );
      if (!replacement.ok) return { ok: false, error: replacement.error };
      try {
        storage()?.setItem(`${CONTENT_PREFIX}${input.relPath}`, replacement.content);
      } catch {
        return { ok: false, error: "No se pudo persistir el documento en el mock" };
      }
      return {
        ok: true,
        mtimeMs: Date.now(),
        hash: sha256Hex(replacement.content),
        snapshotPath: `mock://snapshots/${input.relPath}`,
      };
    },

    applyDocument: async (input) => {
      const current = contentType(input.relPath);
      if (current === null) return { ok: false, error: "No se encontró el documento." };
      if (sha256Hex(current.replace(/\r\n/g, "\n")) !== input.expectedHash) {
        return { ok: false, error: "El documento cambió en disco. Recarga antes de aplicar." };
      }
      try {
        storage()?.setItem(`${CONTENT_PREFIX}${input.relPath}`, input.content);
      } catch {
        return { ok: false, error: "No se pudo persistir el documento en el mock" };
      }
      return {
        ok: true,
        mtimeMs: Date.now(),
        hash: sha256Hex(input.content.replace(/\r\n/g, "\n")),
        snapshotPath: `mock://snapshots/${input.relPath}`,
      };
    },

    onEvent: (cb) => {
      agentListeners.add(cb);
      return () => {
        agentListeners.delete(cb);
      };
    },
  },

  app: {
    platform: "darwin",
    version: pkg.version,
    electronVersion: "0.0.0-mock",
    commit: "dev",
    openExternal: async () => true,
    copyText: async () => true,
  },

  onMenuCommand: () => () => {},
};
