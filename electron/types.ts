import { z } from "zod";

/** Tipo de entrada del árbol de la carpeta abierta. */
export type TreeNodeType = "dir" | "file";

/** Nodo del árbol filtrado a `.md`/`.mdx`. */
export interface TreeNode {
  name: string;
  path: string;
  type: TreeNodeType;
  children?: TreeNode[];
  language?: string;
  languageStale?: boolean;
  canonicalPath?: string;
  siblings?: Array<{ lang: string; path: string }>;
}

export interface LanguageBlockState {
  key: string;
  sourceHash: string;
  targetHash: string;
  humanEdited: boolean;
}
export interface LanguageTranslation {
  path: string;
  lang: string;
  sourceHash: string;
  updatedAt: string;
  stale: boolean;
  humanEditedBlocks: string[];
  blocks: LanguageBlockState[];
}
export interface LanguageSet {
  originalPath: string;
  sourceLang: string;
  translations: Record<string, LanguageTranslation>;
}
export type LanguageCreateResult =
  | { ok: true; created: boolean; path: string; set: LanguageSet }
  | { ok: false; error: string };
export type LanguageSyncResult =
  | {
      ok: true;
      path: string;
      hash: string;
      changedBlocks: number;
      protectedBlocks: number;
      set: LanguageSet;
    }
  | { ok: false; error: string };

export type Eol = "lf" | "crlf";

/** Documento leído desde disco con su estilo de escritura. */
export interface DocumentPayload {
  path: string;
  content: string;
  eol: Eol;
  bom: boolean;
  mtimeMs: number;
  size: number;
  metadataWarning?: string;
}

export type Theme = "light" | "dark" | "system";

/** Fuente de la prosa renderizada. */
export type RenderFont = "lato" | "newsreader" | "system";
export type PageSize = "letter" | "a4" | "wide" | "web";

export interface RenderSettings {
  font: RenderFont;
  lineNumbers: boolean;
  pageSize: PageSize;
  zoom: number;
}

export interface PanelHeights {
  treeOutline: number;
}

export interface PanelWidths {
  tree: number;
  agent: number;
}

export interface Panels {
  tree: boolean;
  agent: boolean;
}

/** Modo solicitado de conexión del host de agente. */
export type AgentMode = "auto" | "local" | "embedded";
export type AgentSessionScope = "document" | "workspace";

export interface AgentPreset {
  id: string;
  name: string;
  /** Agente a usar al aplicar el preset; null conserva el actual. */
  agent: string | null;
  /** Modelo a usar; null = predeterminado del catálogo. */
  model: { providerID: string; id: string } | null;
  /** Comportamiento que se añade al prompt cuando el preset está activo. */
  instruction: string;
}

/** Runtime realmente conectado, que en modo `auto` puede diferir del solicitado. */
export type AgentRuntime = "local" | "embedded";
export type AgentConnectionState = "disconnected" | "connecting" | "ready" | "error";

export interface AgentModel {
  id: string;
  providerID: string;
  providerName: string;
  name: string;
}

export interface AgentProvider {
  id: string;
  name: string;
}

export interface AgentDescriptor {
  id: string;
  name: string;
  description?: string;
  mode: "primary" | "subagent" | "all";
}

export interface AgentCatalog {
  models: AgentModel[];
  defaultModel: { providerID: string; id: string } | null;
  agents: AgentDescriptor[];
  providers: AgentProvider[];
}

/** Cuenta de OpenCode Console expuesta al renderer, sin credenciales. */
export interface AgentAccount {
  id: string;
  label: string;
  email?: string;
  organization?: string;
}

export interface AgentStatus {
  state: AgentConnectionState;
  mode: AgentMode;
  runtime?: AgentRuntime;
  reason?: string;
  catalog?: AgentCatalog;
  account?: AgentAccount | null;
  /** Carpeta de sesiones usada por nrvn para borradores sin workspace. */
  sessionsDir?: string;
  /** URL del servicio local; sólo se expone con runtime `local`. */
  serviceUrl?: string;
  /** Indica si el servicio local usa basic auth; nunca el valor. */
  serviceAuth?: boolean;
  /** Confirma si el servicio aplicó los permisos sin herramientas; ausente si no se pudo verificar. */
  permissionsVerified?: boolean;
}

export interface AgentThreadMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  status: "streaming" | "done" | "error" | "cancelled";
  error?: string;
}

export interface AgentProposalBlock {
  key: string;
  before: string;
  after: string;
}

export interface AgentDocumentChange {
  before: string;
  after: string;
}

