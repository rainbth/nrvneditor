import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { app, type BrowserWindow, dialog } from "electron";
import { z } from "zod";
import { readTextFile, sha256, writeFileAtomic } from "../lib/atomic";
import { logWarn } from "../lib/logger";
import { resolveWorkspacePath } from "../lib/paths";
import type {
  AgentThread,
  BlockVersion,
  MetadataApplyInput,
  MetadataApplyResult,
  MetadataBundle,
  MetadataExportResult,
  MetadataPickResult,
  MetadataSummary,
  PendingEntry,
} from "../types";
import { documentAnnotationsSchema } from "../types";
import { clearAnnotations, copyAnnotations, loadAnnotations, saveAnnotations } from "./annotations";

function pruneImportedVersions(versions: BlockVersion[]): BlockVersion[] {
  const counts = new Map<string, number>();
  return [...versions]
    .reverse()
    .filter((version) => {
      const count = (counts.get(version.blockKey) ?? 0) + 1;
      counts.set(version.blockKey, count);
      return count <= 10;
    })
    .reverse();
}

import { loadPending, savePending } from "./pending";
import { clearThread, loadThread, saveThread } from "./threads";

export const MAX_METADATA_BYTES = 20_000_000;
const sidecarQueues = new Map<string, Promise<unknown>>();

function documentPath(root: string, relPath: string): string {
  return resolveWorkspacePath(root, relPath);
}

function queueSidecar<T>(absDoc: string, task: () => Promise<T>): Promise<T> {
  const previous = sidecarQueues.get(absDoc) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  sidecarQueues.set(absDoc, current);
  void current
    .finally(() => {
      if (sidecarQueues.get(absDoc) === current) sidecarQueues.delete(absDoc);
    })
    .catch(() => undefined);
  return current;
}

const messageSchema = z
  .object({
    id: z.string().min(1).max(512),
    role: z.enum(["user", "assistant"]),
    text: z.string().max(5_000_000),
    createdAt: z.number().finite(),
    status: z.enum(["streaming", "done", "error", "cancelled"]),
    error: z.string().max(8192).optional(),
  })
  .strict();
const proposalSchema = z
  .object({
    id: z.string().min(1).max(512),
    createdAt: z.number().finite(),
    prompt: z.string().max(5_000_000),
    kind: z.enum(["blocks", "document"]),
    source: z.enum(["chat", "review", "narrative"]).optional(),
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
      .nullable(),
  })
  .strict()
  .nullable();
const threadSchema = z
  .object({
    sessionID: z.string().min(1).max(512).nullable(),
    messages: z.array(messageSchema).max(5000),
    proposal: proposalSchema,
  })
  .strict();
const pendingEntrySchema = z
  .object({
    key: z.string().min(1).max(512),
    anchorKey: z.string().max(4096).nullable(),
  })
  .strict();

export const metadataBundleSchema = z
  .object({
    format: z.literal("nrvn.metadata"),
    version: z.literal(1),
    document: z
      .object({
        path: z.string().max(4096).nullable(),
        hash: z
          .string()
          .regex(/^[a-fA-F0-9]{64}$/)
          .nullable(),
        savedAt: z.number().finite(),
      })
      .strict(),
    app: z.object({ version: z.string() }).passthrough(),
    threads: z
      .array(
        z
          .object({
            docKey: z.string().min(1).max(4096),
            thread: threadSchema,
          })
          .strict(),
      )
      .max(5000),
    pending: z
      .array(
        z
          .object({
            docKey: z.string().min(1).max(4096),
            entries: z.array(pendingEntrySchema).max(500),
          })
          .strict(),
      )
      .max(5000),
    history: z.array(z.unknown()).max(5000),
    comments: z.array(z.unknown()).max(5000),
    critiques: z.array(z.unknown()).max(5000),
    blockVersions: z.array(z.unknown()).max(10000).default([]),
    languages: z.record(z.string(), z.unknown()),
    provenance: z.record(z.string(), z.unknown()),
  })
  .passthrough();

type Bundle = MetadataBundle;
type SidecarRead =
  | { status: "missing" }
  | { status: "ok"; bundle: Bundle }
  | { status: "error"; error: string };

