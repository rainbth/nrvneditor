import { beforeEach, describe, expect, it, vi } from "vitest";

const { readDocument, pendingLoad, pendingSave } = vi.hoisted(() => ({
  readDocument: vi.fn(async () => ({ content: "one" })),
  pendingLoad: vi.fn(async () => [{ key: "old", anchorKey: null }]),
  pendingSave: vi.fn(async () => undefined),
}));
vi.mock("../../src/lib/ipc", () => ({
  nrvn: { workspace: { readDocument }, pending: { load: pendingLoad, save: pendingSave } },
}));

import { useDocumentStore } from "../../src/store/document";
import { useSelectionStore } from "../../src/store/selection";
import { useUiStore } from "../../src/store/ui";

describe("document transient state", () => {
  beforeEach(() => {
    useDocumentStore.getState().newDocument();
    pendingLoad.mockClear();
    pendingSave.mockClear();
  });

  it("purges persisted pending and clears editing state when opening", async () => {
    useDocumentStore.setState({ pending: [{ key: "old", anchorKey: null }] });
    useDocumentStore.getState().setPendingBlock("old", true);
    useDocumentStore.setState({ editRequest: { key: "one", caret: "end", token: 1 } });
    useSelectionStore.getState().selectIndexRange(0, 0);
    useUiStore.setState({ activeBlockElement: {} as HTMLElement });
    const previousExitToken = useDocumentStore.getState().editExitToken;

    await useDocumentStore.getState().openDocument("guide.md");

    expect(useDocumentStore.getState().pending).toEqual([]);
    expect(useDocumentStore.getState().blocks.some((block) => block.pending)).toBe(false);
    expect(pendingSave).toHaveBeenCalledWith("guide.md", []);
    expect(pendingLoad).not.toHaveBeenCalled();
    expect(useDocumentStore.getState().editRequest).toBeNull();
    expect(useDocumentStore.getState().editExitToken).toBe(previousExitToken + 1);
    expect(useSelectionStore.getState()).toMatchObject({ anchor: null, focus: null, mode: "none" });
    expect(useUiStore.getState().activeBlockElement).toBeNull();
  });

  it("retains valid in-memory pending on reload without loading persisted state", async () => {
    readDocument.mockResolvedValueOnce({ content: "one" });
    useDocumentStore.setState({
      path: "guide.md",
      localId: "guide.md",
      content: "one",
      original: "one",
      pending: [{ key: "pending-one", anchorKey: null }],
    });
    await useDocumentStore.getState().reload();
    expect(useDocumentStore.getState().pending).toEqual([{ key: "pending-one", anchorKey: null }]);
    expect(pendingLoad).not.toHaveBeenCalled();
  });
});
