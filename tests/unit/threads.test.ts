import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ userData: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => host.userData },
}));

import { MAX_DOCUMENT_BYTES, sha256 } from "../../electron/lib/atomic";
import { seedAppDataFromSidecar } from "../../electron/services/metadata";
import { applyProposal, loadThread, saveThread } from "../../electron/services/threads";

let workspace: string;

beforeEach(() => {
  host.userData = mkdtempSync(path.join(tmpdir(), "nrvn-userdata-"));
  workspace = mkdtempSync(path.join(tmpdir(), "nrvn-ws-"));
});

describe("threads", () => {
  it("tolera hilos inválidos registro a registro sin cuarentena", async () => {
    const dir = path.join(
      host.userData,
      "workspaces",
      createHash("sha1").update(workspace).digest("hex"),
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "threads.json"),
      JSON.stringify({
        version: 1,
        threads: {
          a: { sessionID: null, messages: [], proposal: null },
          b: { nope: true },
          c: { sessionID: null, messages: [], proposal: null },
        },
      }),
    );
    expect((await loadThread(workspace, "a")).sessionID).toBeNull();
    expect((await loadThread(workspace, "c")).messages).toEqual([]);
    expect((await loadThread(workspace, "b")).messages).toEqual([]);
    expect(readdirSync(dir).some((entry) => entry.startsWith("threads.json.corrupt-"))).toBe(false);
  });

  it("aplica propuesta y sincroniza hash del sidecar", async () => {
    const file = path.join(workspace, "doc.md");
    writeFileSync(file, "old");
    const result = await applyProposal(
      {
        relPath: "doc.md",
        expectedHash: sha256("old"),
        prompt: "x",
        blocks: [{ key: "#paragraph:0", before: "old", after: "new" }],
      },
      workspace,
    );
    expect(result.ok).toBe(true);
    expect(existsSync(`${file}.nrvn`)).toBe(true);
    expect((await seedAppDataFromSidecar(workspace, "doc.md")).warning).toBeUndefined();
  });

  it("mantiene el límite único de documento de 5 MiB", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(5 * 1024 * 1024);
  });
  it("devuelve un hilo vacío cuando no hay nada guardado", async () => {
    await expect(loadThread(workspace, "notas.md")).resolves.toEqual({
      sessionID: null,
      messages: [],
      proposal: null,
    });
  });

  it("aparta un threads.json corrupto y no lo sobrescribe", async () => {
    const hash = createHash("sha1").update(workspace).digest("hex");
    const dir = path.join(host.userData, "workspaces", hash);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "threads.json");
    writeFileSync(file, "{ esto no es json", "utf8");

    await expect(loadThread(workspace, "notas.md")).resolves.toEqual({
      sessionID: null,
      messages: [],
      proposal: null,
    });

    const entries = readdirSync(dir);
    expect(entries.some((entry) => entry.startsWith("threads.json.corrupt-"))).toBe(true);
    expect(entries).not.toContain("threads.json");
  });

  it("persiste y relee el hilo por documento", async () => {
    const thread = {
      sessionID: "ses_1",
      messages: [
        {
          id: "m1",
          role: "user" as const,
          text: "cambia esto",
          createdAt: 1,
          status: "done" as const,
        },
      ],
      proposal: {
        id: "p1",
        createdAt: 2,
        prompt: "cambia esto",
        kind: "blocks" as const,
        blocks: [{ key: "intro", before: "a", after: "b" }],
        document: null,
      },
    };
    await saveThread(workspace, "notas.md", thread);
    await expect(loadThread(workspace, "notas.md")).resolves.toEqual(thread);
    await expect(loadThread(workspace, "otro.md")).resolves.toEqual({
      sessionID: null,
      messages: [],
      proposal: null,
    });
  });

  it("persiste source de la propuesta y sigue cargando propuestas antiguas", async () => {
    const thread = {
      sessionID: null,
      messages: [],
      proposal: {
        id: "p-source",
        createdAt: 2,
        prompt: "cambia esto",
        kind: "blocks" as const,
        source: "chat" as const,
        blocks: [{ key: "intro", before: "a", after: "b" }],
        document: null,
      },
    };
    await saveThread(workspace, "con-source.md", thread);
    await expect(loadThread(workspace, "con-source.md")).resolves.toEqual(thread);

    const legacy = {
      sessionID: null,
      messages: [],
      proposal: {
        id: "p-legacy",
        createdAt: 3,
        prompt: "antigua",
        kind: "blocks",
        blocks: [{ key: "intro", before: "a", after: "b" }],
        document: null,
      },
    };
    await saveThread(workspace, "antiguo.md", legacy);
    await expect(loadThread(workspace, "antiguo.md")).resolves.toEqual(legacy);
  });

  it("aplica con hash correcto, escribe snapshot y actualiza el archivo", async () => {
    const file = path.join(workspace, "notas.md");
    writeFileSync(file, "contenido viejo\n", "utf8");
    const result = await applyProposal(
      {
        relPath: "notas.md",
        expectedHash: sha256("contenido viejo\n"),
        prompt: "reescribe",
        blocks: [{ key: "#paragraph:0", before: "contenido viejo", after: "contenido nuevo" }],
      },
      workspace,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readFileSync(file, "utf8")).toBe("contenido nuevo\n");
    expect(result.hash).toBe(sha256("contenido nuevo\n"));
    expect(result.snapshotPath.startsWith(host.userData)).toBe(true);
    expect(existsSync(result.snapshotPath)).toBe(true);
  });

  it("aplica solo el bloque propuesto y conserva el resto del documento", async () => {
    const file = path.join(workspace, "notas.md");
    const original = "# Título\n\nuno\n\ndos\n";
    writeFileSync(file, original, "utf8");
    const result = await applyProposal(
      {
        relPath: "notas.md",
        expectedHash: sha256(original),
        prompt: "reescribe uno",
        blocks: [{ key: "Título#paragraph:0", before: "uno", after: "uno cambiado" }],
      },
      workspace,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readFileSync(file, "utf8")).toBe("# Título\n\nuno cambiado\n\ndos\n");
    expect(result.hash).toBe(sha256("# Título\n\nuno cambiado\n\ndos\n"));
  });

  it("rechaza el apply si el documento cambió en disco", async () => {
    const file = path.join(workspace, "notas.md");
    writeFileSync(file, "otro contenido\n", "utf8");
    const result = await applyProposal(
      {
        relPath: "notas.md",
        expectedHash: sha256("contenido viejo\n"),
        prompt: "reescribe",
        blocks: [{ key: "#paragraph:0", before: "otro contenido", after: "contenido nuevo" }],
      },
      workspace,
    );
    expect(result).toEqual({
      ok: false,
      error: "El documento cambió en disco. Recarga antes de aplicar.",
    });
    expect(readFileSync(file, "utf8")).toBe("otro contenido\n");
  });

  it("rechaza el apply si el before del bloque está desactualizado", async () => {
    const file = path.join(workspace, "notas.md");
    writeFileSync(file, "contenido actual\n", "utf8");
    const result = await applyProposal(
      {
        relPath: "notas.md",
        expectedHash: sha256("contenido actual\n"),
        prompt: "reescribe",
        blocks: [{ key: "#paragraph:0", before: "contenido viejo", after: "nuevo" }],
      },
      workspace,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("cambió en el documento");
    expect(readFileSync(file, "utf8")).toBe("contenido actual\n");
    const snapshots = path.join(host.userData, "workspaces");
    expect(existsSync(snapshots) && readdirSync(snapshots).length > 0).toBe(false);
  });

  it("rechaza claves ajenas o duplicadas sin escribir", async () => {
    const file = path.join(workspace, "notas.md");
    writeFileSync(file, "uno\n\ndos\n", "utf8");

    const foreign = await applyProposal(
      {
        relPath: "notas.md",
        expectedHash: sha256("uno\n\ndos\n"),
        prompt: "x",
        blocks: [{ key: "no-existe#paragraph:9", before: "uno", after: "uno!" }],
      },
      workspace,
    );
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error).toContain("ya no existe");

    const duplicated = await applyProposal(
      {
        relPath: "notas.md",
        expectedHash: sha256("uno\n\ndos\n"),
        prompt: "x",
        blocks: [
          { key: "#paragraph:0", before: "uno", after: "uno!" },
          { key: "#paragraph:0", before: "uno", after: "otro" },
        ],
      },
      workspace,
    );
    expect(duplicated.ok).toBe(false);
    if (!duplicated.ok) expect(duplicated.error).toContain("repetida");

    expect(readFileSync(file, "utf8")).toBe("uno\n\ndos\n");
  });

  it("conserva el EOL CRLF y devuelve el hash del contenido escrito", async () => {
    const file = path.join(workspace, "crlf.md");
    writeFileSync(file, "a\r\n\r\nb\r\n", "utf8");
    const result = await applyProposal(
      {
        relPath: "crlf.md",
        expectedHash: sha256("a\n\nb\n"),
        prompt: "reescribe a",
        blocks: [{ key: "#paragraph:0", before: "a", after: "A" }],
      },
      workspace,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const written = readFileSync(file, "utf8");
    expect(written).toBe("A\r\n\r\nb\r\n");
    expect(result.hash).toBe(sha256(written));
  });

  it("normaliza before/after multilínea CRLF y conserva el EOL del archivo", async () => {
    const file = path.join(workspace, "crlf-multilinea.md");
    writeFileSync(file, "uno\r\ndos\r\n\r\notro\r\n", "utf8");
    const result = await applyProposal(
      {
        relPath: "crlf-multilinea.md",
        expectedHash: sha256("uno\ndos\n\notro\n"),
        prompt: "reescribe el párrafo",
        blocks: [
          {
            key: "#paragraph:0",
            before: "uno\r\ndos",
            after: "uno modificado\r\ndos modificado",
          },
        ],
      },
      workspace,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const written = readFileSync(file, "utf8");
    expect(written).toBe("uno modificado\r\ndos modificado\r\n\r\notro\r\n");
    expect(result.hash).toBe(sha256(written));
  });

  it("no escribe fuera de la raíz del workspace", async () => {
    const result = await applyProposal(
      {
        relPath: "../fuera.md",
        expectedHash: sha256("x"),
        prompt: "x",
        blocks: [{ key: "#paragraph:0", before: "x", after: "y" }],
      },
      workspace,
    );
    expect(result.ok).toBe(false);
  });
});

describe("threads · escrituras concurrentes", () => {
  it("serializa saveThread y conserva los dos hilos", async () => {
    const threadA = {
      sessionID: "ses_a",
      messages: [
        { id: "ma", role: "user" as const, text: "a", createdAt: 1, status: "done" as const },
      ],
      proposal: null,
    };
    const threadB = {
      sessionID: "ses_b",
      messages: [
        { id: "mb", role: "user" as const, text: "b", createdAt: 2, status: "done" as const },
      ],
      proposal: null,
    };
    await Promise.all([
      saveThread(workspace, "a.md", threadA),
      saveThread(workspace, "b.md", threadB),
    ]);
    await expect(loadThread(workspace, "a.md")).resolves.toEqual(threadA);
    await expect(loadThread(workspace, "b.md")).resolves.toEqual(threadB);
  });
});
