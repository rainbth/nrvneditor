import fs, { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ userData: "", documents: "" }));
vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => (name === "documents" ? host.documents : host.userData),
    getVersion: () => "1.2.3",
  },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
}));

import { dialog } from "electron";
import { sha256 } from "../../electron/lib/atomic";
import {
  applyMetadataImport,
  composeBundle,
  readSidecar,
  seedAppDataFromSidecar,
  syncSidecarThread,
  writeDocumentSidecar,
  writeSidecar,
} from "../../electron/services/metadata";
import { loadPending, savePending } from "../../electron/services/pending";
import { loadThread, saveThread } from "../../electron/services/threads";
import {
  closeAllWatchers,
  isExcludedEventPath,
  openWorkspaceFolder,
  saveDocumentAs,
} from "../../electron/services/workspace";
import type { MetadataBundle } from "../../electron/types";

let root: string;

const sampleThread = (messages: { id: string; text: string }[] = []) => ({
  sessionID: "session",
  messages: messages.map((message) => ({
    id: message.id,
    role: "user" as const,
    text: message.text,
    createdAt: 1,
    status: "done" as const,
  })),
  proposal: null,
});

beforeEach(() => {
  host.userData = mkdtempSync(path.join(tmpdir(), "nrvn-metadata-data-"));
  root = mkdtempSync(path.join(tmpdir(), "nrvn-metadata-root-"));
  host.documents = root;
});

afterEach(() => closeAllWatchers());

function baseBundle(): MetadataBundle {
  return {
    format: "nrvn.metadata",
    version: 1,
    document: { path: "doc.md", hash: null, savedAt: 1 },
    app: { version: "1.0" },
    threads: [],
    pending: [],
    history: [],
    comments: [],
    critiques: [],
    languages: {},
    provenance: {},
  };
}

