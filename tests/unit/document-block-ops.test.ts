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

describe("document block operations", () => {
  beforeEach(() => {
    useDocumentStore.getState().newDocument();
    useDocumentStore.getState().setContent("uno\n\ndos\n\ntres");
    useSelectionStore.getState().selectIndexRange(1, 1);
    pendingLoad.mockClear();
    pendingSave.mockClear();
  });
  it("moves selected blocks and restores the selection through undo/redo", () => {
    expect(useDocumentStore.getState().moveSelectedBlocks("up")).toBe(true);
    expect(useDocumentStore.getState().blocks.map((b) => b.raw)).toEqual(["dos", "uno", "tres"]);
    expect(useSelectionStore.getState().focus).toBe(0);
    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().blocks.map((b) => b.raw)).toEqual(["uno", "dos", "tres"]);
    expect(useSelectionStore.getState().focus).toBe(1);
    useDocumentStore.getState().redo();
    expect(useDocumentStore.getState().blocks.map((b) => b.raw)).toEqual(["dos", "uno", "tres"]);
  });
  it("inserts and selects a pending paragraph after the indicated block", () => {
    const key = useDocumentStore.getState().insertPendingParagraph(0);
    expect(key).toMatch(/^pending-/);
    const blocks = useDocumentStore.getState().blocks;
    expect(blocks[1]?.key).toBe(key);
    expect(blocks[1]?.pending).toBe(true);
    expect(useSelectionStore.getState().focus).toBe(1);
  });
  it("moves a selected block down", () => {
    useSelectionStore.getState().selectIndexRange(0, 0);
    expect(useDocumentStore.getState().moveSelectedBlocks("down")).toBe(true);
    expect(useDocumentStore.getState().blocks.map((b) => b.raw)).toEqual(["dos", "uno", "tres"]);
  });
  it("preserves a two-block selection after moving the range", () => {
    useSelectionStore.getState().selectIndexRange(1, 2);
    expect(useDocumentStore.getState().moveSelectedBlocks("up")).toBe(true);
    expect(useDocumentStore.getState().blocks.map((block) => block.raw)).toEqual([
      "dos",
      "tres",
      "uno",
    ]);
    expect(useSelectionStore.getState().anchor).toBe(0);
    expect(useSelectionStore.getState().focus).toBe(1);
  });
  it("duplicates and deletes with undo/redo", () => {
    expect(useDocumentStore.getState().duplicateSelectedBlocks()).toBe(true);
    expect(useDocumentStore.getState().blocks.map((b) => b.raw)).toEqual([
      "uno",
      "dos",
      "dos",
      "tres",
    ]);
    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().blocks).toHaveLength(3);
    useDocumentStore.getState().deleteSelectedBlocks();
    expect(useDocumentStore.getState().blocks.map((b) => b.raw)).toEqual(["uno", "tres"]);
    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().blocks).toHaveLength(3);
    useDocumentStore.getState().redo();
    expect(useDocumentStore.getState().blocks).toHaveLength(2);
  });
  it("rejects a pending selection and leaves it selected", () => {
    useDocumentStore.getState().setPendingBlock("pending-test", true);
    const index = useDocumentStore.getState().blocks.findIndex((b) => b.pending);
    useSelectionStore.getState().selectIndexRange(index, index);
    expect(useDocumentStore.getState().deleteSelectedBlocks()).toBe(false);
    expect(useSelectionStore.getState().focus).toBe(index);
  });
  it("keeps pending anchored to the original block, not its duplicate", () => {
    const blocks = useDocumentStore.getState().blocks;
    const threeKey = blocks[2].key;
    useSelectionStore.getState().selectIndexRange(2, 2);
    useDocumentStore.getState().insertBlockAfter(2, "paragraph");
    expect(useDocumentStore.getState().pending[0].anchorKey).toBe(threeKey);

    useSelectionStore.getState().selectIndexRange(1, 1);
    expect(useDocumentStore.getState().duplicateSelectedBlocks()).toBe(true);
    const state = useDocumentStore.getState();
    const threeIndex = state.blocks.findIndex((block) => block.key === threeKey);
    const originalThreeIndex = state.blocks.findIndex((block) => block.raw === "tres");
    const duplicateIndex = state.blocks.findIndex(
      (block, index) => index > 1 && block.raw === "dos",
    );
    const pendingIndex = state.blocks.findIndex((block) => block.pending);
    expect(originalThreeIndex).toBeGreaterThan(duplicateIndex);
    expect(state.pending[0].anchorKey).toBe(state.blocks[originalThreeIndex].key);
    expect(pendingIndex).toBe(originalThreeIndex + 1);
    expect(state.blocks[threeIndex].raw).toBe("dos");
    expect(state.pending[0].anchorKey).not.toBe(state.blocks[threeIndex].key);
  });
  it("maps pending anchors correctly when selections follow synthetic blocks", () => {
    useDocumentStore.getState().insertBlockAfter(0, "paragraph");
    useDocumentStore.getState().insertBlockAfter(2, "paragraph");
    const before = useDocumentStore.getState();
    expect(before.blocks.map((block) => (block.pending ? "P" : block.raw))).toEqual([
      "uno",
      "P",
      "dos",
      "P",
      "tres",
    ]);
    const [p1, p2] = before.pending;
    const tresIndex = before.blocks.findIndex((block) => block.raw === "tres");
    useSelectionStore.getState().selectIndexRange(tresIndex, tresIndex);

    expect(useDocumentStore.getState().moveSelectedBlocks("up")).toBe(true);
    const after = useDocumentStore.getState();
    const uno = after.blocks.find((block) => block.raw === "uno");
    const tres = after.blocks.find((block) => block.raw === "tres");
    const p1After = after.pending.find((entry) => entry.key === p1.key);
    const p2After = after.pending.find((entry) => entry.key === p2.key);
    expect(p1After?.anchorKey).toBe(uno?.key);
    expect(p2After?.anchorKey).toBe(tres?.key);
    const tresAfterIndex = after.blocks.findIndex((block) => block.raw === "tres");
    expect(after.blocks[tresAfterIndex + 1]?.key).toBe(p2.key);
    expect(after.blocks.findIndex((block) => block.key === p2.key)).not.toBe(0);
  });
  it("keeps a pending block attached to the selected block when moving down", () => {
    useSelectionStore.getState().selectIndexRange(1, 1);
    useDocumentStore.getState().insertBlockAfter(1, "paragraph");
    const before = useDocumentStore.getState();
    const pending = before.pending[0];
    const dos = before.blocks.find((block) => block.raw === "dos");
    expect(pending.anchorKey).toBe(dos?.key);

    useSelectionStore.getState().selectIndexRange(1, 1);
    expect(useDocumentStore.getState().moveSelectedBlocks("down")).toBe(true);
    const after = useDocumentStore.getState();
    expect(after.blocks[2].raw).toBe("dos");
    expect(after.pending[0].anchorKey).toBe(after.blocks[2].key);
    expect(after.blocks[3].key).toBe(pending.key);
  });
  it("reanchors a pending block after deletion of its anchor to the nearest gap", () => {
    const originalAnchor = useDocumentStore.getState().blocks[1].key;
    useSelectionStore.getState().selectIndexRange(1, 1);
    useDocumentStore.getState().insertBlockAfter(1, "paragraph");
    expect(useDocumentStore.getState().pending[0].anchorKey).toBe(originalAnchor);

    useSelectionStore.getState().selectIndexRange(1, 1);
    expect(useDocumentStore.getState().deleteSelectedBlocks()).toBe(true);
    const state = useDocumentStore.getState();
    expect(state.pending[0].anchorKey).toBe(state.blocks[0].key);
    expect(state.blocks[1].pending).toBe(true);
    expect(state.blocks[2].raw).toBe("tres");
  });
});