export interface AgentProposal {
  id: string;
  createdAt: number;
  prompt: string;
  kind: "blocks" | "document";
  blocks: AgentProposalBlock[];
  document: AgentDocumentChange | null;
  source?: "chat" | "review" | "narrative";
}

export interface AgentThread {
  sessionID: string | null;
  messages: AgentThreadMessage[];
  proposal: AgentProposal | null;
}

export interface PendingEntry {
  key: string;
  anchorKey: string | null;
}
export type PendingStore = { version: 1; documents: Record<string, PendingEntry[]> };

/** Evento de streaming reemitido al renderer. */
export interface AgentEvent {
  type: "delta" | "done" | "error" | "status";
  sessionID?: string;
  delta?: string;
  message?: string;
  status?: AgentStatus;
}

export interface ProposalApplyBlock {
  key: string;
  before: string;
  after: string;
}

export interface ProposalApplyInput {
  relPath: string;
  /** SHA-256 del contenido normalizado a LF. */
  expectedHash: string;
  prompt: string;
  blocks: ProposalApplyBlock[];
}

/** Aplicación de una propuesta de documento completo (reemplazo total). */
export interface DocumentApplyInput {
  relPath: string;
  /** SHA-256 del contenido normalizado a LF. */
  expectedHash: string;
  prompt: string;
  content: string;
}

/** Datos públicos de un intento OAuth device de OpenCode Console. */
export interface AgentOAuthStart {
  attemptID: string;
  url: string;
  instructions: string;
  mode: string;
  expiresAt: number | null;
}

export type AgentOAuthState = "pending" | "complete" | "failed" | "expired" | "cancelled";

export interface AgentOAuthStatus {
  status: AgentOAuthState;
  message?: string;
}

export type ProposalApplyResult =
  | { ok: true; mtimeMs: number; hash: string; snapshotPath: string }
  | { ok: false; error: string };

export const settingsSchema = z.object({
  onboarding: z.object({ done: z.boolean().default(false) }).default({ done: false }),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  recentWorkspace: z.string().nullable().default(null),
  panelWidths: z
    .object({
      tree: z.number().int().positive().max(360).default(248),
      agent: z.number().int().positive().max(640).default(380),
    })
    .default({ tree: 248, agent: 380 }),
  panels: z
    .object({
      tree: z.boolean().default(true),
      agent: z.boolean().default(true),
    })
    .default({ tree: true, agent: true }),
  panelHeights: z
    .object({ treeOutline: z.number().min(0).max(1).default(0.5) })
    .default({ treeOutline: 0.5 }),
  render: z
    .object({
      font: z.enum(["lato", "newsreader", "system"]).default("lato"),
      lineNumbers: z.boolean().default(true),
      pageSize: z.enum(["letter", "a4", "wide", "web"]).default("letter"),
      zoom: z.number().int().min(50).max(200).default(100),
    })
    .default({ font: "lato", lineNumbers: true, pageSize: "letter", zoom: 100 }),
  agent: z
    .object({
      mode: z
        .preprocess(
          (value) => (value === "service" ? "local" : value),
          z.enum(["auto", "local", "embedded"]),
        )
        .default("auto"),
      model: z
        .object({
          providerID: z.string().min(1),
          id: z.string().min(1),
        })
        .nullable()
        .default(null),
      agent: z.string().min(1).default("nrvn-editor"),
      presets: z
        .array(
          z.object({
            id: z.string().min(1).max(120),
            name: z.string().min(1).max(120),
            agent: z.string().min(1).max(256).nullable().default(null),
            model: z
              .object({ providerID: z.string().min(1), id: z.string().min(1) })
              .nullable()
              .default(null),
            instruction: z.string().max(4000).default(""),
          }),
        )
        .max(50)
        .default([]),
      preset: z.string().min(1).max(120).nullable().default(null),
      sessionScope: z.enum(["document", "workspace"]).default("document"),
    })
    .default({
      mode: "auto",
      model: null,
      agent: "nrvn-editor",
      presets: [],
      preset: null,
      sessionScope: "document",
    }),
});

export type Settings = z.infer<typeof settingsSchema>;

