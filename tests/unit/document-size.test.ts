import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => {
  const state = { userData: "", root: "" };
  return {
    state,
    showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [state.root] })),
  };
});

vi.mock("electron", () => ({
  app: { getPath: () => host.state.userData },
  dialog: { showOpenDialog: host.showOpenDialog },
}));

import { MAX_DOCUMENT_BYTES, projectedDocumentBytes, sha256 } from "../../electron/lib/atomic";
import { applyProposal } from "../../electron/services/threads";
import {
  closeAllWatchers,
  openWorkspaceFolder,
  writeDocument,
} from "../../electron/services/workspace";

let workspace: string;

beforeEach(() => {
  host.state.userData = mkdtempSync(path.join(tmpdir(), "nrvn-userdata-"));
  workspace = mkdtempSync(path.join(tmpdir(), "nrvn-ws-"));
  host.state.root = workspace;
});

afterEach(() => closeAllWatchers());

describe("límite único de documento", () => {
  it("cuenta la expansión CRLF al proyectar el tamaño en disco", () => {
    const content = "\n".repeat(3 * 1024 * 1024);
    expect(projectedDocumentBytes(content, "crlf", false)).toBeGreaterThan(MAX_DOCUMENT_BYTES);
    expect(projectedDocumentBytes(content, "lf", false)).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
  });

  it("rechaza escribir por encima de 5 MB sin tocar el disco", async () => {
    const result = await writeDocument(null, "a.md", "x".repeat(MAX_DOCUMENT_BYTES + 1));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/5 MB/);
    expect(() => readFileSync(path.join(workspace, "a.md"))).toThrow();
  });

  it("rechaza guardar si la expansión CRLF supera el límite en disco", async () => {
    await openWorkspaceFolder(null);
    const file = path.join(workspace, "crlf.md");
    writeFileSync(file, "a\r\nb\r\n", "utf8");
    const result = await writeDocument(null, "crlf.md", "\n".repeat(3 * 1024 * 1024));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/5 MB/);
    expect(readFileSync(file, "utf8")).toBe("a\r\nb\r\n");
  });

  it("rechaza aplicar una propuesta que supera 5 MB y conserva el original", async () => {
    const file = path.join(workspace, "notas.md");
    writeFileSync(file, "old", "utf8");
    const result = await applyProposal(
      {
        relPath: "notas.md",
        expectedHash: sha256("old"),
        prompt: "x",
        blocks: [
          {
            key: "#paragraph:0",
            before: "old",
            after: "x".repeat(MAX_DOCUMENT_BYTES + 1),
          },
        ],
      },
      workspace,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/5 MB/);
    expect(readFileSync(file, "utf8")).toBe("old");
    expect(() => readFileSync(`${file}.nrvn`)).toThrow();
  });
});
