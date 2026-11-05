import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ userData: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => host.userData, getVersion: () => "1.0" },
  dialog: {
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
}));

import { dialog } from "electron";

import {
  appendHistory,
  clearAnnotations,
  copyAnnotations,
  loadAnnotations,
  saveAnnotations,
  setBlockVersions,
} from "../../electron/services/annotations";
import {
  applyMetadataImport,
  composeBundle,
  migrateMetadataOnSaveAs,
  seedAppDataFromSidecar,
  writeSidecar,
} from "../../electron/services/metadata";
import { loadPending, savePending } from "../../electron/services/pending";
import { loadThread, saveThread } from "../../electron/services/threads";
import {
  closeAllWatchers,
  openWorkspaceFolder,
  saveDocumentAs,
} from "../../electron/services/workspace";
import type {
  AgentThread,
  DocumentAnnotations,
  HistoryEvent,
  MetadataBundle,
} from "../../electron/types";
import {
  commentCountsByBlock,
  commentsForBlock,
  isCommentStale,
  isCritiqueStale,
} from "../../src/lib/annotations";

let root: string;

const empty: DocumentAnnotations = {
  history: [],
  comments: [],
  critiques: [],
};

const event = (id: string, docKey = "a.md"): HistoryEvent => ({
  id,
  docKey,
  kind: "manual",
  createdAt: Number(id.replace(/\D/g, "")) || 1,
  blocks: [{ key: "b", beforeHash: "a", afterHash: "b" }],
});
const version = (id: string, blockKey = "b", raw = id) => ({
  id,
  blockKey,
  raw,
  createdAt: Number(id.replace(/\D/g, "")) || 1,
  source: "manual",
});

function bundle(): MetadataBundle {
  return {
    format: "nrvn.metadata",
    version: 1,
    document: { path: "a.md", hash: null, savedAt: 1 },
    app: { version: "1" },
    threads: [],
    pending: [],
    history: [],
    comments: [],
    critiques: [],
    languages: {},
    provenance: {},
  };
}

beforeEach(() => {
  host.userData = mkdtempSync(path.join(tmpdir(), "nrvn-ann-data-"));
  root = mkdtempSync(path.join(tmpdir(), "nrvn-ann-root-"));
});

afterEach(() => {
  closeAllWatchers();
  vi.restoreAllMocks();
});

