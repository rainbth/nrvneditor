import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ userData: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => host.userData },
}));

import { MAX_DOCUMENT_BYTES, readTextFile, sha256 } from "../../electron/lib/atomic";
import { applyDocumentProposal, loadThread, saveThread } from "../../electron/services/threads";

let workspace: string;

beforeEach(() => {
  host.userData = mkdtempSync(path.join(tmpdir(), "nrvn-userdata-"));
  workspace = mkdtempSync(path.join(tmpdir(), "nrvn-ws-"));
});

describe("applyDocumentProposal", () => {
  it("escribe el documento completo, guarda snapshot previo y devuelve el hash LF", async () => {
    const file = path.join(workspace, "guia.md");
    writeFileSync(file, "# Viejo\n\ncontenido\n", "utf8");

    const result = await applyDocumentProposal(
      {
        relPath: "guia.md",
        expectedHash: sha256("# Viejo\n\ncontenido\n"),
        prompt: "reescribe todo",
        content: "# Nuevo\n\ncontenido nuevo\n",
      },
      workspace,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readFileSync(file, "utf8")).toBe("# Nuevo\n\ncontenido nuevo\n");
    expect(result.hash).toBe(sha256("# Nuevo\n\ncontenido nuevo\n"));
    expect(result.snapshotPath.startsWith(host.userData)).toBe(true);
    expect(existsSync(result.snapshotPath)).toBe(true);
    expect(readFileSync(result.snapshotPath, "utf8")).toBe("# Viejo\n\ncontenido\n");
  });

  it("preserva CRLF y BOM al escribir contenido normalizado a LF", async () => {
    const file = path.join(workspace, "crlf.md");
    writeFileSync(file, "\uFEFFa\r\nb\r\n", "utf8");

    const result = await applyDocumentProposal(
      {
        relPath: "crlf.md",
        expectedHash: sha256("a\nb\n"),
        prompt: "x",
        content: "nuevo 1\nnuevo 2\n",
      },
      workspace,
    );

    expect(result.ok).toBe(true);
    const written = readFileSync(file, "utf8");
    expect(written).toBe("\uFEFFnuevo 1\r\nnuevo 2\r\n");
  });

  it("sincroniza sidecar al aplicar documento y rechaza lecturas mayores a 5 MB", async () => {
    const file = path.join(workspace, "sidecar.md");
    writeFileSync(file, "old");
    const result = await applyDocumentProposal(
      {
        relPath: "sidecar.md",
        expectedHash: sha256("old"),
        prompt: "x",
        content: "new",
      },
      workspace,
    );
    expect(result.ok).toBe(true);
    expect(existsSync(`${file}.nrvn`)).toBe(true);
    const huge = path.join(workspace, "huge.md");
    writeFileSync(huge, Buffer.alloc(MAX_DOCUMENT_BYTES + 1));
    expect(() => readTextFile(huge)).toThrow(/5 MB/);
  });

  it("permite escribir contenido en un documento vacío", async () => {
    const file = path.join(workspace, "vacio.md");
    writeFileSync(file, "", "utf8");

    const result = await applyDocumentProposal(
      {
        relPath: "vacio.md",
        expectedHash: sha256(""),
        prompt: "x",
        content: "# Documento nuevo\n",
      },
      workspace,
    );

    expect(result.ok).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("# Documento nuevo\n");
  });

  it("rechaza si el documento cambió en disco y no escribe", async () => {
    const file = path.join(workspace, "notas.md");
    writeFileSync(file, "actual\n", "utf8");

    const result = await applyDocumentProposal(
      {
        relPath: "notas.md",
        expectedHash: sha256("viejo\n"),
        prompt: "x",
        content: "nuevo\n",
      },
      workspace,
    );

    expect(result).toEqual({
      ok: false,
      error: "El documento cambió en disco. Recarga antes de aplicar.",
    });
    expect(readFileSync(file, "utf8")).toBe("actual\n");
  });

  it("no escribe fuera de la raíz del workspace", async () => {
    const result = await applyDocumentProposal(
      {
        relPath: "../fuera.md",
        expectedHash: sha256("x"),
        prompt: "x",
        content: "y",
      },
      workspace,
    );
    expect(result.ok).toBe(false);
  });

  it("rechaza contenido resultante mayor a 5 MB antes de snapshot o escritura", async () => {
    const file = path.join(workspace, "large.md");
    writeFileSync(file, "old");
    const result = await applyDocumentProposal(
      {
        relPath: "large.md",
        expectedHash: sha256("old"),
        prompt: "x",
        content: "x".repeat(5 * 1024 * 1024 + 1),
      },
      workspace,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/5 MB/);
    expect(readFileSync(file, "utf8")).toBe("old");
    expect(existsSync(path.join(host.userData, "workspaces"))).toBe(false);
  });
});

describe("compatibilidad de hilos antiguos", () => {
  it("carga propuestas sin kind/document como bloques con document null", async () => {
    const digest = createHash("sha1").update(workspace).digest("hex");
    const dir = path.join(host.userData, "workspaces", digest);
    writeFileSync(path.join(workspace, "notas.md"), "x\n", "utf8");

    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "threads.json"),
      JSON.stringify({
        version: 1,
        threads: {
          "notas.md": {
            sessionID: "ses_1",
            messages: [],
            proposal: {
              id: "p1",
              createdAt: 1,
              prompt: "x",
              blocks: [{ key: "#paragraph:0", before: "x", after: "y" }],
            },
          },
        },
      }),
      "utf8",
    );

    const thread = await loadThread(workspace, "notas.md");
    expect(thread.proposal).not.toBeNull();
    expect(thread.proposal?.kind).toBe("blocks");
    expect(thread.proposal?.document).toBeNull();
  });

  it("una propuesta de documento sin document se rechaza al guardar", async () => {
    await expect(
      saveThread(workspace, "notas.md", {
        sessionID: null,
        messages: [],
        proposal: {
          id: "p1",
          createdAt: 1,
          prompt: "x",
          kind: "document",
          blocks: [],
          document: null,
        },
      }),
    ).rejects.toThrow();
  });
});