describe("portable metadata", () => {
  it("roundtrip escribe sidecar y lo carga en app data", async () => {
    writeFileSync(path.join(root, "doc.md"), "texto");
    await saveThread(root, "doc.md", sampleThread([{ id: "m1", text: "hola" }]));
    await savePending(root, "doc.md", [{ key: "k", anchorKey: null }]);
    const bundle = await composeBundle(root, "doc.md", "doc.md", null);
    expect((await writeSidecar(path.join(root, "doc.md"), bundle)).ok).toBe(true);
    const raw = JSON.parse(readFileSync(path.join(root, "doc.md.nrvn"), "utf8"));
    expect(raw).toMatchObject({
      format: "nrvn.metadata",
      version: 1,
      threads: [{ docKey: "doc.md" }],
      pending: [{ docKey: "doc.md" }],
    });
    await saveThread(root, "doc.md", sampleThread());
    await savePending(root, "doc.md", []);
    await seedAppDataFromSidecar(root, "doc.md");
    expect((await loadThread(root, "doc.md")).messages).toHaveLength(1);
    expect(await loadPending(root, "doc.md")).toHaveLength(1);
  });

  it("corrupto avisa y conserva app data", async () => {
    writeFileSync(path.join(root, "doc.md.nrvn"), "{oops");
    await saveThread(root, "doc.md", sampleThread([{ id: "keep", text: "local" }]));
    const before = await loadThread(root, "doc.md");
    const seeded = await seedAppDataFromSidecar(root, "doc.md");
    expect(seeded.warning).toMatch(/conserva el estado local/);
    expect(await loadThread(root, "doc.md")).toEqual(before);
    expect(readdirSync(root).some((entry) => entry.startsWith("doc.md.nrvn.corrupt-"))).toBe(true);
  });

  it("descarta solo registros inválidos de threads del sidecar", async () => {
    const file = path.join(root, "doc.md");
    writeFileSync(file, "doc");
    const bundle = baseBundle();
    (bundle as { threads: unknown[] }).threads = [
      { docKey: "a", thread: sampleThread([{ id: "one", text: "ok" }]) },
      { docKey: "bad", thread: { nope: true } },
      { docKey: "c", thread: sampleThread([{ id: "two", text: "ok" }]) },
    ];
    writeFileSync(`${file}.nrvn`, JSON.stringify(bundle));
    const result = await readSidecar(file);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.bundle.threads.map((record) => record.docKey)).toEqual(["a", "c"]);
    }
  });

  it("rechaza traversal al importar", async () => {
    const result = await applyMetadataImport(root, {
      relPath: "../escape.md",
      docKey: "../escape.md",
      bundle: baseBundle(),
      confirmed: true,
      resolution: "local",
    });
    expect(result.ok).toBe(false);
    expect(existsSync(path.join(root, "..", "escape.md.nrvn"))).toBe(false);
  });

  it("cuarentena el sidecar corrupto al importar y no lo pierde", async () => {
    const file = path.join(root, "doc.md");
    writeFileSync(file, "documento");
    writeFileSync(`${file}.nrvn`, "corrupto");
    const result = await applyMetadataImport(root, {
      relPath: "doc.md",
      docKey: "doc.md",
      bundle: baseBundle(),
      confirmed: true,
      resolution: "local",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/corrupto/);
    expect(existsSync(`${file}.nrvn`)).toBe(false);
    const quarantined = readdirSync(root).filter((entry) =>
      entry.startsWith("doc.md.nrvn.corrupt-"),
    );
    expect(quarantined).toHaveLength(1);
    expect(readFileSync(path.join(root, quarantined[0]), "utf8")).toBe("corrupto");
  });

  it("ignora BOM al comparar el hash del sidecar", async () => {
    writeFileSync(path.join(root, "doc.md"), "\uFEFF# Hola\n");
    await writeDocumentSidecar(root, "doc.md", sha256("# Hola\n"));
    expect((await seedAppDataFromSidecar(root, "doc.md")).warning).toBeUndefined();
  });

  it("conserva backup anterior al reescribir", async () => {
    const file = path.join(root, "doc.md");
    writeFileSync(file, "x");
    const first = baseBundle();
    await writeSidecar(file, first);
    const old = readFileSync(`${file}.nrvn`, "utf8");
    await writeSidecar(file, { ...first, document: { ...first.document, savedAt: 2 } });
    expect(readFileSync(`${file}.nrvn.bak`, "utf8")).toBe(old);
  });

  it("rechaza sidecar mayor a 20 MB", async () => {
    const file = path.join(root, "large.md");
    writeFileSync(`${file}.nrvn`, Buffer.alloc(20_000_001));
    expect((await readSidecar(file)).error).toMatch(/20 MB/);
  });

  it("conserva extensiones futuras vía sincronización", async () => {
    const file = path.join(root, "doc.md");
    writeFileSync(file, "doc");
    await saveThread(root, "doc.md", sampleThread([{ id: "x", text: "x" }]));
    const bundle = {
      ...baseBundle(),
      history: [{ id: "h" }],
      comments: [{ id: "c" }],
      languages: { es: { name: "Español" } },
      future: { keep: true },
    } as MetadataBundle;
    await writeSidecar(file, bundle);
    await syncSidecarThread(root, "doc.md");
    const result = (await readSidecar(file)).bundle;
    expect(result).toMatchObject({
      history: bundle.history,
      comments: bundle.comments,
      languages: bundle.languages,
      future: bundle.future,
    });
  });

  it("mergea mensajes y pending por id, gana local", async () => {
    const imported = baseBundle();
    imported.threads = [
      {
        docKey: "doc.md",
        thread: sampleThread([
          { id: "same", text: "import" },
          { id: "new", text: "new" },
        ]),
      },
    ];
    imported.pending = [
      {
        docKey: "doc.md",
        entries: [
          { key: "same", anchorKey: null },
          { key: "new", anchorKey: null },
        ],
      },
    ];
    await saveThread(root, "doc.md", sampleThread([{ id: "same", text: "local" }]));
    await savePending(root, "doc.md", [{ key: "same", anchorKey: "local" }]);
    const result = await applyMetadataImport(root, {
      relPath: "doc.md",
      docKey: "doc.md",
      bundle: imported,
      confirmed: true,
      resolution: "local",
    });
    expect(result.ok).toBe(true);
    const thread = await loadThread(root, "doc.md");
    expect(thread.messages.map((message) => message.id)).toEqual(["same", "new"]);
    expect(thread.messages[0].text).toBe("local");
    expect((await loadPending(root, "doc.md")).map((entry) => entry.key)).toEqual(["same", "new"]);
  });

  it("no muta app data si falla la escritura del sidecar al importar", async () => {
    const file = path.join(root, "doc.md");
    writeFileSync(file, "documento");
    await saveThread(root, "doc.md", sampleThread([{ id: "local", text: "previo" }]));
    await savePending(root, "doc.md", [{ key: "local-pending", anchorKey: null }]);
    const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("rename simulado");
    });
    const result = await applyMetadataImport(root, {
      relPath: "doc.md",
      docKey: "doc.md",
      bundle: baseBundle(),
      confirmed: true,
      resolution: "imported",
    });
    rename.mockRestore();
    expect(result.ok).toBe(false);
    expect((await loadThread(root, "doc.md")).messages[0].id).toBe("local");
    expect(await loadPending(root, "doc.md")).toEqual([{ key: "local-pending", anchorKey: null }]);
  });

  it("no reemplaza app data local existente al sembrar desde sidecar", async () => {
    writeFileSync(path.join(root, "doc.md"), "texto");
    await saveThread(root, "doc.md", sampleThread([{ id: "local", text: "local" }]));
    const bundle = baseBundle();
    bundle.threads = [
      { docKey: "doc.md", thread: sampleThread([{ id: "sidecar", text: "otro" }]) },
    ];
    await writeSidecar(path.join(root, "doc.md"), bundle);
    await seedAppDataFromSidecar(root, "doc.md");
    expect((await loadThread(root, "doc.md")).messages.map(({ id }) => id)).toEqual(["local"]);
  });

  it("requiere confirmación para importar sobre datos locales", async () => {
    await saveThread(root, "doc.md", sampleThread([{ id: "x", text: "x" }]));
    const result = await applyMetadataImport(root, {
      relPath: "doc.md",
      docKey: "doc.md",
      bundle: baseBundle(),
      confirmed: false,
      resolution: "local",
    });
    expect(result).toMatchObject({ ok: false, needsConfirmation: true });
  });

  it("no altera el markdown al aplicar metadatos", async () => {
    const file = path.join(root, "doc.md");
    writeFileSync(file, "original\n");
    await applyMetadataImport(root, {
      relPath: "doc.md",
      docKey: "doc.md",
      bundle: baseBundle(),
      confirmed: true,
      resolution: "imported",
    });
    expect(readFileSync(file, "utf8")).toBe("original\n");
  });

  it("resuelve conflicto de hash a local o imported sin modificar markdown", async () => {
    const file = path.join(root, "doc.md");
    writeFileSync(file, "documento local");
    const localHash = sha256("documento local");
    const importedHash = "a".repeat(64);
    for (const resolution of ["local", "imported"] as const) {
      const bundle = baseBundle();
      bundle.document.hash = importedHash;
      await applyMetadataImport(root, {
        relPath: "doc.md",
        docKey: "doc.md",
        bundle,
        confirmed: true,
        resolution,
      });
      const read = await readSidecar(file);
      expect(read.status).toBe("ok");
      if (read.status === "ok") {
        expect(read.bundle.document.hash).toBe(localHash);
      }
      expect(readFileSync(file, "utf8")).toBe("documento local");
    }
  });

  it("la resolución imported o local decide el mensaje duplicado", async () => {
    const file = path.join(root, "doc.md");
    writeFileSync(file, "documento local");
    await saveThread(root, "doc.md", sampleThread([{ id: "same", text: "local" }]));
    const bundle = baseBundle();
    bundle.threads = [
      {
        docKey: "doc.md",
        thread: sampleThread([{ id: "same", text: "importado" }]),
      },
    ];

    for (const [resolution, expected] of [
      ["imported", "importado"],
      ["local", "local"],
    ] as const) {
      await saveThread(root, "doc.md", sampleThread([{ id: "same", text: "local" }]));
      await applyMetadataImport(root, {
        relPath: "doc.md",
        docKey: "doc.md",
        bundle,
        confirmed: true,
        resolution,
      });
      expect((await loadThread(root, "doc.md")).messages[0].text).toBe(expected);
    }
  });

  it("no importa el sessionID remoto si el hilo local está vacío, y conserva el local", async () => {
    const bundle = baseBundle();
    bundle.threads = [{ docKey: "doc.md", thread: sampleThread() }];

    await applyMetadataImport(root, {
      relPath: "doc.md",
      docKey: "doc.md",
      bundle,
      confirmed: true,
      resolution: "imported",
    });
    expect((await loadThread(root, "doc.md")).sessionID).toBeNull();

    await saveThread(root, "doc.md", { ...sampleThread(), sessionID: "local-session" });
    await applyMetadataImport(root, {
      relPath: "doc.md",
      docKey: "doc.md",
      bundle,
      confirmed: true,
      resolution: "imported",
    });
    expect((await loadThread(root, "doc.md")).sessionID).toBe("local-session");
  });

  it("migra metadata desde __untitled__ al guardar como sin workspace", async () => {
    await saveThread("__untitled__", "untitled-1", sampleThread([{ id: "m", text: "texto" }]));
    await savePending("__untitled__", "untitled-1", [{ key: "p", anchorKey: null }]);
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: path.join(root, "destino.md"),
      bookmark: undefined,
    });
    await saveDocumentAs(null, "contenido", "untitled-1");
    const sidecar = JSON.parse(readFileSync(path.join(root, "destino.md.nrvn"), "utf8"));
    expect(sidecar.threads[0].thread.messages).toHaveLength(1);
    expect(sidecar.pending[0].entries).toHaveLength(1);
    expect((await loadThread("__untitled__", "untitled-1")).messages).toEqual([]);
  });

  it("migra metadatos en Save As y limpia el hilo y pending de origen", async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: [root],
      bookmarks: [],
    });
    await openWorkspaceFolder(null);
    await saveThread(root, "borrador-1", sampleThread([{ id: "m", text: "texto" }]));
    await savePending(root, "borrador-1", [{ key: "p", anchorKey: null }]);
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: path.join(root, "destino.md"),
      bookmark: undefined,
    });
    const saved = await saveDocumentAs(null, "contenido", "borrador-1");
    expect(saved).toMatchObject({ canceled: false, relPath: "destino.md" });
    expect(existsSync(path.join(root, "destino.md.nrvn"))).toBe(true);
    expect((await loadThread(root, "borrador-1")).messages).toHaveLength(0);
    expect(await loadPending(root, "borrador-1")).toEqual([]);
  });

  it("cuarentena y regenera un sidecar con JSON inválido al guardar", async () => {
    const file = path.join(root, "doc.md");
    writeFileSync(file, "{}");
    writeFileSync(`${file}.nrvn`, "corrupto");
    const result = await writeDocumentSidecar(root, "doc.md", "b".repeat(64));
    expect(result.warning).toBeUndefined();
    expect(readdirSync(root).some((entry) => entry.startsWith("doc.md.nrvn.corrupt-"))).toBe(true);
    const rebuilt = JSON.parse(readFileSync(`${file}.nrvn`, "utf8"));
    expect(rebuilt.document.hash).toBe("b".repeat(64));
  });

  it("no emite claves secretas en bundle exportado", async () => {
    const bundle = await composeBundle(root, "doc.md", null, null);
    expect(JSON.stringify(bundle)).not.toMatch(/"(?:token|apiKey|secret|password)"/i);
  });

  it("no crea sidecar si el documento no existe", () => {
    expect(existsSync(path.join(root, "absent.md.nrvn"))).toBe(false);
  });

  it("excluye sidecars y backups del watcher", () => {
    expect(isExcludedEventPath("doc.md.nrvn")).toBe(true);
    expect(isExcludedEventPath("doc.md.nrvn.bak")).toBe(true);
    expect(isExcludedEventPath("doc.md.nrvn.bak-2026")).toBe(true);
    expect(isExcludedEventPath("doc.md.nrvn.corrupt-123")).toBe(true);
    expect(isExcludedEventPath(".doc.md.nrvn-tmp-abc")).toBe(true);
  });
});
