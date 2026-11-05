import { BrowserWindow, clipboard, type IpcMainInvokeEvent, ipcMain, shell } from "electron";
import { z } from "zod";
import { MAX_DOCUMENT_BYTES } from "./lib/atomic";
import { logError } from "./lib/logger";
import * as annotationsService from "./services/annotations";
import * as languageService from "./services/languages";
import * as metadataService from "./services/metadata";
import * as agentService from "./services/opencode";
import * as pendingService from "./services/pending";
import * as settingsService from "./services/settings";
import * as threadsService from "./services/threads";
import * as workspaceService from "./services/workspace";
import {
  blockCommentSchema,
  blockVersionSchema,
  historyEventSchema,
  storedCritiqueSchema,
} from "./types";

/** Canales IPC enumerados. Preload y main comparten estos nombres. */
export const CHANNELS = {
  openFolder: "nrvn:fs:open-folder",
  getTree: "nrvn:fs:get-tree",
  readDocument: "nrvn:fs:read",
  writeDocument: "nrvn:fs:write",
  saveAs: "nrvn:fs:save-as",
  reveal: "nrvn:fs:reveal",
  copyPath: "nrvn:fs:copy-path",
  openRecent: "nrvn:fs:open-recent",
  openExternal: "nrvn:app:open-external",
  copyText: "nrvn:app:copy-text",
  settingsGet: "nrvn:settings:get",
  settingsPatch: "nrvn:settings:patch",
  agentStatus: "nrvn:agent:status",
  agentGetStatus: "nrvn:agent:get-status",
  agentConnect: "nrvn:agent:connect",
  agentDisconnect: "nrvn:agent:disconnect",
  agentListCatalog: "nrvn:agent:list-catalog",
  agentCreateSession: "nrvn:agent:create-session",
  agentPrompt: "nrvn:agent:prompt",
  agentInterrupt: "nrvn:agent:interrupt",
  agentRegisterSession: "nrvn:agent:register-session",
  agentLoadThread: "nrvn:agent:load-thread",
  agentSaveThread: "nrvn:agent:save-thread",
  agentApplyProposal: "nrvn:agent:apply-proposal",
  agentApplyDocument: "nrvn:agent:apply-document",
  agentRefresh: "nrvn:agent:refresh",
  agentGetAccount: "nrvn:agent:get-account",
  agentOauthStart: "nrvn:agent:oauth-start",
  agentOauthStatus: "nrvn:agent:oauth-status",
  agentOauthCancel: "nrvn:agent:oauth-cancel",
  eventTreeChanged: "nrvn:event:tree-changed",
  eventFileSaved: "nrvn:event:file-saved",
  eventMenu: "nrvn:event:menu",
  eventAgent: "nrvn:event:agent",
  pendingLoad: "nrvn:pending:load",
  pendingSave: "nrvn:pending:save",
  metadataExport: "nrvn:metadata:export",
  metadataPickImport: "nrvn:metadata:pick-import",
  metadataApplyImport: "nrvn:metadata:apply-import",
  languageGet: "nrvn:language:get",
  languageCreate: "nrvn:language:create",
  languageSync: "nrvn:language:sync",
  annotationsLoad: "nrvn:annotations:load",
  annotationsSaveComments: "nrvn:annotations:save-comments",
  annotationsSaveCritiques: "nrvn:annotations:save-critiques",
  annotationsSaveBlockVersions: "nrvn:annotations:save-block-versions",
  annotationsAppendHistory: "nrvn:annotations:append-history",
} as const;

const relPathSchema = z.string().min(1).max(4096);
const readSchema = z.object({ relPath: relPathSchema });
const writeSchema = z.object({
  relPath: relPathSchema,
  content: z.string().max(MAX_DOCUMENT_BYTES),
});
const saveAsSchema = z.object({
  content: z.string().max(MAX_DOCUMENT_BYTES),
  sourceDocKey: z.string().min(1).max(4096).optional(),
  resetMetadata: z.boolean().optional(),
});
const targetSchema = z.object({ relPath: relPathSchema.nullable() });
const langSchema = z.string().regex(/^[a-z]{2}(?:-[A-Za-z]{2})?$/);
const languageMutationSchema = z.object({ relPath: relPathSchema, lang: langSchema }).strict();
const copyTextSchema = z.string().max(20_000_000);
const externalSchema = z.string().min(1).max(8192).refine(isAllowedExternalUrl);
const presetSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    agent: z.string().min(1).max(256).nullable().default(null),
    model: z
      .object({ providerID: z.string().min(1).max(256), id: z.string().min(1).max(256) })
      .strict()
      .nullable()
      .default(null),
    instruction: z.string().max(4000).default(""),
  })
  .strict();
