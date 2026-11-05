import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { app, type BrowserWindow, clipboard, dialog, shell } from "electron";
import { CHANNELS } from "../ipc";
import {
  MAX_DOCUMENT_BYTES,
  projectedDocumentBytes,
  readTextFile,
  sha256,
  writeFileAtomic,
} from "../lib/atomic";
import { logInfo, logWarn } from "../lib/logger";
import {
  assertInsideRoot,
  EXCLUDED_DIRS,
  isMarkdownFile,
  resolveWorkspacePath,
} from "../lib/paths";
import { buildTree, type TreeInput } from "../lib/tree";
import type {
  DocumentPayload,
  LanguageSet,
  OpenFolderResult,
  SaveAsResult,
  TreeNode,
  WriteDocumentResult,
} from "../types";
import { clearAnnotations } from "./annotations";
import { getLanguageSet } from "./languages";
import { migrateMetadataOnSaveAs, seedAppDataFromSidecar, writeDocumentSidecar } from "./metadata";
import { savePending } from "./pending";
import { patchSettings, readSettings } from "./settings";
import { clearThread } from "./threads";

const DEBOUNCE_MS = 250;
const OWN_WRITE_TTL_MS = 5000;

interface OwnWrite {
  hash: string;
  at: number;
}

interface WorkspaceState {
  root: string | null;
  watcher: fs.FSWatcher | null;
  debounce: NodeJS.Timeout | null;
  pending: Set<string>;
  ownWrites: Map<string, OwnWrite>;
}

const states = new Map<number, WorkspaceState>();

export function registerOwnWrite(win: BrowserWindow | null, relPath: string, hash?: string): void {
  const state = stateFor(win);
  if (!state.root) return;
  const abs = resolveWorkspacePath(state.root, relPath);
  const actualHash = hash ?? sha256(readTextFile(abs).content);
  state.ownWrites.set(abs, { hash: actualHash, at: Date.now() });
}

/** Registra una escritura propia para todas las ventanas que contengan la ruta. */
export function registerOwnWritePath(abs: string, hash: string): void {
  for (const state of states.values()) {
    if (state.root && isInside(state.root, abs)) {
      state.ownWrites.set(abs, { hash, at: Date.now() });
    }
  }
}

function stateFor(win: BrowserWindow | null): WorkspaceState {
  const id = win?.id ?? 0;
  const existing = states.get(id);
  if (existing) return existing;
  const created: WorkspaceState = {
    root: null,
    watcher: null,
    debounce: null,
    pending: new Set(),
    ownWrites: new Map(),
  };
  states.set(id, created);
  return created;
}

function stopWatcher(state: WorkspaceState): void {
  if (state.debounce) {
    clearTimeout(state.debounce);
    state.debounce = null;
  }
  state.pending.clear();
  if (state.watcher) {
    state.watcher.close();
    state.watcher = null;
  }
}

/** Cierra todos los watchers (al cambiar de raíz o al salir de la app). */
export function closeAllWatchers(): void {
  for (const state of states.values()) stopWatcher(state);
}

async function collectEntries(root: string, rel: string, out: TreeInput[]): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(path.join(root, rel), { withFileTypes: true });
  } catch (error) {
    logWarn("no se pudo leer una subcarpeta", {
      rel: rel || ".",
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      out.push({ path: relPath, type: "dir" });
      await collectEntries(root, relPath, out);
      continue;
    }
    if (entry.isFile() && isMarkdownFile(entry.name)) {
      out.push({ path: relPath, type: "file" });
    }
  }
}

/** Recorre la carpeta y devuelve el árbol filtrado y ordenado. */
export async function scanTree(root: string): Promise<TreeNode[]> {
  const entries: TreeInput[] = [];
  await collectEntries(root, "", entries);
  const tree = buildTree(entries);
  const languageSets = new Map<string, LanguageSet>();
  const annotate = async (nodes: TreeNode[]): Promise<void> => {
    for (const node of nodes) {
      if (node.type === "dir") {
        await annotate(node.children ?? []);
        continue;
      }
      if (!node.language || !node.canonicalPath) continue;
      try {
        let set = languageSets.get(node.canonicalPath);
        if (!set) {
          set = await getLanguageSet(root, node.canonicalPath);
          languageSets.set(node.canonicalPath, set);
        }
        node.languageStale = set.translations[node.language]?.stale === true;
      } catch {
        // La lectura de estado de idioma no debe impedir el escaneo del árbol.
      }
    }
  };
  await annotate(tree);
  return tree;
}

