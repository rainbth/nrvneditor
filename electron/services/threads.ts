import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { z } from "zod";
import {
  MAX_DOCUMENT_BYTES,
  projectedDocumentBytes,
  readTextFile,
  sha256,
  writeFileAtomic,
} from "../lib/atomic";
import { logWarn } from "../lib/logger";
import { resolveWorkspacePath } from "../lib/paths";
import { applyBlockReplacements } from "../lib/replace-blocks";
import type {
  AgentThread,
  DocumentApplyInput,
  ProposalApplyInput,
  ProposalApplyResult,
} from "../types";

const MAX_THREAD_BYTES = 20_000_000;
const MAX_TEXT = 5_000_000;

const messageSchema = z
  .object({
    id: z.string().min(1).max(512),
    role: z.enum(["user", "assistant"]),
    text: z.string().max(MAX_TEXT),
    createdAt: z.number().finite(),
    status: z.enum(["streaming", "done", "error", "cancelled"]),
    error: z.string().max(8192).optional(),
  })
  .strict();

const proposalSchema = z
  .object({
    id: z.string().min(1).max(512),
    createdAt: z.number().finite(),
    prompt: z.string().max(MAX_TEXT),
    kind: z.enum(["blocks", "document"]).default("blocks"),
    source: z.enum(["chat", "review", "narrative"]).optional(),
    blocks: z
      .array(
        z
          .object({
            key: z.string().min(1).max(512),
            before: z.string().max(MAX_TEXT),
            after: z.string().max(MAX_TEXT),
          })
          .strict(),
      )
      .max(2000),
    document: z
      .object({
        before: z.string().max(MAX_TEXT),
        after: z.string().max(MAX_TEXT),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((proposal, ctx) => {
    if (proposal.kind === "document" && proposal.document === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Una propuesta de documento requiere document.before/after.",
        path: ["document"],
      });
    }
  });

const threadSchema = z
  .object({
    sessionID: z.string().min(1).max(512).nullable(),
    messages: z.array(messageSchema).max(5000),
    proposal: proposalSchema.nullable(),
  })
  .strict();

const storeSchema = z
  .object({
    version: z.literal(1),
    threads: z.record(z.string().min(1).max(4096), threadSchema),
  })
  .strict();

type ThreadStore = z.infer<typeof storeSchema>;

function emptyThread(): AgentThread {
  return { sessionID: null, messages: [], proposal: null };
}

function workspaceHash(workspaceRoot: string): string {
  return createHash("sha1").update(workspaceRoot).digest("hex");
}

function workspacesRoot(workspaceRoot: string): string {
  return path.join(app.getPath("userData"), "workspaces", workspaceHash(workspaceRoot));
}

function threadsPath(workspaceRoot: string): string {
  return path.join(workspacesRoot(workspaceRoot), "threads.json");
}

async function readStore(workspaceRoot: string): Promise<ThreadStore> {
  let raw: string;
  try {
    raw = await fsp.readFile(threadsPath(workspaceRoot), "utf8");
  } catch {
    return { version: 1, threads: {} };
  }
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; threads?: unknown };
    if (
      parsed?.version !== 1 ||
      typeof parsed.threads !== "object" ||
      parsed.threads === null ||
      Array.isArray(parsed.threads)
    ) {
      throw new Error("version o estructura inválida");
    }
    const threads: Record<string, z.infer<typeof threadSchema>> = {};
    for (const [docKey, value] of Object.entries(parsed.threads)) {
      const result = threadSchema.safeParse(value);
      if (result.success && docKey.length > 0 && docKey.length <= 4096) {
        threads[docKey] = result.data;
      } else {
        logWarn("hilo inválido descartado", { docKey });
      }
    }
    return { version: 1, threads };
  } catch (error) {
    const file = threadsPath(workspaceRoot);
    const corrupt = `${file}.corrupt-${Date.now()}`;
    try {
      await fsp.rename(file, corrupt);
    } catch (renameError) {
      logWarn("no se pudo apartar threads.json corrupto", {
        message: renameError instanceof Error ? renameError.message : String(renameError),
      });
    }
    logWarn("threads.json corrupto; se aparta y se empieza vacío", {
      corrupt,
      message: error instanceof Error ? error.message : String(error),
    });
    return { version: 1, threads: {} };
  }
}