export const historyEventSchema = z
  .object({
    id: z.string().min(1).max(512),
    docKey: z.string().min(1).max(4096),
    kind: z.enum(["agent-blocks", "agent-document", "manual"]),
    createdAt: z.number().finite(),
    prompt: z.string().max(1_000_000).optional(),
    blocks: z
      .array(
        z
          .object({
            key: z.string().max(512),
            beforeHash: z.string().max(64),
            afterHash: z.string().max(64),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export const blockCommentSchema = z
  .object({
    id: z.string().min(1).max(512),
    docKey: z.string().min(1).max(4096),
    blockKey: z.string().max(512),
    blockHash: z.string().max(64),
    body: z.string().max(20_000),
    createdAt: z.number().finite(),
    updatedAt: z.number().finite(),
    resolved: z.boolean(),
  })
  .strict();
export const storedCritiqueBlockSchema = z
  .object({
    key: z.string().max(512),
    verdict: z.enum(["solido", "aceptable", "debil"]),
    summary: z.string().max(20_000),
    findings: z
      .array(
        z
          .object({
            severity: z.enum(["alta", "media", "baja"]),
            issue: z.string().max(20_000),
            evidence: z.string().max(20_000),
          })
          .strict(),
      )
      .max(50),
    suggestions: z.array(z.string().max(20_000)).max(50),
  })
  .strict();
export const storedCritiqueSchema = z
  .object({
    id: z.string().min(1).max(512),
    docKey: z.string().min(1).max(4096),
    audience: z.string().max(256),
    createdAt: z.number().finite(),
    blockHashes: z.record(z.string(), z.string()),
    blocks: z.array(storedCritiqueBlockSchema).max(200),
  })
  .strict();
export const blockVersionSchema = z
  .object({
    id: z.string().min(1).max(512),
    blockKey: z.string().max(512),
    raw: z.string().max(5_000_000),
    createdAt: z.number().finite(),
    source: z.string().max(64),
  })
  .strict();
export type BlockVersion = z.infer<typeof blockVersionSchema>;
export const documentAnnotationsSchema = z
  .object({
    history: z.array(historyEventSchema).max(5000),
    comments: z.array(blockCommentSchema).max(5000),
    critiques: z.array(storedCritiqueSchema).max(5000),
    blockVersions: z.array(blockVersionSchema).max(10000).default([]),
  })
  .strict();
export type HistoryEvent = z.infer<typeof historyEventSchema>;
export type BlockComment = z.infer<typeof blockCommentSchema>;
export type StoredCritiqueBlock = z.infer<typeof storedCritiqueBlockSchema>;
export type StoredCritique = z.infer<typeof storedCritiqueSchema>;
export type DocumentAnnotations = z.infer<typeof documentAnnotationsSchema>;
export type DocumentAnnotationsLoad = DocumentAnnotations & { exists: boolean };

export interface OpenFolderResult {
  canceled: boolean;
  root?: string;
  name?: string;
}

export type WriteDocumentResult =
  | { ok: true; mtimeMs: number; hash: string; warning?: string }
  | { ok: false; error: string };

/** Resultado de «Guardar como…»: cancelado o documento escrito y su workspace. */
export type SaveAsResult =
  | { canceled: true }
  | {
      canceled: false;
      root: string;
      name: string;
      relPath: string;
      mtimeMs: number;
      hash: string;
      warning?: string;
    };

/**
 * Comandos que el proceso principal envía al renderer desde el menú nativo.
 * `copy-path`/`reveal-path` los resuelve el renderer con la ruta del documento
 * activo; el resto son comandos de aplicación.
 */
export type MenuCommand =
  | "open-folder"
  | "new-document"
  | "save"
  | "save-as"
  | "export-metadata"
  | "import-metadata"
  | "toggle-mode"
  | "select-all-document"
  | "copy-markdown"
  | "reopen-workspace"
  | "refresh-tree"
  | "reveal-workspace"
  | "close-document"
  | "copy-path"
  | "reveal-path"
  | "toggle-line-numbers"
  | "render-font-lato"
  | "render-font-newsreader"
  | "render-font-system"
  | "page-zoom-in"
  | "page-zoom-out"
  | "page-zoom-reset"
  | "toggle-tree"
  | "toggle-agent"
  | "about"
  | "show-onboarding";

export interface FileSavedEvent {
  path: string;
  hash: string;
}

export interface MetadataThreadRecord {
  docKey: string;
  thread: AgentThread;
}
export interface MetadataPendingRecord {
  docKey: string;
  entries: PendingEntry[];
}
export interface MetadataDocumentRef {
  path: string | null;
  hash: string | null;
  savedAt: number;
}
export interface MetadataBundle {
  format: "nrvn.metadata";
  version: 1;
  document: MetadataDocumentRef;
  app: { version: string } & Record<string, unknown>;
  threads: MetadataThreadRecord[];
  pending: MetadataPendingRecord[];
  history: unknown[];
  comments: unknown[];
  critiques: unknown[];
  blockVersions?: unknown[];
  languages: Record<string, unknown>;
  provenance: Record<string, unknown>;
  [section: string]: unknown;
}
export interface MetadataSummary {
  threads: number;
  messages: number;
  pending: number;
  history: number;
  comments: number;
  critiques: number;
}
export type MetadataExportResult =
  | { canceled: true }
  | { canceled: false; path: string; bytes: number };
export type MetadataPickResult =
  | { canceled: true }
  | {
      canceled: false;
      sourcePath: string;
      bundle: MetadataBundle;
      summary: MetadataSummary;
      hasExisting: boolean;
      hashConflict: boolean;
      localHash: string | null;
      importedHash: string | null;
    };
export interface MetadataApplyInput {
  relPath: string | null;
  docKey: string;
  bundle: MetadataBundle;
  confirmed: boolean;
  resolution: "local" | "imported";
}
export type MetadataApplyResult =
  | { ok: true; summary: MetadataSummary }
  | { ok: false; error: string; needsConfirmation?: boolean };

/**
 * Contrato del bridge expuesto en `window.nrvn` por el preload.
 * La UI (Unidad 2) se construye exclusivamente contra esta interfaz.
 */
export interface NrvnBridge {
  annotations: {
    load(docKey: string): Promise<DocumentAnnotationsLoad>;
    saveComments(docKey: string, comments: BlockComment[]): Promise<void>;
    saveCritiques(docKey: string, critiques: StoredCritique[]): Promise<void>;
    saveBlockVersions(docKey: string, versions: BlockVersion[]): Promise<void>;
    appendHistory(docKey: string, event: HistoryEvent): Promise<void>;
  };
  metadata: {
    exportDocument(input: {
      relPath: string | null;
      docKey: string;
    }): Promise<MetadataExportResult>;
    pickImport(input: { relPath: string | null; docKey: string }): Promise<MetadataPickResult>;
    applyImport(input: MetadataApplyInput): Promise<MetadataApplyResult>;
  };
  pending: {
    load(docKey: string): Promise<PendingEntry[]>;
    save(docKey: string, entries: PendingEntry[]): Promise<void>;
  };
  workspace: {
    getLanguages(relPath: string): Promise<LanguageSet>;
    createLanguage(relPath: string, lang: string): Promise<LanguageCreateResult>;
    syncLanguage(relPath: string, lang: string): Promise<LanguageSyncResult>;
    openFolder(): Promise<OpenFolderResult>;
    getTree(): Promise<TreeNode[]>;
    readDocument(relPath: string): Promise<DocumentPayload>;
    writeDocument(relPath: string, content: string): Promise<WriteDocumentResult>;
    saveDocumentAs(
      content: string,
      sourceDocKey?: string,
      resetMetadata?: boolean,
    ): Promise<SaveAsResult>;
    revealPath(relPath: string | null): Promise<boolean>;
    copyPath(relPath: string | null): Promise<boolean>;
    openRecent(): Promise<OpenFolderResult>;
    onTreeChanged(cb: (tree: TreeNode[]) => void): () => void;
    onFileSaved(cb: (e: FileSavedEvent) => void): () => void;
  };
  settings: {
    get(): Promise<Settings>;
    patch(p: Partial<Settings>): Promise<Settings>;
  };
  agent: {
    getStatus(): Promise<AgentStatus>;
    connect(mode?: AgentMode): Promise<AgentStatus>;
    disconnect(): Promise<void>;
    refresh(): Promise<AgentStatus>;
    getAccount(): Promise<AgentAccount | null>;
    listCatalog(): Promise<AgentCatalog>;
    createSession(input: {
      directory: string;
      agent: string;
      model: { providerID: string; id: string } | null;
      title?: string;
    }): Promise<{ sessionID: string }>;
    prompt(input: { sessionID: string; text: string }): Promise<void>;
    interrupt(input: { sessionID: string }): Promise<void>;
    /** Registra una sesión persistida para poder recibir sus eventos al restaurar. */
    registerSession(input: { sessionID: string }): Promise<void>;
    loadThread(workspaceRoot: string, docKey: string): Promise<AgentThread>;
    saveThread(workspaceRoot: string, docKey: string, thread: AgentThread): Promise<void>;
    applyProposal(input: ProposalApplyInput): Promise<ProposalApplyResult>;
    applyDocument(input: DocumentApplyInput): Promise<ProposalApplyResult>;
    oauthStart(): Promise<AgentOAuthStart>;
    oauthStatus(input: { attemptID: string }): Promise<AgentOAuthStatus>;
    oauthCancel(input: { attemptID: string }): Promise<void>;
    onEvent(cb: (event: AgentEvent) => void): () => void;
  };
  app: {
    platform: string;
    version: string;
    electronVersion: string;
    commit: string;
    openExternal(url: string): Promise<boolean>;
    copyText(text: string): Promise<boolean>;
  };
  onMenuCommand(cb: (cmd: MenuCommand) => void): () => void;
}
