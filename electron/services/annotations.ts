import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { z } from "zod";
import { writeFileAtomic } from "../lib/atomic";
import { logWarn } from "../lib/logger";
import {
  type BlockComment,
  type BlockVersion,
  type DocumentAnnotations,
  type DocumentAnnotationsLoad,
  documentAnnotationsSchema,
  type HistoryEvent,
  type StoredCritique,
} from "../types";

const empty = (): DocumentAnnotations => ({
  history: [],
  comments: [],
  critiques: [],
  blockVersions: [],
});
const storeSchema = z
  .object({
    version: z.literal(1),
    documents: z.record(z.string(), documentAnnotationsSchema),
  })
  .strict();
const queues = new Map<string, Promise<void>>();

function fileFor(root: string): string {
  return path.join(
    app.getPath("userData"),
    "workspaces",
    createHash("sha1").update(root).digest("hex"),
    "annotations.json",
  );
}

async function read(
  root: string,
): Promise<{ version: 1; documents: Record<string, DocumentAnnotations> }> {
  const file = fileFor(root);
  try {
    return storeSchema.parse(JSON.parse(await fsp.readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, documents: {} };
    }
    try {
      await fsp.rename(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      logWarn("no se pudo apartar annotations.json corrupto");
    }
    return { version: 1, documents: {} };
  }
}

async function update(
  root: string,
  key: string,
  transform: (value: DocumentAnnotations) => DocumentAnnotations,
): Promise<void> {
  const file = fileFor(root);
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const store = await read(root);
      const value = documentAnnotationsSchema.parse(transform(store.documents[key] ?? empty()));
      store.documents[key] = value;
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await writeFileAtomic(file, `${JSON.stringify(store)}\n`, { eol: "lf", bom: false });
    });
  queues.set(file, next);
  void next.then(
    () => {
      if (queues.get(file) === next) queues.delete(file);
    },
    () => {
      if (queues.get(file) === next) queues.delete(file);
    },
  );
  return next;
}

export async function loadAnnotations(
  root: string,
  docKey: string,
): Promise<DocumentAnnotationsLoad> {
  const store = await read(root);
  return {
    ...(store.documents[docKey] ?? empty()),
    exists: Object.hasOwn(store.documents, docKey),
  };
}

export async function saveAnnotations(
  root: string,
  docKey: string,
  value: DocumentAnnotations,
): Promise<void> {
  await update(root, docKey, () => documentAnnotationsSchema.parse(value));
}

export async function appendHistory(
  root: string,
  docKey: string,
  event: HistoryEvent,
): Promise<void> {
  await update(root, docKey, (value) => ({
    ...value,
    history: [...value.history, { ...event, docKey }].slice(-5000),
  }));
}

export async function setComments(
  root: string,
  docKey: string,
  comments: BlockComment[],
): Promise<void> {
  await update(root, docKey, (value) => ({
    ...value,
    comments: comments.slice(-5000),
  }));
}

export async function setCritiques(
  root: string,
  docKey: string,
  critiques: StoredCritique[],
): Promise<void> {
  await update(root, docKey, (value) => ({
    ...value,
    critiques: critiques.slice(-5000),
  }));
}

export async function setBlockVersions(
  root: string,
  docKey: string,
  versions: BlockVersion[],
): Promise<void> {
  const counts = new Map<string, number>();
  const pruned = [...versions]
    .reverse()
    .filter((version) => {
      const count = (counts.get(version.blockKey) ?? 0) + 1;
      counts.set(version.blockKey, count);
      return count <= 10;
    })
    .reverse();
  await update(root, docKey, (value) => ({ ...value, blockVersions: pruned.slice(-10000) }));
}

export async function copyAnnotations(
  fromRoot: string,
  fromDocKey: string,
  toRoot: string,
  toDocKey: string,
): Promise<boolean> {
  const source = await loadAnnotations(fromRoot, fromDocKey);
  if (!source.exists) return false;
  const value = {
    history: source.history,
    comments: source.comments,
    critiques: source.critiques,
    blockVersions: source.blockVersions,
  };
  await saveAnnotations(toRoot, toDocKey, {
    ...value,
    history: value.history.map((event) => ({ ...event, docKey: toDocKey })),
    comments: value.comments.map((comment) => ({ ...comment, docKey: toDocKey })),
    critiques: value.critiques.map((critique) => ({ ...critique, docKey: toDocKey })),
  });
  return true;
}

export async function clearAnnotations(root: string, docKey: string): Promise<void> {
  const file = fileFor(root);
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const store = await read(root);
      delete store.documents[docKey];
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await writeFileAtomic(file, `${JSON.stringify(store)}\n`, { eol: "lf", bom: false });
    });
  queues.set(file, next);
  void next.then(
    () => {
      if (queues.get(file) === next) queues.delete(file);
    },
    () => {
      if (queues.get(file) === next) queues.delete(file);
    },
  );
  await next;
}