async function writeStore(workspaceRoot: string, store: ThreadStore): Promise<void> {
  const file = threadsPath(workspaceRoot);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  writeFileAtomic(file, `${JSON.stringify(store)}\n`, { eol: "lf", bom: false });
}

/** Cola de escritura por raíz de workspace: evita perder hilos concurrentes. */
const writeQueues = new Map<string, Promise<void>>();

/** Hilo persistido de un documento, o uno vacío si aún no existe. */
export async function loadThread(workspaceRoot: string, docKey: string): Promise<AgentThread> {
  const store = await readStore(workspaceRoot);
  return store.threads[docKey] ?? emptyThread();
}

/** Guarda el hilo del documento con validación estricta y escritura atómica. */
export async function saveThread(
  workspaceRoot: string,
  docKey: string,
  thread: AgentThread,
): Promise<void> {
  const parsed = threadSchema.parse(thread);
  if (Buffer.byteLength(JSON.stringify(parsed), "utf8") > MAX_THREAD_BYTES) {
    throw new Error("El hilo del agente supera el límite de 20 MB.");
  }
  const previous = writeQueues.get(workspaceRoot) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const store = await readStore(workspaceRoot);
      store.threads[docKey] = parsed;
      await writeStore(workspaceRoot, store);
    });
  writeQueues.set(workspaceRoot, next);
  const release = (): void => {
    if (writeQueues.get(workspaceRoot) === next) writeQueues.delete(workspaceRoot);
  };
  void next.then(release, release);
  return next;
}

/** Elimina el hilo persistido del documento manteniendo la cola serializada. */
export async function clearThread(workspaceRoot: string, docKey: string): Promise<void> {
  const previous = writeQueues.get(workspaceRoot) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const store = await readStore(workspaceRoot);
      delete store.threads[docKey];
      await writeStore(workspaceRoot, store);
    });
  writeQueues.set(workspaceRoot, next);
  const release = (): void => {
    if (writeQueues.get(workspaceRoot) === next) writeQueues.delete(workspaceRoot);
  };
  void next.then(release, release);
  return next;
}

function backupsRoot(workspaceRoot: string): string {
  return path.join(app.getPath("userData"), "backups", workspaceHash(workspaceRoot));
}

