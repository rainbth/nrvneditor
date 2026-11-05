import { create } from "zustand";
import type { Block } from "../lib/blocks";
import { indexRangeForKeys, rangeBetween } from "../lib/ranges";
import { sectionBlocks, sectionRange } from "../lib/sections";

export type SelectionMode = "block" | "section" | "range" | "none";

export interface SelectionState {
  anchor: number | null;
  focus: number | null;
  mode: SelectionMode;
  selectBlock: (index: number) => void;
  selectSection: (index: number) => void;
  extendTo: (index: number) => void;
  /** Selecciona un rango contiguo de bloques normalizando el orden de entrada. */
  selectIndexRange: (start: number, end: number, mode?: "block" | "range") => void;
  selectBlockRange: (startKey: string, endKey: string, blocks?: Block[]) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  anchor: null,
  focus: null,
  mode: "none",

  selectBlock: (index) => set({ anchor: index, focus: index, mode: "block" }),

  selectSection: (index) => set({ anchor: index, focus: index, mode: "section" }),

  extendTo: (index) =>
    set((state) =>
      state.anchor === null
        ? // Sin ancla previa no hay rango: se selecciona el bloque destino.
          { anchor: index, focus: index, mode: "block" }
        : { focus: index, mode: "range" },
    ),

  selectIndexRange: (start, end, mode) =>
    set(() => {
      const from = Math.max(0, Math.min(start, end));
      const to = Math.max(0, Math.max(start, end));
      return { anchor: from, focus: to, mode: mode ?? (from === to ? "block" : "range") };
    }),

  selectBlockRange: (startKey, endKey, blocks) => {
    const range = indexRangeForKeys(blocks ?? blockSource(), startKey, endKey);
    if (range) useSelectionStore.getState().selectIndexRange(range.start, range.end);
  },

  clear: () => set({ anchor: null, focus: null, mode: "none" }),
}));

let blockSource: () => Block[] = () => [];
export function setSelectionBlockSource(source: () => Block[]): void {
  blockSource = source;
}
export function selectBlockRange(startKey: string, endKey: string, blocks?: Block[]): void {
  const range = indexRangeForKeys(blocks ?? blockSource(), startKey, endKey);
  if (range) useSelectionStore.getState().selectIndexRange(range.start, range.end);
}

export type SelectionSnapshot = Pick<SelectionState, "anchor" | "focus" | "mode">;

/** Índices de bloque que componen la selección actual, en orden de documento. */
export function selectedIndexes(state: SelectionSnapshot, blocks: Block[]): number[] {
  if (state.anchor === null || state.mode === "none" || blocks.length === 0) return [];
  if (state.mode === "section") {
    const { start, end } = sectionRange(blocks, state.anchor);
    if (start === -1) return [];
    const indexes: number[] = [];
    for (let index = start; index <= end; index += 1) indexes.push(index);
    return indexes;
  }
  if (state.mode === "range" && state.focus !== null) {
    return rangeBetween(blocks, state.anchor, state.focus);
  }
  return blocks[state.anchor] ? [state.anchor] : [];
}

/** Selector puro: deriva los bloques seleccionados a partir del estado. */
export function selectedBlocks(state: SelectionSnapshot, blocks: Block[]): Block[] {
  if (state.anchor === null || state.mode === "none") return [];
  if (state.mode === "section") return sectionBlocks(blocks, state.anchor);
  if (state.mode === "range" && state.focus !== null) {
    return rangeBetween(blocks, state.anchor, state.focus).map((index) => blocks[index]);
  }
  const block = blocks[state.anchor];
  return block ? [block] : [];
}
