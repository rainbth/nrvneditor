import { createHash } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { z } from "zod";
import { writeFileAtomic } from "../lib/atomic";
import { logWarn } from "../lib/logger";
import type { PendingEntry } from "../types";

const entry = z
  .object({ key: z.string().min(1).max(512), anchorKey: z.string().max(4096).nullable() })
  .strict();
const schema = z
  .object({
    version: z.literal(1),
    documents: z.record(z.string().min(1).max(4096), z.array(entry).max(500)),
  })
  .strict();
type Store = z.infer<typeof schema>;
const writeQueues = new Map<string, Promise<void>>();
function fileFor(root: string): string {
  const hash = createHash("sha1").update(root).digest("hex");
  return path.join(app.getPath("userData"), "workspaces", hash, "pending.json");
}
async function read(root: string): Promise<Store> {
  const file = fileFor(root);
  try {
    return schema.parse(JSON.parse(await fsp.readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, documents: {} };
    try {
      await fsp.rename(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      logWarn("no se pudo apartar pending.json corrupto");
    }
    return { version: 1, documents: {} };
  }
}
export async function loadPending(root: string, docKey: string): Promise<PendingEntry[]> {
  return (await read(root)).documents[docKey] ?? [];
}
export async function savePending(
  root: string,
  docKey: string,
  entries: PendingEntry[],
): Promise<void> {
  const parsed = z.array(entry).max(500).parse(entries);
  const file = fileFor(root);
  const previous = writeQueues.get(file) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const store = await read(root);
      store.documents[docKey] = parsed;
      await fsp.mkdir(path.dirname(file), { recursive: true });
      writeFileAtomic(file, `${JSON.stringify(store)}\n`, { eol: "lf", bom: false });
    });
  writeQueues.set(file, next);
  const release = (): void => {
    if (writeQueues.get(file) === next) writeQueues.delete(file);
  };
  void next.then(release, release);
  return next;
}