async function syncSidecarAfterWrite(root: string, relPath: string, hash: string): Promise<void> {
  try {
    const { writeDocumentSidecar } = await import("./metadata");
    await writeDocumentSidecar(root, relPath, hash);
  } catch (error) {
    logWarn("no se pudo sincronizar el sidecar tras aplicar propuesta", {
      docKey: relPath,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function snapshotSlug(relPath: string): string {
  const base = path.basename(relPath).replace(/\.(md|mdx)$/i, "");
  const slug = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "documento";
}

async function writeSnapshot(
  workspaceRoot: string,
  relPath: string,
  content: string,
  eol: "lf" | "crlf",
  bom: boolean,
): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(workspacesRoot(workspaceRoot), "snapshots");
  await fsp.mkdir(dir, { recursive: true });
  const snapshotPath = path.join(dir, `${stamp}-${snapshotSlug(relPath)}.md`);
  writeFileAtomic(snapshotPath, content, { eol, bom });
  return snapshotPath;
}

/**
 * Aplica una propuesta con comprobación de hash y validación por bloques en el
 * proceso principal: nunca escribe si el documento cambió en disco ni si algún
 * bloque no coincide con el `before` propuesto. Guarda un snapshot previo y
 * devuelve el estado resultante. El hash esperado se calcula sobre el
 * contenido normalizado a LF; el EOL original se restaura al escribir.
 */
export async function applyProposal(
  input: ProposalApplyInput,
  workspaceRoot: string | null,
): Promise<ProposalApplyResult> {
  if (workspaceRoot === null) {
    return { ok: false, error: "No hay carpeta abierta." };
  }

  let abs: string;
  try {
    abs = resolveWorkspacePath(workspaceRoot, input.relPath);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ruta fuera de la carpeta abierta.",
    };
  }

  let current: ReturnType<typeof readTextFile>;
  try {
    current = readTextFile(abs);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo leer el documento.",
    };
  }

  const normalized = current.content.replace(/\r\n/g, "\n");
  if (sha256(normalized) !== input.expectedHash) {
    return { ok: false, error: "El documento cambió en disco. Recarga antes de aplicar." };
  }

  // Los `before`/`after` pueden venir de un documento CRLF: se normalizan a LF
  // porque el contenido y `block.raw` ya lo están. El EOL original se restaura
  // al escribir.
  const replacements = input.blocks.map((block) => ({
    key: block.key,
    before: block.before.replace(/\r\n/g, "\n"),
    after: block.after.replace(/\r\n/g, "\n"),
  }));

  const replacement = applyBlockReplacements(normalized, replacements);
  if (!replacement.ok) {
    return { ok: false, error: replacement.error };
  }

  const nextContent =
    current.eol === "crlf" ? replacement.content.replace(/\n/g, "\r\n") : replacement.content;
  if (projectedDocumentBytes(nextContent, current.eol, current.bom) > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: "El documento supera el límite de 5 MB; reduzca su contenido antes de aplicar.",
    };
  }

  try {
    const snapshotPath = await writeSnapshot(
      workspaceRoot,
      input.relPath,
      current.content,
      current.eol,
      current.bom,
    );
    writeFileAtomic(abs, nextContent, { backupDir: backupsRoot(workspaceRoot) });
    const written = readTextFile(abs);
    const stat = await fsp.stat(abs);
    const hash = sha256(written.content);
    try {
      const { registerOwnWritePath } = await import("./workspace");
      registerOwnWritePath(abs, hash);
    } catch {
      // El registro de escritura propia es best-effort.
    }
    await syncSidecarAfterWrite(workspaceRoot, input.relPath, hash);
    return {
      ok: true,
      mtimeMs: stat.mtimeMs,
      hash,
      snapshotPath,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo aplicar la propuesta.",
    };
  }
}

/**
 * Aplica una propuesta de documento completo: comprueba el hash del contenido
 * actual, guarda un snapshot previo y escribe el contenido nuevo de forma
 * atómica, preservando el EOL y el BOM originales. El hash de entrada y el de
 * salida se calculan sobre el contenido normalizado a LF.
 */
export async function applyDocumentProposal(
  input: DocumentApplyInput,
  workspaceRoot: string | null,
): Promise<ProposalApplyResult> {
  if (workspaceRoot === null) {
    return { ok: false, error: "No hay carpeta abierta." };
  }

  let abs: string;
  try {
    abs = resolveWorkspacePath(workspaceRoot, input.relPath);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ruta fuera de la carpeta abierta.",
    };
  }

  let current: ReturnType<typeof readTextFile>;
  try {
    current = readTextFile(abs);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo leer el documento.",
    };
  }

  const normalized = current.content.replace(/\r\n/g, "\n");
  if (sha256(normalized) !== input.expectedHash) {
    return { ok: false, error: "El documento cambió en disco. Recarga antes de aplicar." };
  }

  const nextContent = input.content.replace(/\r\n/g, "\n");
  if (projectedDocumentBytes(nextContent, current.eol, current.bom) > MAX_DOCUMENT_BYTES) {
    return {
      ok: false,
      error: "El documento supera el límite de 5 MB; reduzca su contenido antes de aplicar.",
    };
  }
  try {
    const snapshotPath = await writeSnapshot(
      workspaceRoot,
      input.relPath,
      current.content,
      current.eol,
      current.bom,
    );
    writeFileAtomic(abs, nextContent, {
      eol: current.eol,
      bom: current.bom,
      backupDir: backupsRoot(workspaceRoot),
    });
    const written = readTextFile(abs);
    const stat = await fsp.stat(abs);
    const hash = sha256(written.content);
    try {
      const { registerOwnWritePath } = await import("./workspace");
      registerOwnWritePath(abs, hash);
    } catch {
      // El registro de escritura propia es best-effort.
    }
    await syncSidecarAfterWrite(workspaceRoot, input.relPath, hash);
    return {
      ok: true,
      mtimeMs: stat.mtimeMs,
      hash,
      snapshotPath,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo aplicar la propuesta.",
    };
  }
}