describe("annotations persistence", () => {
  it("roundtrip y aísla docKey", async () => {
    await saveAnnotations(root, "a.md", { ...empty, history: [event("1")] });

    expect((await loadAnnotations(root, "a.md")).history).toHaveLength(1);
    expect((await loadAnnotations(root, "b.md")).exists).toBe(false);
  });

  it("persiste versiones, compone/siembra sidecar, copia e importa respetando resolution", async () => {
    const localVersion = version("v1", "b", "local");
    const importedVersion = version("v1", "b", "importada");
    const second = version("v2", "c", "otra");
    await setBlockVersions(root, "a.md", [localVersion]);
    expect((await loadAnnotations(root, "a.md")).blockVersions).toEqual([localVersion]);
    expect((await composeBundle(root, "a.md", "a.md", null)).blockVersions).toEqual([localVersion]);
    const copyRoot = mkdtempSync(path.join(tmpdir(), "nrvn-ann-copy-"));
    await copyAnnotations(root, "a.md", copyRoot, "copy.md");
    expect((await loadAnnotations(copyRoot, "copy.md")).blockVersions).toEqual([localVersion]);

    const sidecarPath = path.join(root, "roundtrip.md");
    const portable = bundle();
    portable.blockVersions = [localVersion, second];
    await writeSidecar(sidecarPath, portable);
    await seedAppDataFromSidecar(root, "roundtrip.md");
    expect((await loadAnnotations(root, "roundtrip.md")).blockVersions).toEqual([
      localVersion,
      second,
    ]);

    const imported = bundle();
    imported.blockVersions = [importedVersion, second];
    const result = await applyMetadataImport(root, {
      relPath: null,
      docKey: "a.md",
      bundle: imported,
      confirmed: true,
      resolution: "imported",
    });
    expect(result.ok).toBe(true);
    expect((await loadAnnotations(root, "a.md")).blockVersions[0]).toEqual(importedVersion);
  });

  it("mantiene el orden y limita el historial a los últimos 5000", async () => {
    await saveAnnotations(root, "a.md", {
      ...empty,
      history: Array.from({ length: 5000 }, (_, i) => event(String(i))),
    });
    await appendHistory(root, "a.md", event("5000"));

    const history = (await loadAnnotations(root, "a.md")).history;
    expect(history).toHaveLength(5000);
    expect(history[0].id).toBe("1");
    expect(history.at(-1)?.id).toBe("5000");
  });

  it("aparta JSON corrupto y devuelve store vacío", async () => {
    const dir = path.join(host.userData, "workspaces");
    const file = path.join(dir, createHash("sha1").update(root).digest("hex"), "annotations.json");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "{nope");

    expect((await loadAnnotations(root, "a.md")).history).toEqual([]);
    expect(readdirSync(path.dirname(file)).some((name) => name.includes(".corrupt-"))).toBe(true);
  });

  it("copia y limpia anotaciones", async () => {
    await saveAnnotations(root, "from", {
      ...empty,
      history: [event("1", "from")],
    });

    expect(await copyAnnotations(root, "from", root, "to")).toBe(true);
    expect((await loadAnnotations(root, "to")).history[0].docKey).toBe("to");
    await clearAnnotations(root, "from");
    expect((await loadAnnotations(root, "from")).history).toEqual([]);
    expect((await loadAnnotations(root, "from")).exists).toBe(false);
  });

  it("clearAnnotations elimina la clave del documento", async () => {
    await saveAnnotations(root, "remove-me", {
      ...empty,
      history: [event("1", "remove-me")],
    });
    await clearAnnotations(root, "remove-me");

    expect((await loadAnnotations(root, "remove-me")).exists).toBe(false);
  });

  it("compone bundle con datos app", async () => {
    const data = { ...empty, history: [event("1")] };
    await saveAnnotations(root, "a.md", data);

    expect((await composeBundle(root, "a.md", "a.md", null)).history).toHaveLength(1);
  });

  it("siembra desde sidecar sin reemplazar datos locales", async () => {
    const sidecar = bundle();
    sidecar.history = [event("1")];
    await writeSidecar(path.join(root, "a.md"), sidecar);
    await seedAppDataFromSidecar(root, "a.md");
    expect((await loadAnnotations(root, "a.md")).history).toHaveLength(1);

    await saveAnnotations(root, "a.md", { ...empty, history: [event("2")] });
    await seedAppDataFromSidecar(root, "a.md");
    expect((await loadAnnotations(root, "a.md")).history[0].id).toBe("2");
  });

  it("mergea por id y persiste importación", async () => {
    const local = { ...empty, history: [event("1")] };
    await saveAnnotations(root, "a.md", local);
    const imported = bundle();
    imported.history = [event("1"), event("2")];

    const result = await applyMetadataImport(root, {
      relPath: null,
      docKey: "a.md",
      bundle: imported,
      confirmed: true,
      resolution: "local",
    });

    expect(result.ok).toBe(true);
    expect((await loadAnnotations(root, "a.md")).history.map((item) => item.id)).toEqual([
      "1",
      "2",
    ]);
  });

  it("resolution imported gana el registro importado con id duplicado", async () => {
    const localEvent = event("duplicate");
    const importedEvent: HistoryEvent = {
      ...event("duplicate"),
      blocks: [{ key: "b", beforeHash: "a", afterHash: "imported" }],
    };
    await saveAnnotations(root, "a.md", { ...empty, history: [localEvent] });
    const imported = bundle();
    imported.history = [importedEvent];

    const result = await applyMetadataImport(root, {
      relPath: null,
      docKey: "a.md",
      bundle: imported,
      confirmed: true,
      resolution: "imported",
    });

    expect(result.ok).toBe(true);
    expect((await loadAnnotations(root, "a.md")).history[0].blocks[0].afterHash).toBe("imported");
  });

  it("Save As cross-root copia anotaciones y limpia el origen solo tras copiar", async () => {
    const destinationRoot = mkdtempSync(path.join(tmpdir(), "nrvn-ann-destination-"));
    await saveAnnotations(root, "source.md", {
      ...empty,
      history: [event("1", "source.md")],
    });

    const result = await migrateMetadataOnSaveAs(
      root,
      "source.md",
      destinationRoot,
      path.join(destinationRoot, "copy.md"),
      "copy.md",
      "a".repeat(64),
    );

    expect(result.warning).toBeUndefined();
    expect((await loadAnnotations(destinationRoot, "copy.md")).history).toHaveLength(1);
    expect((await loadAnnotations(root, "source.md")).exists).toBe(false);

    const emptySource = await migrateMetadataOnSaveAs(
      root,
      "no-annotations.md",
      destinationRoot,
      path.join(destinationRoot, "empty-copy.md"),
      "empty-copy.md",
      "b".repeat(64),
    );
    expect(emptySource.warning).toBeUndefined();
    expect((await loadAnnotations(root, "no-annotations.md")).exists).toBe(false);
    expect((await loadAnnotations(destinationRoot, "empty-copy.md")).exists).toBe(false);
  });

  it("Save As desde origen vacío limpia la metadata preexistente del destino", async () => {
    const destinationRoot = mkdtempSync(path.join(tmpdir(), "nrvn-ann-destination-existing-"));
    const destinationKey = "replacement.md";
    const existingThread: AgentThread = {
      sessionID: "old-session",
      messages: [
        {
          id: "old-message",
          role: "user",
          text: "old metadata",
          createdAt: 1,
          status: "done",
        },
      ],
      proposal: null,
    };
    await saveAnnotations(destinationRoot, destinationKey, {
      ...empty,
      history: [event("1", destinationKey)],
    });
    await saveThread(destinationRoot, destinationKey, existingThread);
    await savePending(destinationRoot, destinationKey, [{ key: "old-pending", anchorKey: null }]);

    const result = await migrateMetadataOnSaveAs(
      root,
      "empty-source.md",
      destinationRoot,
      path.join(destinationRoot, destinationKey),
      destinationKey,
      "c".repeat(64),
    );

    expect(result.warning).toBeUndefined();
    expect((await loadAnnotations(destinationRoot, destinationKey)).exists).toBe(false);
    expect((await loadThread(destinationRoot, destinationKey)).messages).toEqual([]);
    expect(await loadPending(destinationRoot, destinationKey)).toEqual([]);
    expect((await loadAnnotations(root, "empty-source.md")).exists).toBe(false);
  });

  it("Save As con reset limpia metadata preexistente del destino", async () => {
    const destinationRoot = mkdtempSync(path.join(tmpdir(), "nrvn-ann-existing-destination-"));
    const destination = path.join(destinationRoot, "destino.md");
    writeFileSync(destination, "contenido anterior");
    writeFileSync(`${destination}.nrvn`, "sidecar anterior");
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: [root],
    });
    await openWorkspaceFolder(null);

    const thread: AgentThread = {
      sessionID: "session",
      messages: [
        {
          id: "message",
          role: "user",
          text: "anterior",
          createdAt: 1,
          status: "done",
        },
      ],
      proposal: null,
    };
    await saveAnnotations(destinationRoot, "destino.md", {
      ...empty,
      history: [event("1", "destino.md")],
    });
    await saveThread(destinationRoot, "destino.md", thread);
    await savePending(destinationRoot, "destino.md", [{ key: "pending", anchorKey: null }]);
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: destination,
    });

    const result = await saveDocumentAs(null, "contenido nuevo", "source.md", true);

    expect(result.canceled).toBe(false);
    expect((await loadAnnotations(destinationRoot, "destino.md")).exists).toBe(false);
    expect((await loadThread(destinationRoot, "destino.md")).messages).toEqual([]);
    expect(await loadPending(destinationRoot, "destino.md")).toEqual([]);
    expect(readdirSync(destinationRoot)).not.toContain("destino.md.nrvn");
    expect(
      readdirSync(destinationRoot).some((name) => name.startsWith("destino.md.nrvn.bak-")),
    ).toBe(true);
  });

  it("helpers calculan stale y conteo", () => {
    const comment = {
      id: "c",
      docKey: "a",
      blockKey: "b",
      blockHash: "old",
      body: "x",
      createdAt: 1,
      updatedAt: 1,
      resolved: false,
    };
    expect(commentsForBlock([comment], "b")).toHaveLength(1);
    expect(isCommentStale(comment, "new")).toBe(true);
    expect(commentCountsByBlock([comment, comment])).toEqual({ b: 2 });

    const critique = {
      id: "x",
      docKey: "a",
      audience: "ed",
      createdAt: 1,
      blockHashes: { b: "old" },
      blocks: [],
    };
    expect(isCritiqueStale(critique, { b: "new" })).toBe(true);
  });

  it("no marca stale una crítica si cambia un bloque ajeno a sus hashes", () => {
    const critique = {
      id: "x",
      docKey: "a",
      audience: "ed",
      createdAt: 1,
      blockHashes: { reviewed: "same" },
      blocks: [],
    };

    expect(isCritiqueStale(critique, { reviewed: "same", unrelated: "changed" })).toBe(false);
  });
});
