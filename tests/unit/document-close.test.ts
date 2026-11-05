import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeDocument, saveDocumentAs } = vi.hoisted(() => ({
  writeDocument: vi.fn(),
  saveDocumentAs: vi.fn(),
}));
vi.mock("../../src/lib/ipc", () => ({
  nrvn: { workspace: { writeDocument, saveDocumentAs } },
}));

import { useDocumentStore } from "../../src/store/document";

describe("close document preserves failed saves", () => {
  beforeEach(() => {
    useDocumentStore.getState().newDocument();
    writeDocument.mockReset();
    saveDocumentAs.mockReset();
  });
  it("retains a dirty file when write fails", async () => {
    useDocumentStore.getState().newDocument();
    useDocumentStore.setState({
      path: "a",
      localId: "a",
      content: "changed",
      original: "old",
      dirty: true,
    });
    writeDocument.mockResolvedValueOnce({ ok: false, error: "failed" });
    expect(await useDocumentStore.getState().closeDocument()).toBe(false);
    expect(useDocumentStore.getState()).toMatchObject({
      path: "a",
      content: "changed",
      dirty: true,
    });
  });
  it("retains an untitled draft when save-as is canceled", async () => {
    useDocumentStore.setState({ content: "draft", dirty: true });
    saveDocumentAs.mockResolvedValueOnce({ canceled: true });
    expect(await useDocumentStore.getState().closeDocument()).toBe(false);
    expect(useDocumentStore.getState().content).toBe("draft");
  });

  it("closes a document after a successful save", async () => {
    useDocumentStore.setState({
      path: "a",
      localId: "a",
      content: "changed",
      original: "old",
      dirty: true,
    });
    writeDocument.mockResolvedValueOnce({ ok: true, hash: "h" });
    expect(await useDocumentStore.getState().closeDocument()).toBe(true);
    expect(useDocumentStore.getState()).toMatchObject({
      path: null,
      content: "",
      original: "",
      dirty: false,
    });
  });
});
