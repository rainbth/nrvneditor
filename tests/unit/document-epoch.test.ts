import { beforeEach, describe, expect, it, vi } from "vitest";

const { readDocument, writeDocument, savePending } = vi.hoisted(() => ({
  readDocument: vi.fn(),
  writeDocument: vi.fn(),
  savePending: vi.fn(async () => undefined),
}));
vi.mock("../../src/lib/ipc", () => ({
  nrvn: { workspace: { readDocument, writeDocument }, pending: { save: savePending } },
}));

import { useDocumentStore } from "../../src/store/document";

describe("document load epochs", () => {
  beforeEach(() => {
    useDocumentStore.getState().newDocument();
    readDocument.mockReset();
    writeDocument.mockReset();
    savePending.mockClear();
  });

  it("discards an older open result", async () => {
    let resolveA: ((value: unknown) => void) | null = null;
    let resolveB: ((value: unknown) => void) | null = null;
    readDocument.mockImplementation((path: string) => {
      return new Promise<unknown>((resolve) => {
        if (path === "a") resolveA = resolve;
        else resolveB = resolve;
      });
    });
    const a = useDocumentStore.getState().openDocument("a");
    const b = useDocumentStore.getState().openDocument("b");
    resolveB?.({ content: "b" });
    await b;
    resolveA?.({ content: "a" });
    await a;
    expect(useDocumentStore.getState()).toMatchObject({ path: "b", content: "b" });
  });

  it("discards an obsolete reload result", async () => {
    useDocumentStore.setState({ path: "a", localId: "a", content: "a", original: "a" });
    let resolveFirst: ((value: unknown) => void) | null = null;
    let resolveSecond: ((value: unknown) => void) | null = null;
    readDocument
      .mockImplementationOnce(
        () =>
          new Promise<unknown>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<unknown>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const r1 = useDocumentStore.getState().reload();
    const r2 = useDocumentStore.getState().reload();
    resolveSecond?.({ content: "disk-2" });
    await r2;
    resolveFirst?.({ content: "disk-1" });
    await r1;
    expect(useDocumentStore.getState()).toMatchObject({ content: "disk-2", dirty: false });
  });

  it("keeps the previous document when opening fails", async () => {
    useDocumentStore.setState({
      path: "old.md",
      localId: "old.md",
      content: "keep",
      original: "keep",
      dirty: false,
    });
    readDocument.mockRejectedValueOnce(new Error("boom"));
    await useDocumentStore.getState().openDocument("bad.md");
    expect(useDocumentStore.getState()).toMatchObject({
      path: "old.md",
      content: "keep",
      dirty: false,
    });
  });

  it("saves before reopening the same path", async () => {
    useDocumentStore.setState({
      path: "a",
      localId: "a",
      content: "changed",
      original: "old",
      dirty: true,
    });
    writeDocument.mockResolvedValueOnce({ ok: true, hash: "h" });
    readDocument.mockResolvedValueOnce({ content: "changed" });
    await useDocumentStore.getState().openDocument("a");
    expect(writeDocument).toHaveBeenCalledWith("a", "changed");
  });
});