export const settingsPatchSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  recentWorkspace: z.string().nullable().optional(),
  panelWidths: z
    .object({
      tree: z.number().int().min(200).max(360).optional(),
      agent: z.number().int().min(320).max(640).optional(),
    })
    .optional(),
  panels: z
    .object({
      tree: z.boolean().optional(),
      agent: z.boolean().optional(),
    })
    .optional(),
  panelHeights: z.object({ treeOutline: z.number().min(0).max(1).optional() }).optional(),
  render: z
    .object({
      font: z.enum(["lato", "newsreader", "system"]).optional(),
      lineNumbers: z.boolean().optional(),
      pageSize: z.enum(["letter", "a4", "wide", "web"]).optional(),
      zoom: z.number().int().min(50).max(200).optional(),
    })
    .optional(),
  agent: z
    .object({
      mode: z
        .preprocess(
          (value) => (value === "service" ? "local" : value),
          z.enum(["auto", "local", "embedded"]),
        )
        .optional(),
      model: z
        .object({
          providerID: z.string().min(1).max(256),
          id: z.string().min(1).max(256),
        })
        .strict()
        .nullable()
        .optional(),
      agent: z.string().min(1).max(256).optional(),
      presets: z.array(presetSchema).max(50).optional(),
      preset: z.string().min(1).max(120).nullable().optional(),
      sessionScope: z.enum(["document", "workspace"]).optional(),
    })
    .strict()
    .optional(),
});

const agentModeSchema = z.enum(["auto", "local", "embedded"]);
const modelRefSchema = z
  .object({
    providerID: z.string().min(1).max(256),
    id: z.string().min(1).max(256),
  })
  .strict();
const createSessionSchema = z
  .object({
    directory: z.string().min(1).max(4096),
    agent: z.string().min(1).max(256),
    model: modelRefSchema.nullable(),
    title: z.string().max(512).optional(),
  })
  .strict();
const sessionSchema = z.object({ sessionID: z.string().min(1).max(512) }).strict();
const promptSchema = z
  .object({
    sessionID: z.string().min(1).max(512),
    text: z.string().min(1).max(20_000_000),
  })
  .strict();
const threadMessageSchema = z
  .object({
    id: z.string().min(1).max(512),
    role: z.enum(["user", "assistant"]),
    text: z.string().max(5_000_000),
    createdAt: z.number().finite(),
    status: z.enum(["streaming", "done", "error", "cancelled"]),
    error: z.string().max(8192).optional(),
  })
  .strict();