export function isExcludedEventPath(filename: string): boolean {
  const segments = filename.split(/[\\/]/).filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment.startsWith(".") || EXCLUDED_DIRS.has(segment))) {
    return true;
  }
  return segments.some(
    (segment) =>
      segment.includes(".nrvn-tmp-") ||
      segment.endsWith(".nrvn") ||
      segment.endsWith(".nrvn.bak") ||
      segment.includes(".nrvn.bak-") ||
      segment.includes(".nrvn.corrupt-"),
  );
}

async function flushChanges(win: BrowserWindow | null, state: WorkspaceState): Promise<void> {
  const names = [...state.pending];
  state.pending.clear();
  const changes = names.filter((name) => !isExcludedEventPath(name));
  const external: { path: string; hash: string }[] = [];
  let changed = false;

  if (changes.length === 0) return;
  {
    const now = Date.now();
    for (const name of changes) {
      const abs = path.resolve(state.root ?? "", name);
      const own = state.ownWrites.get(abs);
      let currentHash: string | null = null;
      try {
        currentHash = sha256(readTextFile(abs).content);
      } catch {
        currentHash = null;
      }
      if (own && now - own.at <= OWN_WRITE_TTL_MS && currentHash === own.hash) {
        state.ownWrites.delete(abs);
        continue;
      }
      changed = true;
      if (currentHash !== null) {
        external.push({ path: name.split(/[\\/]/).join("/"), hash: currentHash });
      }
    }
    if (!changed) return;
  }

  if (!state.root || !win || win.isDestroyed()) return;
  for (const change of external) {
    win.webContents.send(CHANNELS.eventFileSaved, change);
  }
  const tree = await scanTree(state.root);
  win.webContents.send(CHANNELS.eventTreeChanged, tree);
}

