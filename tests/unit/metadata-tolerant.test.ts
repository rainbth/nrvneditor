import fs, { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ userData: "", documents: "", logs: "" }));
vi.mock("electron", () => ({
  app: {
    getPath: (name: string) =>
      name === "documents" ? host.documents : name === "logs" ? host.logs : host.userData,
    getVersion: () => "1.0.0",
  },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
}));

import { readSidecar } from "../../electron/services/metadata";

let dir: string;
let doc: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "nrvn-metadata-tolerant-"));
  host.userData = dir;
  host.documents = dir;
  host.logs = dir;
  doc = path.join(dir, "doc.md");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function bundle() {
  return {
    format: "nrvn.metadata",
    version: 1,
    document: { path: "doc.md", hash: null, savedAt: 1 },
    app: { version: "1.0" },
    threads: [{ docKey: "doc.md", thread: { sessionID: null, messages: [], proposal: null } }],
    pending: [],
    history: [],
    comments: [],
    critiques: [],
    languages: {},
    provenance: {},
  };
}

describe("tolerant sidecar parsing", () => {
  it("returns missing for a nonexistent sidecar", async () => {
    expect(await readSidecar(doc)).toEqual({ status: "missing" });
  });

  it("quarantines malformed JSON", async () => {
    writeFileSync(`${doc}.nrvn`, "{broken");
    const result = await readSidecar(doc);
    expect(result.status).toBe("error");
    expect(readdirSync(dir).some((entry) => entry.startsWith("doc.md.nrvn.corrupt-"))).toBe(true);
    expect(readdirSync(dir)).not.toContain("doc.md.nrvn");
  });

  it("drops invalid thread records and preserves valid ones", async () => {
    const data = bundle();
    data.threads.push({ docKey: "invalid", thread: { nope: true } } as never);
    writeFileSync(`${doc}.nrvn`, JSON.stringify(data));
    const result = await readSidecar(doc);
    expect(result.status).toBe("ok");
    if (result.status === "ok")
      expect(result.bundle.threads.map((record) => record.docKey)).toEqual(["doc.md"]);
  });

  it("drops invalid pending records", async () => {
    const data = bundle();
    data.pending = [{ docKey: "doc.md", entries: [{ invalid: true }] }] as never;
    writeFileSync(`${doc}.nrvn`, JSON.stringify(data));
    const result = await readSidecar(doc);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.bundle.pending).toEqual([]);
  });

  it.each([
    ["threads is not an array", { ...bundle(), threads: {} }],
    ["incompatible version", { ...bundle(), version: 2 }],
  ])("returns error when %s", async (_label, value) => {
    writeFileSync(`${doc}.nrvn`, JSON.stringify(value));
    expect((await readSidecar(doc)).status).toBe("error");
  });

  it("quarantines sidecars larger than 20 MB", async () => {
    const file = `${doc}.nrvn`;
    const fd = fs.openSync(file, "w");
    fs.ftruncateSync(fd, 20_000_001);
    fs.closeSync(fd);
    expect((await readSidecar(doc)).status).toBe("error");
    expect(readdirSync(dir).some((entry) => entry.startsWith("doc.md.nrvn.corrupt-"))).toBe(true);
    expect(readdirSync(dir)).not.toContain("doc.md.nrvn");
  });
});