function sidecarPath(absDocPath: string): string {
  return `${absDocPath}.nrvn`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

function quarantineSidecar(file: string): string {
  const corrupt = `${file}.corrupt-${Date.now()}`;
  try {
    fs.renameSync(file, corrupt);
  } catch (error) {
    logWarn("no se pudo apartar el sidecar corrupto", {
      file,
      message: errorText(error),
    });
  }
  return corrupt;
}

function emptyThread(): AgentThread {
  return { sessionID: null, messages: [], proposal: null };
}

function summary(bundle: Bundle): MetadataSummary {
  return {
    threads: bundle.threads.length,
    messages: bundle.threads.reduce((count, record) => count + record.thread.messages.length, 0),
    pending: bundle.pending.reduce((count, record) => count + record.entries.length, 0),
    history: bundle.history.length,
    comments: bundle.comments.length,
    critiques: bundle.critiques.length,
  };
}

export async function readSidecar(absDocPath: string): Promise<SidecarRead> {
  const file = sidecarPath(absDocPath);
  try {
    const stat = await fsp.stat(file);
    if (stat.size > MAX_METADATA_BYTES) {
      const corrupt = quarantineSidecar(file);
      return {
        status: "error",
        error:
          `El metadato supera 20 MB (${file}); se apartó como ${corrupt}. ` +
          "Se conserva el estado local.",
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(await fsp.readFile(file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
      const corrupt = quarantineSidecar(file);
      return {
        status: "error",
        error:
          `Metadato ilegible (${file}); se apartó como ${corrupt}. ` +
          "Se conserva el estado local.",
      };
    }
    const raw = json as Record<string, unknown>;
    if (
      !raw ||
      typeof raw !== "object" ||
      !Array.isArray(raw.threads) ||
      !Array.isArray(raw.pending)
    ) {
      return {
        status: "error",
        error:
          `Metadato inválido o versión no compatible (${file}); ` +
          "expórtelo para recuperarlo. Se conserva el estado local.",
      };
    }
    const threadRecordSchema = z
      .object({ docKey: z.string().min(1).max(4096), thread: threadSchema })
      .strict();
    const pendingRecordSchema = z
      .object({
        docKey: z.string().min(1).max(4096),
        entries: z.array(pendingEntrySchema).max(500),
      })
      .strict();
    const threads = raw.threads.filter((record) => {
      const ok = threadRecordSchema.safeParse(record).success;
      if (!ok) logWarn("registro de hilo inválido descartado del sidecar", {});
      return ok;
    });
    const pending = raw.pending.filter((record) => {
      const ok = pendingRecordSchema.safeParse(record).success;
      if (!ok) logWarn("registro pending inválido descartado del sidecar", {});
      return ok;
    });
    const parsed = metadataBundleSchema.safeParse({ ...raw, threads, pending });
    if (!parsed.success) {
      return {
        status: "error",
        error:
          `Metadato inválido o versión no compatible (${file}); ` +
          "expórtelo para recuperarlo. Se conserva el estado local.",
      };
    }
    return { status: "ok", bundle: parsed.data as Bundle };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
    return {
      status: "error",
      error:
        `No se pudo leer el metadato ${file}: ${errorText(error)}. ` +
        "Se conserva el estado local.",
    };
  }
}

/** Writes a validated portable bundle to the exact requested path. */
export async function writeBundleFile(
  absPath: string,
  bundle: Bundle,
): Promise<{ ok: true; bytes: number } | { ok: false; error: string }> {
  try {
    const parsed = metadataBundleSchema.parse(bundle);
    const json = `${JSON.stringify(parsed, null, 2)}\n`;
    const bytes = Buffer.byteLength(json);
    if (bytes > MAX_METADATA_BYTES) {
      return {
        ok: false,
        error: "El metadato supera 20 MB; reduzca su contenido antes de guardar.",
      };
    }
    if (fs.existsSync(absPath)) await fsp.copyFile(absPath, `${absPath}.bak`);
    writeFileAtomic(absPath, json, { eol: "lf", bom: false });
    return { ok: true, bytes };
  } catch (error) {
    return { ok: false, error: `No se pudo guardar el metadato: ${errorText(error)}` };
  }
}

export async function writeSidecar(
  absDocPath: string,
  bundle: Bundle,
): Promise<{ ok: true; bytes: number } | { ok: false; error: string }> {
  return writeBundleFile(sidecarPath(absDocPath), bundle);
}

export async function composeBundle(
  root: string,
  docKey: string,
  docPath: string | null,
  hash: string | null,
  base?: Bundle,
): Promise<Bundle> {
  const [thread, entries, annotations] = await Promise.all([
    loadThread(root, docKey),
    loadPending(root, docKey),
    loadAnnotations(root, docKey),
  ]);
  return {
    ...(base ?? {}),
    format: "nrvn.metadata",
    version: 1,
    document: { path: docPath, hash, savedAt: Date.now() },
    app: {
      ...(base?.app ?? {}),
      version: typeof app.getVersion === "function" ? app.getVersion() : "0.0.0",
    },
    threads: [{ docKey, thread }],
    pending: [{ docKey, entries }],
    history: annotations.exists ? annotations.history : (base?.history ?? []),
    comments: annotations.exists ? annotations.comments : (base?.comments ?? []),
    critiques: annotations.exists ? annotations.critiques : (base?.critiques ?? []),
    blockVersions: annotations.exists ? annotations.blockVersions : (base?.blockVersions ?? []),
    languages: base?.languages ?? {},
    provenance: base?.provenance ?? {},
  };
}

export async function seedAppDataFromSidecar(
  root: string,
  relPath: string,
): Promise<{ warning?: string }> {
  const abs = documentPath(root, relPath);
  const result = await readSidecar(abs);
  if (result.status === "missing") return {};
  if (result.status === "error") return { warning: result.error };

  const bundle = result.bundle;
  let warning: string | undefined;
  try {
    const content = readTextFile(abs).content;
    if (bundle.document.hash && sha256(content) !== bundle.document.hash) {
      warning =
        "Se cargó el historial guardado en el sidecar. El .md cambió desde ese guardado; " +
        "si esperabas otro historial, usa «Importar metadatos».";
    }
  } catch (error) {
    warning = `No se pudo comparar el hash del documento: ${errorText(error)}.`;
  }

  const thread = bundle.threads.find((record) => record.docKey === relPath) ?? bundle.threads[0];
  const pending = bundle.pending.find((record) => record.docKey === relPath) ?? bundle.pending[0];
  const localAnnotations = await loadAnnotations(root, relPath);
  if (!localAnnotations.exists) {
    const parsed = documentAnnotationsSchema.safeParse({
      history: bundle.history,
      comments: bundle.comments,
      critiques: bundle.critiques,
      blockVersions: bundle.blockVersions,
    });
    if (parsed.success) await saveAnnotations(root, relPath, parsed.data);
  }
  const [localThread, localPending] = await Promise.all([
    loadThread(root, relPath),
    loadPending(root, relPath),
  ]);
  if (localThread.messages.length > 0 || localThread.proposal !== null || localPending.length > 0) {
    return { ...(warning ? { warning } : {}) };
  }
  if (thread) await saveThread(root, relPath, thread.thread);
  if (pending) await savePending(root, relPath, pending.entries);
  return { warning };
}

async function updateExistingSidecar(root: string, docKey: string): Promise<void> {
  if (docKey.startsWith("untitled-") || docKey === "__untitled__") return;
  const abs = documentPath(root, docKey);
  try {
    await fsp.access(abs);
    await fsp.access(sidecarPath(abs));
  } catch {
    return;
  }
  await queueSidecar(abs, async () => {
    const prior = await readSidecar(abs);
    if (prior.status !== "ok") return;
    const content = readTextFile(abs).content;
    const bundle = await composeBundle(root, docKey, docKey, sha256(content), prior.bundle);
    const written = await writeSidecar(abs, bundle);
    if (!written.ok) throw new Error(written.error);
  });
}

export async function syncSidecarThread(root: string, docKey: string): Promise<void> {
  try {
    await updateExistingSidecar(root, docKey);
  } catch (error) {
    logWarn("no se pudo sincronizar el sidecar de conversación", {
      docKey,
      message: errorText(error),
    });
  }
}

export async function syncSidecarPending(root: string, docKey: string): Promise<void> {
  try {
    await updateExistingSidecar(root, docKey);
  } catch (error) {
    logWarn("no se pudo sincronizar el sidecar de bloques pendientes", {
      docKey,
      message: errorText(error),
    });
  }
}

export async function syncSidecarAnnotations(root: string, docKey: string): Promise<void> {
  try {
    await updateExistingSidecar(root, docKey);
  } catch (error) {
    logWarn("no se pudieron sincronizar las anotaciones del sidecar", {
      docKey,
      message: errorText(error),
    });
  }
}

export async function writeDocumentSidecar(
  root: string,
  relPath: string,
  hash: string,
): Promise<{ warning?: string }> {
  const abs = documentPath(root, relPath);
  return queueSidecar(abs, async () => {
    const prior = await readSidecar(abs);
    if (prior.status === "error" && fs.existsSync(sidecarPath(abs))) {
      return {
        warning: `El metadato existente está corrupto; no se sobrescribe. ${prior.error ?? ""}`,
      };
    }
    const bundle = await composeBundle(
      root,
      relPath,
      relPath,
      hash,
      prior.status === "ok" ? prior.bundle : undefined,
    );
    const written = await writeSidecar(abs, bundle);
    return written.ok ? {} : { warning: written.error };
  });
}

export async function migrateMetadataOnSaveAs(
  sourceRoot: string,
  sourceDocKey: string | null | undefined,
  destRoot: string,
  absPath: string,
  relPath: string,
  hash: string,
): Promise<{ warning?: string }> {
  if (!sourceDocKey || sourceDocKey === relPath) return {};
  try {
    const bundle = await composeBundle(sourceRoot, sourceDocKey, relPath, hash);
    bundle.threads = [{ docKey: relPath, thread: bundle.threads[0].thread }];
    bundle.pending = [{ docKey: relPath, entries: bundle.pending[0].entries }];
    const written = await writeSidecar(absPath, bundle);
    if (!written.ok) return { warning: written.error };
    await clearAnnotations(destRoot, relPath);
    await clearThread(destRoot, relPath);
    await savePending(destRoot, relPath, []);
    const sourceAnnotations = await loadAnnotations(sourceRoot, sourceDocKey);
    const copiedAnnotations = await copyAnnotations(sourceRoot, sourceDocKey, destRoot, relPath);
    if (copiedAnnotations || !sourceAnnotations.exists) {
      await clearAnnotations(sourceRoot, sourceDocKey);
      await clearThread(sourceRoot, sourceDocKey);
      await savePending(sourceRoot, sourceDocKey, []);
    }
    return {};
  } catch (error) {
    return { warning: `No se pudieron migrar los metadatos: ${errorText(error)}` };
  }
}

export async function exportMetadata(
  win: BrowserWindow | null,
  root: string | null,
  input: { relPath: string | null; docKey: string },
): Promise<MetadataExportResult> {
  if (input.relPath && (!root || !fs.existsSync(documentPath(root, input.relPath)))) {
    throw new Error("Guarde el documento antes de exportar sus metadatos.");
  }
  const absDoc = input.relPath && root ? documentPath(root, input.relPath) : null;
  const hash = absDoc ? sha256(readTextFile(absDoc).content) : null;
  const prior = absDoc ? await readSidecar(absDoc) : null;
  const bundle = await composeBundle(
    root ?? "__untitled__",
    input.relPath ?? input.docKey,
    input.relPath,
    hash,
    prior?.status === "ok" ? prior.bundle : undefined,
  );
  const name = absDoc ? `${path.basename(absDoc)}.nrvn` : "nrvn-metadata.nrvn";
  const options: Electron.SaveDialogOptions = {
    defaultPath: path.join(app.getPath("documents"), name),
    filters: [{ name: "Metadatos nrvn", extensions: ["nrvn"] }],
    properties: ["showOverwriteConfirmation"],
  };
  const privacyOptions: Electron.MessageBoxOptions = {
    type: "info",
    buttons: ["Continuar", "Cancelar"],
    cancelId: 1,
    defaultId: 0,
    message: "Exportar metadatos",
    detail:
      "El archivo .nrvn incluye el historial y puede contener el texto de tus conversaciones. " +
      "No se modifica el documento .md.",
  };
  const privacy = win
    ? await dialog.showMessageBox(win, privacyOptions)
    : await dialog.showMessageBox(privacyOptions);
  if (privacy.response !== 0) return { canceled: true };
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { canceled: true };

  const outputPath = result.filePath.endsWith(".nrvn")
    ? result.filePath
    : `${result.filePath}.nrvn`;
  const written = await writeBundleFile(outputPath, bundle);
  if (!written.ok) throw new Error(written.error);
  return { canceled: false, path: outputPath, bytes: written.bytes };
}

export async function pickMetadataImport(
  win: BrowserWindow | null,
  root: string | null,
  input: { relPath: string | null; docKey: string },
): Promise<MetadataPickResult> {
  const options: Electron.OpenDialogOptions = {
    properties: ["openFile"],
    filters: [{ name: "Metadatos nrvn", extensions: ["nrvn"] }],
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return { canceled: true };

  const sourcePath = result.filePaths[0];
  const stat = await fsp.stat(sourcePath);
  if (stat.size > MAX_METADATA_BYTES) {
    throw new Error("El archivo supera 20 MB; seleccione un metadato más pequeño.");
  }
  let bundle: Bundle;
  try {
    bundle = metadataBundleSchema.parse(
      JSON.parse(await fsp.readFile(sourcePath, "utf8")),
    ) as Bundle;
  } catch (error) {
    logWarn("archivo de metadatos inválido", { message: errorText(error) });
    throw new Error(
      "El archivo no es un metadato nrvn v1 válido. Comprueba que sea un .nrvn exportado por nrvn.",
    );
  }

  const key = input.relPath ?? input.docKey;
  const abs = root && input.relPath ? documentPath(root, input.relPath) : null;
  const localHash = abs && fs.existsSync(abs) ? sha256(readTextFile(abs).content) : null;
  const prior = abs ? await readSidecar(abs) : null;
  const local = await composeBundle(
    root ?? "__untitled__",
    key,
    input.relPath,
    localHash,
    prior?.status === "ok" ? prior.bundle : undefined,
  );
  const hasExisting =
    Boolean(abs && fs.existsSync(sidecarPath(abs))) ||
    local.threads.some((record) => record.thread.messages.length > 0) ||
    local.pending.some((record) => record.entries.length > 0) ||
    (await loadAnnotations(root ?? "__untitled__", key)).exists;
  const importedHash = bundle.document.hash;
  return {
    canceled: false,
    sourcePath,
    bundle,
    summary: summary(bundle),
    hasExisting,
    hashConflict: Boolean(localHash && importedHash && localHash !== importedHash),
    localHash,
    importedHash,
  };
}

function mergeRecords(local: unknown[], imported: unknown[]): unknown[] {
  const merged = [...local];
  const keyOf = (value: unknown): string => {
    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { id?: unknown }).id === "string"
    ) {
      return `id:${(value as { id: string }).id}`;
    }
    return `json:${JSON.stringify(value)}`;
  };
  const keys = new Set(merged.map(keyOf));
  for (const value of imported) {
    const key = keyOf(value);
    if (!keys.has(key)) {
      keys.add(key);
      merged.push(value);
    }
  }
  return merged;
}

export async function applyMetadataImport(
  root: string | null,
  input: MetadataApplyInput,
): Promise<MetadataApplyResult> {
  try {
    if (Buffer.byteLength(JSON.stringify(input.bundle), "utf8") > MAX_METADATA_BYTES) {
      return { ok: false, error: "El metadato supera 20 MB; reduzca el archivo." };
    }
    const imported = metadataBundleSchema.parse(input.bundle) as Bundle;
    const key = input.relPath ?? input.docKey;
    if (input.relPath && !root) {
      return { ok: false, error: "No hay carpeta abierta para este documento." };
    }
    const workspace = root ?? "__untitled__";
    const abs = root && input.relPath ? documentPath(root, input.relPath) : null;
    const localHash = abs && fs.existsSync(abs) ? sha256(readTextFile(abs).content) : null;
    const prior = abs ? await readSidecar(abs) : null;
    if (prior?.status === "error")
      return {
        ok: false,
        error: `El metadato existente está corrupto; no se sobrescribe. ${prior.error}`,
      };
    const local = await composeBundle(
      workspace,
      key,
      input.relPath,
      localHash,
      prior?.status === "ok" ? prior.bundle : undefined,
    );
    const annotationsExist = (await loadAnnotations(workspace, key)).exists;
    const existing =
      local.threads.some((record) => record.thread.messages.length > 0) ||
      local.pending.some((record) => record.entries.length > 0) ||
      annotationsExist ||
      Boolean(abs && fs.existsSync(sidecarPath(abs)));
    if (existing && !input.confirmed) {
      return {
        ok: false,
        needsConfirmation: true,
        error: "Ya existen metadatos locales. Confirme la combinación para continuar.",
      };
    }

    const importedThread =
      imported.threads.find((record) => record.docKey === imported.document.path) ??
      imported.threads[0];
    const importedPending =
      imported.pending.find((record) => record.docKey === imported.document.path) ??
      imported.pending[0];
    const localThread = local.threads[0]?.thread ?? emptyThread();
    const incomingThread = importedThread?.thread ?? emptyThread();
    const preferredMessages =
      input.resolution === "imported" ? incomingThread.messages : localThread.messages;
    const secondaryMessages =
      input.resolution === "imported" ? localThread.messages : incomingThread.messages;
    const messages = [...preferredMessages];
    const messageIds = new Set(messages.map((message) => message.id));
    for (const message of secondaryMessages)
      if (!messageIds.has(message.id)) {
        messageIds.add(message.id);
        messages.push(message);
      }
    const mergedThread: AgentThread = {
      sessionID: localThread.sessionID,
      messages,
      proposal:
        input.resolution === "imported"
          ? (incomingThread.proposal ?? localThread.proposal)
          : (localThread.proposal ?? incomingThread.proposal),
    };
    const localEntries = local.pending[0]?.entries ?? [];
    const incomingEntries = importedPending?.entries ?? [];
    const preferredPending = input.resolution === "imported" ? incomingEntries : localEntries;
    const secondaryPending = input.resolution === "imported" ? localEntries : incomingEntries;
    const pendingKeys = new Set(preferredPending.map((entry) => entry.key));
    const mergedPending: PendingEntry[] = [
      ...preferredPending,
      ...secondaryPending.filter((entry) => !pendingKeys.has(entry.key)),
    ];
    const merged: Bundle = {
      ...imported,
      ...local,
      threads: [{ docKey: key, thread: mergedThread }],
      pending: [{ docKey: key, entries: mergedPending }],
      history:
        input.resolution === "imported"
          ? mergeRecords(imported.history, local.history)
          : mergeRecords(local.history, imported.history),
      comments:
        input.resolution === "imported"
          ? mergeRecords(imported.comments, local.comments)
          : mergeRecords(local.comments, imported.comments),
      critiques:
        input.resolution === "imported"
          ? mergeRecords(imported.critiques, local.critiques)
          : mergeRecords(local.critiques, imported.critiques),
      blockVersions:
        input.resolution === "imported"
          ? mergeRecords(imported.blockVersions ?? [], local.blockVersions ?? [])
          : mergeRecords(local.blockVersions ?? [], imported.blockVersions ?? []),
      languages: { ...imported.languages, ...local.languages },
      provenance: { ...imported.provenance, ...local.provenance },
      document: {
        path: input.relPath,
        hash: localHash,
        savedAt: Date.now(),
      },
    };
    const validAnnotations = {
      history: merged.history.filter(
        (value) => documentAnnotationsSchema.shape.history.element.safeParse(value).success,
      ),
      comments: merged.comments.filter(
        (value) => documentAnnotationsSchema.shape.comments.element.safeParse(value).success,
      ),
      critiques: merged.critiques.filter(
        (value) => documentAnnotationsSchema.shape.critiques.element.safeParse(value).success,
      ),
      blockVersions: pruneImportedVersions(
        (merged.blockVersions ?? []).filter(
          (value) =>
            documentAnnotationsSchema.shape.blockVersions.unwrap().element.safeParse(value).success,
        ) as BlockVersion[],
      ),
    };
    const annotationParse = documentAnnotationsSchema.safeParse(validAnnotations);
    if (abs) {
      const written = await queueSidecar(abs, () => writeSidecar(abs, merged));
      if (!written.ok) return { ok: false, error: written.error };
    }
    if (annotationParse.success) await saveAnnotations(workspace, key, annotationParse.data);
    await saveThread(workspace, key, mergedThread);
    await savePending(workspace, key, mergedPending);
    return { ok: true, summary: summary(merged) };
  } catch (error) {
    return { ok: false, error: `No se pudieron importar los metadatos: ${errorText(error)}` };
  }
}