const threadSchema = z
  .object({
    sessionID: z.string().min(1).max(512).nullable(),
    messages: z.array(threadMessageSchema).max(5000),
    proposal: z
      .object({
        id: z.string().min(1).max(512),
        createdAt: z.number().finite(),
        prompt: z.string().max(5_000_000),
        kind: z.enum(["blocks", "document"]).default("blocks"),
        blocks: z
          .array(
            z
              .object({
                key: z.string().min(1).max(512),
                before: z.string().max(5_000_000),
                after: z.string().max(5_000_000),
              })
              .strict(),
          )
          .max(2000),
        document: z
          .object({
            before: z.string().max(5_000_000),
            after: z.string().max(5_000_000),
          })
          .strict()
          .nullable()
          .default(null),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((thread) => JSON.stringify(thread).length <= 20_000_000, {
    message: "El hilo supera los 20 MB",
  });
const threadKeySchema = z
  .object({
    workspaceRoot: z.string().min(1).max(4096),
    docKey: z.string().min(1).max(4096),
  })
  .strict();
const saveThreadSchema = z
  .object({
    workspaceRoot: z.string().min(1).max(4096),
    docKey: z.string().min(1).max(4096),
    thread: threadSchema,
  })
  .strict();
const applyProposalSchema = z
  .object({
    relPath: z.string().min(1).max(4096),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
    prompt: z.string().max(MAX_DOCUMENT_BYTES),
    blocks: z
      .array(
        z
          .object({
            key: z.string().min(1).max(512),
            before: z.string().max(MAX_DOCUMENT_BYTES),
            after: z.string().max(MAX_DOCUMENT_BYTES),
          })
          .strict(),
      )
      .min(1)
      .max(2000),
  })
  .strict();
const applyDocumentSchema = z
  .object({
    relPath: z.string().min(1).max(4096),
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
    prompt: z.string().max(MAX_DOCUMENT_BYTES),
    content: z.string().max(MAX_DOCUMENT_BYTES),
  })
  .strict();
const oauthAttemptSchema = z
  .object({
    attemptID: z.string().min(1).max(512),
  })
  .strict();
const pendingKeySchema = z.string().min(1).max(4096);
const pendingEntriesSchema = z
  .array(
    z
      .object({ key: z.string().min(1).max(512), anchorKey: z.string().max(4096).nullable() })
      .strict(),
  )
  .max(500);

function isAllowedExternalUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
  } catch {
    return false;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

function windowOf(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

type Handler<Result> = (event: IpcMainInvokeEvent, args: unknown[]) => Promise<Result> | Result;

/** Registra un handler que jamás propaga stack traces al renderer. */
function register<Result>(channel: string, handler: Handler<Result>): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      return await handler(event, args);
    } catch (error) {
      logError(`IPC ${channel} falló`, { message: messageOf(error) });
      throw new Error(messageOf(error));
    }
  });
}

export function registerIpc(): void {
  register(CHANNELS.languageGet, async (event, args) => {
    const { relPath } = readSchema.parse(args[0]);
    const root = workspaceService.getActiveRoot(windowOf(event));
    if (!root) throw new Error("No hay carpeta abierta");
    return languageService.getLanguageSet(root, relPath);
  });
  register(CHANNELS.languageCreate, async (event, args) => {
    const input = languageMutationSchema.parse(args[0]);
    const root = workspaceService.getActiveRoot(windowOf(event));
    if (!root) return { ok: false as const, error: "No hay carpeta abierta" };
    return languageService.createLanguage(root, input.relPath, input.lang);
  });
  register(CHANNELS.languageSync, async (event, args) => {
    const input = languageMutationSchema.parse(args[0]);
    const root = workspaceService.getActiveRoot(windowOf(event));
    if (!root) return { ok: false as const, error: "No hay carpeta abierta" };
    const result = await languageService.syncLanguage(root, input.relPath, input.lang);
    const win = windowOf(event);
    if (result.ok && win && !win.isDestroyed())
      win.webContents.send(CHANNELS.eventFileSaved, { path: result.path, hash: result.hash });
    return result;
  });
  register(CHANNELS.openFolder, async (event) => {
    return workspaceService.openWorkspaceFolder(windowOf(event));
  });

  register(CHANNELS.getTree, async (event) => {
    return workspaceService.getTree(windowOf(event));
  });

  register(CHANNELS.readDocument, async (event, args) => {
    const { relPath } = readSchema.parse(args[0]);
    return workspaceService.readDocument(windowOf(event), relPath);
  });

  register(CHANNELS.writeDocument, async (event, args) => {
    const { relPath, content } = writeSchema.parse(args[0]);
    try {
      return await workspaceService.writeDocument(windowOf(event), relPath, content);
    } catch (error) {
      logError("writeDocument falló", { relPath, message: messageOf(error) });
      return { ok: false as const, error: messageOf(error) };
    }
  });

  register(CHANNELS.saveAs, async (event, args) => {
    const { content, sourceDocKey, resetMetadata } = saveAsSchema.parse(args[0]);
    return workspaceService.saveDocumentAs(windowOf(event), content, sourceDocKey, resetMetadata);
  });

  register(CHANNELS.reveal, async (event, args) => {
    const { relPath } = targetSchema.parse(args[0]);
    return workspaceService.revealPath(windowOf(event), relPath);
  });

  register(CHANNELS.copyPath, async (event, args) => {
    const { relPath } = targetSchema.parse(args[0]);
    return workspaceService.copyPath(windowOf(event), relPath);
  });

  register(CHANNELS.openRecent, async (event) => {
    return workspaceService.openRecent(windowOf(event));
  });

  register(CHANNELS.copyText, async (_event, args) => {
    const text = copyTextSchema.parse(args[0]);
    try {
      clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  });

  register(CHANNELS.openExternal, async (_event, args) => {
    const url = externalSchema.safeParse(args[0]);
    if (!url.success) return false;
    try {
      await shell.openExternal(url.data);
      return true;
    } catch {
      return false;
    }
  });

  register(CHANNELS.settingsGet, async () => settingsService.readSettings());

  register(CHANNELS.settingsPatch, async (_event, args) => {
    const partial = settingsPatchSchema.parse(args[0] ?? {});
    return settingsService.patchSettings(partial);
  });

  register(CHANNELS.agentStatus, async () => agentService.getStatus());

  register(CHANNELS.agentGetStatus, async () => agentService.getStatus());

  register(CHANNELS.agentConnect, async (_event, args) => {
    const mode = agentModeSchema.optional().parse(args[0]);
    return agentService.connect(mode);
  });

  register(CHANNELS.agentDisconnect, async () => {
    await agentService.disconnect();
  });

  register(CHANNELS.agentListCatalog, async () => agentService.listCatalog());

  register(CHANNELS.agentCreateSession, async (event, args) => {
    const input = createSessionSchema.parse(args[0]);
    // La sesión vive en el workspace activo del proceso principal: el renderer
    // no puede apuntar a otro directorio.
    const root = workspaceService.getActiveRoot(windowOf(event));
    return agentService.createSession(root === null ? input : { ...input, directory: root });
  });

  register(CHANNELS.agentPrompt, async (_event, args) => {
    const input = promptSchema.parse(args[0]);
    await agentService.prompt(input);
  });

  register(CHANNELS.agentInterrupt, async (_event, args) => {
    const input = sessionSchema.parse(args[0]);
    await agentService.interrupt(input);
  });

  register(CHANNELS.agentRegisterSession, async (_event, args) => {
    const input = sessionSchema.parse(args[0]);
    agentService.registerSession(input);
  });

  register(CHANNELS.agentLoadThread, async (_event, args) => {
    const { workspaceRoot, docKey } = threadKeySchema.parse(args[0]);
    return threadsService.loadThread(workspaceRoot, docKey);
  });

  register(CHANNELS.agentSaveThread, async (_event, args) => {
    const { workspaceRoot, docKey, thread } = saveThreadSchema.parse(args[0]);
    await threadsService.saveThread(workspaceRoot, docKey, thread);
    try {
      await metadataService.syncSidecarThread(workspaceRoot, docKey);
    } catch {
      /* el sidecar no debe romper el guardado principal */
    }
  });

  register(CHANNELS.agentApplyProposal, async (event, args) => {
    const input = applyProposalSchema.parse(args[0]);
    const result = await threadsService.applyProposal(
      input,
      workspaceService.getActiveRoot(windowOf(event)),
    );
    if (result.ok) {
      workspaceService.registerOwnWrite(windowOf(event), input.relPath, result.hash);
    }
    return result;
  });

  register(CHANNELS.agentApplyDocument, async (event, args) => {
    const input = applyDocumentSchema.parse(args[0]);
    const result = await threadsService.applyDocumentProposal(
      input,
      workspaceService.getActiveRoot(windowOf(event)),
    );
    if (result.ok) {
      workspaceService.registerOwnWrite(windowOf(event), input.relPath, result.hash);
    }
    return result;
  });

  register(CHANNELS.agentRefresh, async () => agentService.refresh());

  register(CHANNELS.agentGetAccount, async () => agentService.getAccount());

  register(CHANNELS.agentOauthStart, async () => agentService.oauthStart());

  register(CHANNELS.agentOauthStatus, async (_event, args) => {
    const { attemptID } = oauthAttemptSchema.parse(args[0]);
    return agentService.oauthStatus({ attemptID });
  });

  register(CHANNELS.agentOauthCancel, async (_event, args) => {
    const { attemptID } = oauthAttemptSchema.parse(args[0]);
    await agentService.oauthCancel({ attemptID });
  });

  register(CHANNELS.pendingLoad, async (event, args) => {
    const docKey = pendingKeySchema.parse(args[0]);
    return pendingService.loadPending(
      workspaceService.getActiveRoot(windowOf(event)) ?? "__untitled__",
      docKey,
    );
  });
  register(CHANNELS.pendingSave, async (event, args) => {
    const input = z
      .object({ docKey: pendingKeySchema, entries: pendingEntriesSchema })
      .strict()
      .parse(args[0]);
    const root = workspaceService.getActiveRoot(windowOf(event)) ?? "__untitled__";
    await pendingService.savePending(root, input.docKey, input.entries);
    try {
      await metadataService.syncSidecarPending(root, input.docKey);
    } catch {
      /* best effort */
    }
  });
  const annotationKeySchema = z.string().min(1).max(4096);
  register(CHANNELS.annotationsLoad, async (event, args) =>
    annotationsService.loadAnnotations(
      workspaceService.getActiveRoot(windowOf(event)) ?? "__untitled__",
      annotationKeySchema.parse(args[0]),
    ),
  );
  register(CHANNELS.annotationsSaveComments, async (event, args) => {
    const input = z
      .object({ docKey: annotationKeySchema, comments: z.array(blockCommentSchema).max(5000) })
      .strict()
      .parse(args[0]);
    const root = workspaceService.getActiveRoot(windowOf(event)) ?? "__untitled__";
    await annotationsService.setComments(root, input.docKey, input.comments);
    try {
      await metadataService.syncSidecarAnnotations(root, input.docKey);
    } catch {
      /* best effort */
    }
  });
  register(CHANNELS.annotationsSaveCritiques, async (event, args) => {
    const input = z
      .object({ docKey: annotationKeySchema, critiques: z.array(storedCritiqueSchema).max(5000) })
      .strict()
      .parse(args[0]);
    const root = workspaceService.getActiveRoot(windowOf(event)) ?? "__untitled__";
    await annotationsService.setCritiques(root, input.docKey, input.critiques);
    try {
      await metadataService.syncSidecarAnnotations(root, input.docKey);
    } catch {
      /* best effort */
    }
  });
  register(CHANNELS.annotationsSaveBlockVersions, async (event, args) => {
    const input = z
      .object({ docKey: annotationKeySchema, versions: z.array(blockVersionSchema).max(10000) })
      .strict()
      .parse(args[0]);
    const root = workspaceService.getActiveRoot(windowOf(event)) ?? "__untitled__";
    await annotationsService.setBlockVersions(root, input.docKey, input.versions);
    try {
      await metadataService.syncSidecarAnnotations(root, input.docKey);
    } catch {
      /* best effort */
    }
  });
  register(CHANNELS.annotationsAppendHistory, async (event, args) => {
    const input = z
      .object({ docKey: annotationKeySchema, event: historyEventSchema })
      .strict()
      .parse(args[0]);
    await annotationsService.appendHistory(
      workspaceService.getActiveRoot(windowOf(event)) ?? "__untitled__",
      input.docKey,
      input.event,
    );
  });

  const metadataKeySchema = z
    .object({
      relPath: relPathSchema.nullable(),
      docKey: z.string().min(1).max(4096),
    })
    .strict();
  register(CHANNELS.metadataExport, async (event, args) => {
    const input = metadataKeySchema.parse(args[0]);
    return metadataService.exportMetadata(
      windowOf(event),
      workspaceService.getActiveRoot(windowOf(event)),
      input,
    );
  });
  register(CHANNELS.metadataPickImport, async (event, args) => {
    const input = metadataKeySchema.parse(args[0]);
    return metadataService.pickMetadataImport(
      windowOf(event),
      workspaceService.getActiveRoot(windowOf(event)),
      input,
    );
  });
  register(CHANNELS.metadataApplyImport, async (event, args) => {
    const inputSchema = z
      .object({
        relPath: relPathSchema.nullable(),
        docKey: z.string().min(1).max(4096),
        bundle: metadataService.metadataBundleSchema,
        confirmed: z.boolean(),
        resolution: z.enum(["local", "imported"]),
      })
      .strict();
    const raw = args[0];
    if (Buffer.byteLength(JSON.stringify(raw), "utf8") > metadataService.MAX_METADATA_BYTES) {
      throw new Error("El metadato supera 20 MB; reduzca el archivo.");
    }
    return metadataService.applyMetadataImport(
      workspaceService.getActiveRoot(windowOf(event)),
      inputSchema.parse(raw),
    );
  });
}