function startWatcher(win: BrowserWindow | null, state: WorkspaceState): void {
  stopWatcher(state);
  if (!state.root) return;
  const root = state.root;
  try {
    state.watcher = fs.watch(root, { recursive: true }, (_eventType, filename) => {
      state.pending.add(filename ?? "");
      if (state.debounce) clearTimeout(state.debounce);
      state.debounce = setTimeout(() => {
        state.debounce = null;
        void flushChanges(win, state).catch((error: unknown) => {
          logWarn("fallo al refrescar el árbol", {
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }, DEBOUNCE_MS);
    });
  } catch (error) {
    logWarn("no se pudo vigilar la carpeta", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Diálogo nativo de apertura de carpeta; guarda la raíz y arranca el watcher. */
export async function openWorkspaceFolder(win: BrowserWindow | null): Promise<OpenFolderResult> {
  const options: Electron.OpenDialogOptions = {
    properties: ["openDirectory", "createDirectory"],
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  const root = path.resolve(result.filePaths[0]);
  const stat = await fsp.stat(root);
  if (!stat.isDirectory()) {
    throw new Error("La ruta seleccionada no es una carpeta");
  }
  const state = stateFor(win);
  stopWatcher(state);
  state.root = root;
  state.ownWrites.clear();
  startWatcher(win, state);
  persistRecent(root);
  logInfo("carpeta abierta", { root });
  return { canceled: false, root, name: path.basename(root) };
}

/** Árbol actual de la carpeta abierta (vacío si no hay ninguna). */
export async function getTree(win: BrowserWindow | null): Promise<TreeNode[]> {
  const state = stateFor(win);
  if (!state.root) return [];
  return scanTree(state.root);
}

/** Raíz del workspace activo para una ventana (o `null` si no hay carpeta). */
export function getActiveRoot(win: BrowserWindow | null): string | null {
  return stateFor(win).root;
}

/** Raíz del workspace activo exigida: lanza si no hay carpeta abierta. */
function requireRoot(state: WorkspaceState): string {
  if (!state.root) throw new Error("No hay carpeta abierta");
  return state.root;
}

/** Lee un documento del workspace validando que no escape de la raíz. */
export async function readDocument(
  win: BrowserWindow | null,
  relPath: string,
): Promise<DocumentPayload> {
  const root = requireRoot(stateFor(win));
  const abs = resolveWorkspacePath(root, relPath);
  assertInsideRoot(root, abs);
  const file = readTextFile(abs);
  const stat = await fsp.stat(abs);
  const metadata = await seedAppDataFromSidecar(root, relPath);
  return {
    path: relPath,
    content: file.content,
    eol: file.eol,
    bom: file.bom,
    mtimeMs: file.mtimeMs,
    size: stat.size,
    ...(metadata.warning ? { metadataWarning: metadata.warning } : {}),
  };
}

function backupsRoot(root: string): string {
  const hash = createHash("sha1").update(root).digest("hex");
  return path.join(app.getPath("userData"), "backups", hash);
}

/**
 * Guarda un documento con escritura atómica, backup previo y evento `file-saved`.
 * El hash propio se registra para ignorar el eco del watcher.
 */
export async function writeDocument(
  win: BrowserWindow | null,
  relPath: string,
  content: string,
): Promise<WriteDocumentResult> {
  if (Buffer.byteLength(content, "utf8") > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: "El documento supera el límite de 5 MB; reduzca su contenido antes de guardar.",
    };
  }
  const state = stateFor(win);
  const root = requireRoot(state);
  const abs = resolveWorkspacePath(root, relPath);
  assertInsideRoot(root, abs);

  let existing: ReturnType<typeof readTextFile> | null = null;
  try {
    existing = readTextFile(abs);
  } catch {
    existing = null;
  }
  const bytes = projectedDocumentBytes(content, existing?.eol ?? "lf", existing?.bom ?? false);
  if (bytes > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      error:
        "El documento supera el límite de 5 MB al guardarse; reduzca su contenido antes de guardar.",
    };
  }

  writeFileAtomic(abs, content, { backupDir: backupsRoot(root) });

  const file = readTextFile(abs);
  state.ownWrites.set(abs, { hash: sha256(file.content), at: Date.now() });

  const stat = await fsp.stat(abs);
  const metadataHash = sha256(file.content);
  const hash = metadataHash;
  const metadata = await writeDocumentSidecar(root, relPath, metadataHash);
  if (win && !win.isDestroyed()) {
    win.webContents.send(CHANNELS.eventFileSaved, { path: relPath, hash });
  }
  return { ok: true, mtimeMs: stat.mtimeMs, hash, ...metadata };
}

/** Persiste la carpeta reciente sin romper el flujo si el guardado falla. */
function persistRecent(root: string): void {
  try {
    patchSettings({ recentWorkspace: root });
  } catch (error) {
    logWarn("no se pudo guardar la carpeta reciente", {
      root,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** `true` si `abs` cae dentro de `root` (o es la propia raíz). */
function isInside(root: string, abs: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(abs));
  if (rel === "") return true;
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/** Resuelve la ruta del documento activo (o la raíz) validando la raíz. */
function resolveTarget(state: WorkspaceState, relPath: string | null): string | null {
  if (!state.root) return null;
  if (relPath === null) return state.root;
  const abs = resolveWorkspacePath(state.root, relPath);
  assertInsideRoot(state.root, abs);
  return abs;
}

/**
 * «Guardar como…»: diálogo nativo, escritura atómica con backup y adopción de
 * la carpeta destino como workspace cuando el archivo cae fuera de la raíz.
 */
export async function saveDocumentAs(
  win: BrowserWindow | null,
  content: string,
  sourceDocKey?: string,
  resetMetadata?: boolean,
): Promise<SaveAsResult> {
  if (Buffer.byteLength(content, "utf8") > MAX_DOCUMENT_BYTES) {
    throw new Error(
      "El documento supera el límite de 5 MB; reduzca su contenido antes de guardar.",
    );
  }
  const state = stateFor(win);
  const previousRoot = state.root ?? "__untitled__";
  const defaultDir = state.root ?? app.getPath("documents");
  const options: Electron.SaveDialogOptions = {
    defaultPath: path.join(defaultDir, "sin-titulo.md"),
    filters: [{ name: "Markdown", extensions: ["md", "mdx"] }],
    properties: ["createDirectory", "showOverwriteConfirmation"],
  };
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { canceled: true };

  let abs = path.resolve(result.filePath);
  if (!isMarkdownFile(abs)) abs = `${abs}.md`;

  let root = state.root;
  if (!root || !isInside(root, abs)) {
    root = path.dirname(abs);
    stopWatcher(state);
    state.root = root;
    state.ownWrites.clear();
    startWatcher(win, state);
  }

  const relPath = path.relative(root, abs).split(path.sep).join("/");
  let existing: ReturnType<typeof readTextFile> | null = null;
  try {
    existing = readTextFile(abs);
  } catch {
    existing = null;
  }
  if (
    projectedDocumentBytes(content, existing?.eol ?? "lf", existing?.bom ?? false) >
    MAX_DOCUMENT_BYTES
  ) {
    throw new Error(
      "El documento supera el límite de 5 MB al guardarse; reduzca su contenido antes de guardar.",
    );
  }
  const sameFile = Boolean(
    sourceDocKey &&
      state.root &&
      previousRoot !== "__untitled__" &&
      path.resolve(previousRoot, sourceDocKey) === abs,
  );
  if (resetMetadata === true && !sameFile) {
    try {
      await fsp.rename(`${abs}.nrvn`, `${abs}.nrvn.bak-${Date.now()}`);
    } catch {
      // No sidecar previo para apartar; Save As continúa normalmente.
    }
    await clearAnnotations(root, relPath);
    await clearThread(root, relPath);
    await savePending(root, relPath, []);
  }
  writeFileAtomic(abs, content, { backupDir: backupsRoot(root) });
  const file = readTextFile(abs);
  state.ownWrites.set(abs, { hash: sha256(file.content), at: Date.now() });

  persistRecent(root);
  const stat = await fsp.stat(abs);
  const hash = sha256(file.content);
  const metadataHash = hash;
  const metadata =
    sourceDocKey && resetMetadata !== true && !sameFile
      ? await migrateMetadataOnSaveAs(previousRoot, sourceDocKey, root, abs, relPath, metadataHash)
      : {};
  logInfo("documento guardado como", { root, relPath });
  return {
    canceled: false,
    root,
    name: path.basename(root),
    relPath,
    mtimeMs: stat.mtimeMs,
    hash,
    ...metadata,
  };
}

/** Revela en Finder el documento `relPath` o la raíz (`null`). */
export function revealPath(win: BrowserWindow | null, relPath: string | null): boolean {
  const abs = resolveTarget(stateFor(win), relPath);
  if (abs === null || !fs.existsSync(abs)) return false;
  shell.showItemInFolder(abs);
  return true;
}

/** Copia al portapapeles la ruta absoluta del documento `relPath` o la raíz. */
export function copyPath(win: BrowserWindow | null, relPath: string | null): boolean {
  const abs = resolveTarget(stateFor(win), relPath);
  if (abs === null) return false;
  clipboard.writeText(abs);
  return true;
}

/** Reabre la última carpeta persistida en settings, si sigue existiendo. */
export async function openRecent(win: BrowserWindow | null): Promise<OpenFolderResult> {
  const recent = readSettings().recentWorkspace;
  if (!recent) return { canceled: true };
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(recent);
  } catch {
    return { canceled: true };
  }
  if (!stat.isDirectory()) return { canceled: true };

  const root = path.resolve(recent);
  const state = stateFor(win);
  stopWatcher(state);
  state.root = root;
  state.ownWrites.clear();
  startWatcher(win, state);
  logInfo("carpeta reciente reabierta", { root });
  return { canceled: false, root, name: path.basename(root) };
}
