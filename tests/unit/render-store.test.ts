import { beforeEach, describe, expect, it, vi } from "vitest";

const { pendingLoad, pendingSave } = vi.hoisted(() => ({
  pendingLoad: vi.fn(async () => [] as { key: string; anchorKey: string | null }[]),
  pendingSave: vi.fn(async () => undefined),
}));
vi.mock("../../src/lib/ipc", () => ({
  nrvn: { pending: { load: pendingLoad, save: pendingSave } },
}));

import { useDocumentStore } from "../../src/store/document";
import { useSelectionStore } from "../../src/store/selection";

describe("render document operations", () => {
  beforeEach(() => {
    useDocumentStore.getState().newDocument();
    pendingSave.mockClear();
  });
  it("reanchors an edit that expands into three blocks and supports undo/redo", () => {
    useDocumentStore.getState().setContent("one\n\ntwo\n\nthree");
    useDocumentStore.getState().confirmInlineEdit(0, "a\n\nb\n\nc");
    expect(useDocumentStore.getState().content).toBe("a\n\nb\n\nc\n\ntwo\n\nthree");
    expect(useSelectionStore.getState().focus).toBe(2);
    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().content).toContain("one");
    useDocumentStore.getState().redo();
    expect(useDocumentStore.getState().content).toContain("a\n\nb\n\nc");
  });
  it("formats only the explicitly targeted block in a multi-block selection", () => {
    useDocumentStore.getState().setContent("one\n\ntwo\n\nthree");
    useSelectionStore.getState().selectIndexRange(0, 2);
    useDocumentStore.getState().applyBlockFormat("h2", { index: 1 });
    const state = useDocumentStore.getState();
    expect(state.content).toBe("one\n\n## two\n\nthree");
    expect(state.blocks[0].raw).toBe("one");
    expect(state.blocks[1].type).toBe("heading");
    expect(state.blocks[2].raw).toBe("three");
  });
  it("reanchors selection after a multi-block agent proposal", () => {
    useDocumentStore.getState().setContent("one\n\ntwo");
    const key = useDocumentStore.getState().blocks[0].key;
    useDocumentStore.getState().setContent("a\n\nb\n\nc\n\ntwo");
    useDocumentStore.getState().reanchorAfterProposal([{ key, after: "a\n\nb\n\nc" }]);
    expect(useSelectionStore.getState().anchor).toBe(0);
    expect(useSelectionStore.getState().focus).toBe(2);
  });
  it("reanchors multi-block proposals by the first replacement block when keys changed", () => {
    useDocumentStore.getState().setContent("a\n\nb\n\nc\n\ntwo");
    useDocumentStore.getState().reanchorAfterProposal([{ key: "old-key", after: "a\n\nb\n\nc" }]);
    expect(useSelectionStore.getState().anchor).toBe(0);
    expect(useSelectionStore.getState().focus).toBe(2);
  });
  it("inserts and confirms pending text and applies proposals", () => {
    useDocumentStore.getState().setContent("one\n\ntwo");
    useDocumentStore.getState().insertBlockAfter(0, "paragraph");
    expect(pendingSave).toHaveBeenCalled();
    const pending = useDocumentStore.getState().blocks.findIndex((block) => block.pending);
    useDocumentStore.getState().confirmInlineEdit(pending, "new block");
    expect(useDocumentStore.getState().content).toContain("new block");
    useDocumentStore.getState().insertBlockAfter(0, "paragraph");
    const key = useDocumentStore.getState().pending[0].key;
    expect(useDocumentStore.getState().applyPendingProposals([{ key, after: "proposal" }])).toBe(
      true,
    );
    expect(useDocumentStore.getState().content).toContain("proposal");
  });
  it("keeps pending synthetic blocks when CodeMirror updates document content", () => {
    useDocumentStore.getState().setContent("one");
    useDocumentStore.getState().insertBlockAfter(0, "paragraph");
    useDocumentStore.getState().setContent("one");
    expect(useDocumentStore.getState().pending).toHaveLength(1);
    expect(useDocumentStore.getState().blocks.some((block) => block.pending)).toBe(true);
  });
  it("applies a null-anchor pending proposal with document separators", () => {
    useDocumentStore.getState().setContent("one");
    useDocumentStore.getState().setPendingBlock("new-pending-key", true);
    expect(
      useDocumentStore
        .getState()
        .applyPendingProposals([{ key: "new-pending-key", after: "proposal" }]),
    ).toBe(true);
    expect(useDocumentStore.getState().content).toBe("proposal\n\none");
  });
  it("uses current content when pending load resolves", async () => {
    let resolveLoad: ((entries: { key: string; anchorKey: string | null }[]) => void) | undefined;
    pendingLoad.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );
    useDocumentStore.getState().setContent("before");
    const loading = useDocumentStore.getState().loadPendingForDocument();
    useDocumentStore.getState().setContent("after");
    resolveLoad?.([{ key: "late-pending", anchorKey: null }]);
    await loading;
    expect(useDocumentStore.getState().content).toBe("after");
    expect(useDocumentStore.getState().blocks.some((block) => block.key === "late-pending")).toBe(
      true,
    );
  });
  it("splits, merges and inserts agent placeholder as a real pending block", () => {
    useDocumentStore.getState().setContent("one\n\ntwo");
    useDocumentStore.getState().splitInlineEdit(0, "firstsecond", 5);
    expect(useDocumentStore.getState().content).toContain("first\n\nsecond");
    useDocumentStore.getState().mergeInlineEdit(1, "second");
    expect(useDocumentStore.getState().content).toContain("first\nsecond");
    useDocumentStore.getState().insertBlockAfter(null, "agent");
    expect(useDocumentStore.getState().content).toContain(
      "[Describe el contenido que quieres generar]",
    );
    const agent = useDocumentStore.getState().pending[0];
    expect(agent.key).not.toMatch(/^pending-/);
    expect(
      useDocumentStore.getState().applyPendingProposals([{ key: agent.key, after: "generated" }]),
    ).toBe(true);
    expect(useDocumentStore.getState().content).toContain("generated");
  });
});
