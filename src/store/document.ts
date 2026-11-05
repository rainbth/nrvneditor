import { create } from "zustand";
import { docKeyForDocument, markThreadMigration } from "../lib/agent-session";
import { deleteBlock, duplicateBlock, moveBlockRange } from "../lib/block-ops";
import { type Block, isFrontmatterBlock, splitBlocks } from "../lib/blocks";
import { applyBlockFormat, type BlockFormat, canEditInlineBlock } from "../lib/format-actions";
import { hashBlock } from "../lib/hash";
import { insertRawsAfter, joinBlockRaws, splitBlockRaw } from "../lib/insert";
import { nrvn } from "../lib/ipc";
import { extractOutline, type OutlineItem } from "../lib/markdown";
import { initialDocument } from "../lib/startup";
import { useAnnotationsStore } from "./annotations";
import {
  type SelectionMode,
  selectBlockRange,
  selectedIndexes,
  setSelectionBlockSource,
  useSelectionStore,
} from "./selection";
import { useUiStore } from "./ui";
import { useWorkspaceStore } from "./workspace";

export type SaveState = "saved" | "saving" | "dirty" | "error";
export type DocumentStatus = "idle" | "loading" | "ready" | "error";
export interface PendingBlock {
  key: string;
  anchorKey: string | null;
}
interface HistoryEntry {
  content: string;
  pending: PendingBlock[];
  anchor: number | null;
  focus: number | null;
  mode: SelectionMode;
}
const undoStack: HistoryEntry[] = [];
const redoStack: HistoryEntry[] = [];
let savePromise: Promise<boolean> | null = null;
function captureHistory(): HistoryEntry {
  const selection = useSelectionStore.getState();
  const state = useDocumentStore.getState();
  return {
    content: state.content,
    pending: state.pending.map((entry) => ({ ...entry })),
    anchor: selection.anchor,
    focus: selection.focus,
    mode: selection.mode,
  };
}
function pushHistory(entry: HistoryEntry): void {
  undoStack.push(entry);
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
  useDocumentStore.setState({
    undoDepth: undoStack.length,
    redoDepth: 0,
    canUndo: true,
    canRedo: false,
  });
}

export interface DocumentState {
  /** Identificador local del documento abierto (borrador o archivo). */
  localId: string;
  path: string | null;
  content: string;
  original: string;
  blocks: Block[];
  outline: OutlineItem[];
  dirty: boolean;
  saving: boolean;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;
  /** Hash del último contenido escrito por esta ventana (eco del bridge). */
  lastWriteHash: string | null;
  openEpoch: number;
  externalChange: { hash: string; at: number } | null;
  error: string | null;
  loadMs: number | null;
  status: DocumentStatus;
  openDocument: (path: string) => Promise<void>;
  reload: () => Promise<void>;
  setContent: (text: string) => void;
  newDocument: () => void;
  save: () => Promise<boolean>;
  saveAs: () => Promise<boolean>;
  closeDocument: () => Promise<boolean>;
  noteExternalChange: (hash: string) => void;
  resolveExternalChange: (action: "reload" | "overwrite") => Promise<void>;
  markSaved: () => void;
  pending: PendingBlock[];
  editRequest: { key: string; caret: "start" | "end" | number; token: number } | null;
  editExitToken: number;
  undoDepth: number;
  redoDepth: number;
  canUndo: boolean;
  canRedo: boolean;
  requestInlineEdit: (key: string, caret?: "start" | "end" | number) => void;
  clearInlineEdit: () => void;
  requestInlineEditExit: () => void;
  applyBlockFormat: (format: BlockFormat, target?: { index: number; text?: string }) => void;
  confirmInlineEdit: (index: number, text: string, versionSource?: string) => void;
  splitInlineEdit: (index: number, text: string, caret: number) => void;
  mergeInlineEdit: (index: number, text: string) => void;
  insertBlockAfter: (index: number | null, kind: "paragraph" | "section" | "agent") => void;
  insertPendingParagraph: (index: number | null) => string | null;
  removePendingBlock: (index: number) => void;
  setPendingBlock: (key: string, pending: boolean) => void;
  applyPendingProposals: (parsed: { key: string; after: string }[]) => boolean;
  reanchorAfterProposal: (parsed: { key: string; after: string }[]) => void;
  undo: () => void;
  redo: () => void;
  loadPendingForDocument: () => Promise<void>;
  persistPending: () => Promise<void>;
  moveSelectedBlocks: (direction: "up" | "down") => boolean;
  duplicateSelectedBlocks: () => boolean;
  deleteSelectedBlocks: () => boolean;
}

function derive(text: string, original: string) {
  const blocks = splitBlocks(text);
  return {
    blocks,
    outline: extractOutline(blocks),
    dirty: text !== original,
    saveState: (text !== original ? "dirty" : "saved") as SaveState,
  };
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  ...initialDocument(),
  pending: [],
  editRequest: null,
  editExitToken: 0,
  undoDepth: 0,
  redoDepth: 0,
  canUndo: false,
  canRedo: false,
  openEpoch: 0,
  externalChange: null,

  openDocument: async (path) => {
    const epoch = get().openEpoch + 1;
    set({ openEpoch: epoch });
    const state = get();
    let previous = state;
    // Cambiar de documento con cambios pendientes: guarda (await) antes de cargar.
    if (state.dirty) {
      let ok = await state.save();
      if (get().openEpoch !== epoch) return;
      const afterSave = get();
      if (
        ok &&
        afterSave.dirty &&
        afterSave.externalChange === null &&
        afterSave.saveError === null
      ) {
        ok = await get().save();
        if (get().openEpoch !== epoch) return;
      }
      if (!ok || get().dirty) {
        const current = get();
        useUiStore
          .getState()
          .setToast(
            current.externalChange !== null
              ? "El archivo cambió en disco: recarga o sobrescribe antes de cambiar de documento."
              : (current.saveError ?? "No se pudo guardar; se conserva el documento actual."),
          );
        return;
      }
      previous = get();
    }
    set({ status: "loading", error: null, path });
    const started = performance.now();
    try {
      const payload = await nrvn.workspace.readDocument(path);
      if (get().openEpoch !== epoch) return;
      const elapsed = performance.now() - started;
      console.info("[nrvn] open ms=", elapsed);
      undoStack.length = 0;
      redoStack.length = 0;
      useSelectionStore.getState().clear();
      set({
        localId: path,
        path,
        content: payload.content,
        original: payload.content,
        ...derive(payload.content, payload.content),
        loadMs: elapsed,
        status: "ready",
        error: null,
        saving: false,
        saveError: null,
        lastSavedAt: null,
        lastWriteHash: null,
        externalChange: null,
        pending: [],
        editRequest: null,
        editExitToken: previous.editExitToken + 1,
        undoDepth: 0,
        redoDepth: 0,
        canUndo: false,
        canRedo: false,
      });
      void nrvn.pending.save(docKeyForDocument(path, path), []).catch(() => undefined);
      useUiStore.getState().resetEditing();
      if (payload.metadataWarning) useUiStore.getState().setToast(payload.metadataWarning);
    } catch (reason: unknown) {
      if (get().openEpoch !== epoch) return;
      const message = messageOf(reason, "No se pudo abrir el archivo");
      set({
        path: previous.path,
        localId: previous.localId,
        content: previous.content,
        original: previous.original,
        pending: previous.pending,
        ...deriveWithPending(previous.content, previous.original, previous.pending),
        status: previous.status,
        error: message,
        externalChange: previous.externalChange,
        saveError: previous.saveError,
        saving: previous.saving,
        lastWriteHash: previous.lastWriteHash,
      });
      useUiStore.getState().setToast(message);
    }
  },

  reload: async () => {
    const path = get().path;
    if (path === null) return;
    if (savePromise !== null) await savePromise;
    const epoch = get().openEpoch + 1;
    set({ openEpoch: epoch });
    const previous = get();
    set({ status: "loading" });
    try {
      const payload = await nrvn.workspace.readDocument(path);
      if (get().openEpoch !== epoch) return;
      const parsedBlocks = splitBlocks(payload.content);
      const valid = previous.pending.filter(
        (entry) =>
          entry.anchorKey === null ||
          parsedBlocks.some((block) => block.key === entry.anchorKey || block.key === entry.key),
      );
      undoStack.length = 0;
      redoStack.length = 0;
      useSelectionStore.getState().clear();
      set({
        content: payload.content,
        original: payload.content,
        ...derive(payload.content, payload.content),
        status: "ready",
        error: null,
        saveError: null,
        saving: false,
        lastWriteHash: null,
        externalChange: null,
        pending: valid,
        ...deriveWithPending(payload.content, payload.content, valid),
        editRequest: null,
        editExitToken: previous.editExitToken + 1,
        undoDepth: 0,
        redoDepth: 0,
        canUndo: false,
        canRedo: false,
      });
    } catch (reason: unknown) {
      if (get().openEpoch !== epoch) return;
      const message = messageOf(reason, "No se pudo recargar el archivo");
      set({
        status: previous.status,
        error: message,
        externalChange: previous.externalChange,
      });
      useUiStore.getState().setToast(message);
    }
  },

  setContent: (text) => {
    undoStack.length = 0;
    redoStack.length = 0;
    set((state) => {
      return {
        content: text,
        ...deriveWithPending(text, state.original, state.pending),
        undoDepth: 0,
        redoDepth: 0,
        canUndo: false,
        canRedo: false,
        // Editar tras un error habilita un nuevo intento de autosave.
        saveError: null,
        // Mientras una escritura está en vuelo el indicador sigue en "Guardando…".
        ...(state.saving ? { saveState: "saving" as SaveState } : {}),
      };
    });
  },

  newDocument: () => {
    undoStack.length = 0;
    redoStack.length = 0;
    useSelectionStore.getState().clear();
    set({
      ...initialDocument(),
      openEpoch: get().openEpoch + 1,
      externalChange: null,
      pending: [],
      editRequest: null,
      editExitToken: get().editExitToken + 1,
      undoDepth: 0,
      redoDepth: 0,
      canUndo: false,
      canRedo: false,
    });
    useUiStore.getState().resetEditing();
  },

  save: async () => {
    const state = get();
    if (state.externalChange !== null) return false;
    // Un documento sin título siempre abre «Guardar como…», aunque esté vacío.
    if (state.path === null) return get().saveAs();
    if (state.saving) return savePromise ?? false;
    if (!state.dirty) {
      set({ saveState: "saved", saveError: null });
      return true;
    }

    const path = state.path;
    const content = state.content;
    set({ saving: true, saveState: "saving", saveError: null });
    const runSave = async (): Promise<boolean> => {
      try {
        const result = await nrvn.workspace.writeDocument(path, content);
        if (!result.ok) {
          set({ saving: false, saveState: "error", saveError: result.error });
          return false;
        }
        set((current) => {
          const sameDocument = current.path === path;
          const original = sameDocument ? content : current.original;
          const dirty = current.content !== original;
          return {
            saving: false,
            original,
            dirty,
            saveState: dirty ? "dirty" : "saved",
            saveError: null,
            lastSavedAt: Date.now(),
            lastWriteHash: result.hash,
          };
        });
        if (result.warning) useUiStore.getState().setToast(result.warning);
        return true;
      } catch (reason: unknown) {
        set({
          saving: false,
          saveState: "error",
          saveError: messageOf(reason, "No se pudo guardar el archivo"),
        });
        return false;
      }
    };
    const pendingSave = runSave();
    savePromise = pendingSave;
    try {
      return await pendingSave;
    } finally {
      if (savePromise === pendingSave) savePromise = null;
    }
  },

  closeDocument: async () => {
    const state = get();
    if (state.dirty || state.saving) {
      let ok = await state.save();
      const afterSave = get();
      if (
        ok &&
        afterSave.dirty &&
        afterSave.externalChange === null &&
        afterSave.saveError === null
      ) {
        ok = await get().save();
      }
      const current = get();
      if (!ok || current.dirty || current.path === null) return false;
    }
    get().newDocument();
    return true;
  },
  noteExternalChange: (hash) =>
    set((state) =>
      state.dirty && state.externalChange === null
        ? { externalChange: { hash, at: Date.now() } }
        : {},
    ),
  resolveExternalChange: async (action) => {
    if (action === "reload") {
      await get().reload();
      return;
    }
    set({ externalChange: null });
    await get().save();
  },

  saveAs: async () => {
    const state = get();
    if (state.saving) return false;

    // El descarte del post-it vive por `localId`; al guardar el borrador cambia
    // a la ruta relativa y hay que arrastrar la marca para que no reaparezca.
    const oldLocalId = state.localId;
    const previousLocalId = oldLocalId;
    const content = state.content;
    set({ saving: true, saveState: "saving", saveError: null });
    try {
      const result = await nrvn.workspace.saveDocumentAs(
        content,
        previousLocalId,
        !previousLocalId.startsWith("untitled-"),
      );
      if (result.canceled) {
        set((current) => ({
          saving: false,
          saveState:
            current.content !== current.original ? ("dirty" as SaveState) : ("saved" as SaveState),
          saveError: null,
        }));
        return false;
      }
      if (result.warning) useUiStore.getState().setToast(result.warning);
      try {
        if (
          typeof localStorage !== "undefined" &&
          localStorage.getItem(`nrvn.agent-note.dismissed.${oldLocalId}`) !== null
        ) {
          localStorage.setItem(`nrvn.agent-note.dismissed.${result.relPath}`, "1");
        }
      } catch {
        // Sin almacenamiento: la marca no se puede copiar, pero el guardado sigue.
      }
      // Solo un borrador sin ruta migra su hilo: si ya tenía archivo, el hilo
      // pertenece a la ruta anterior y no debe arrastrarse.
      if (previousLocalId.startsWith("untitled-")) {
        markThreadMigration(previousLocalId, result.relPath);
      }
      set({
        localId: result.relPath,
        path: result.relPath,
        original: content,
        dirty: false,
        saving: false,
        saveState: "saved",
        saveError: null,
        lastSavedAt: Date.now(),
        lastWriteHash: result.hash,
        externalChange: null,
        status: "ready",
        error: null,
      });
      if (!previousLocalId.startsWith("untitled-") && state.pending.length > 0) {
        set({ pending: [], ...deriveWithPending(content, content, []) });
      }
      if (state.pending.length > 0) {
        if (previousLocalId.startsWith("untitled-")) {
          const oldDocKey = docKeyForDocument(null, previousLocalId);
          const newDocKey = docKeyForDocument(result.relPath, result.relPath);
          void nrvn.pending
            .save(newDocKey, state.pending)
            .then(() => nrvn.pending.save(oldDocKey, []))
            .catch(() => undefined);
        } else {
          void nrvn.pending.save(result.relPath, []).catch(() => undefined);
        }
      }
      useWorkspaceStore.getState().setRootFromSave(result.root, result.name);
      await useWorkspaceStore.getState().refreshTree();
      if (!previousLocalId.startsWith("untitled-") && result.relPath !== previousLocalId) {
        await useAnnotationsStore.getState().loadForDocument(result.relPath);
        useUiStore
          .getState()
          .setToast(
            "Copia guardada. El historial y los comentarios quedan en el documento original.",
          );
      }
      return true;
    } catch (reason: unknown) {
      set({
        saving: false,
        saveState: "error",
        saveError: messageOf(reason, "No se pudo guardar el documento"),
      });
      return false;
    }
  },

  markSaved: () =>
    set((state) => ({
      original: state.content,
      dirty: false,
      saving: false,
      saveState: "saved",
      saveError: null,
      lastSavedAt: Date.now(),
    })),

  requestInlineEdit: (key, caret = "end") =>
    set((state) => ({ editRequest: { key, caret, token: (state.editRequest?.token ?? 0) + 1 } })),
  requestInlineEditExit: () => set((state) => ({ editExitToken: state.editExitToken + 1 })),
  clearInlineEdit: () => set({ editRequest: null }),
  loadPendingForDocument: async () => {
    try {
      const state = get();
      const docKey = docKeyForDocument(state.path, state.localId);
      const entries = await nrvn.pending.load(docKey);
      const current = get();
      if (docKeyForDocument(current.path, current.localId) !== docKey) return;
      const valid = entries.filter(
        (entry) =>
          entry.anchorKey === null ||
          current.blocks.some((block) => block.key === entry.anchorKey) ||
          current.pending.some((block) => block.key === entry.anchorKey),
      );
      set({ pending: valid, ...deriveWithPending(current.content, current.original, valid) });
    } catch {
      /* Pending persistence is best-effort. */
    }
  },
  persistPending: () => {
    const state = get();
    return nrvn.pending
      .save(docKeyForDocument(state.path, state.localId), state.pending)
      .catch(() => undefined);
  },
  moveSelectedBlocks: (direction) => runBlockOperation(direction),
  duplicateSelectedBlocks: () => runBlockOperation("duplicate"),
  deleteSelectedBlocks: () => runBlockOperation("delete"),
  applyBlockFormat: (format, target) => {
    const state = get();
    const sel = useSelectionStore.getState();
    const index = target?.index ?? sel.focus ?? sel.anchor;
    if (
      index === null ||
      index === undefined ||
      !canEditInlineBlock(state.blocks[index]?.type) ||
      isFrontmatterBlock(state.blocks[index]?.raw ?? "")
    )
      return;
    let content = state.content;
    const block = state.blocks[index];
    const nextRaw = applyBlockFormat(target?.text ?? block.raw, format);
    content = content.slice(0, block.startOffset) + nextRaw + content.slice(block.endOffset);
    if (content === state.content) return;
    pushHistory(captureHistory());
    set({ content, ...deriveWithPending(content, state.original, state.pending) });
    const first = get().blocks.findIndex((item) => item.startOffset >= block.startOffset);
    if (first >= 0)
      selectBlockRange(
        get().blocks[first].key,
        get().blocks[Math.min(get().blocks.length - 1, first + splitBlocks(nextRaw).length - 1)]
          .key,
        get().blocks,
      );
  },
  confirmInlineEdit: (index, text, versionSource) => {
    const state = get(),
      block = state.blocks[index];
    if (!block) return;
    const oldKey = block.key;
    const oldRaw = block.raw;
    text = text.replace(/\r\n/g, "\n").replace(/\n+$/g, "");
    if (block.pending && !splitBlocks(state.content).some((item) => item.key === block.key)) {
      const before = captureHistory();
      const pending = state.pending.filter((item) => item.key !== block.key);
      let content = state.content;
      if (text) {
        const realBlocks = state.blocks.filter((item) => !item.pending);
        const anchorIndex =
          block.anchorKey === null
            ? null
            : realBlocks.findIndex((item) => item.key === block.anchorKey);
        content = insertRawsAfter(content, realBlocks, anchorIndex, [text]).content;
      }
      pushHistory(before);
      set({
        content,
        pending,
        ...deriveWithPending(content, state.original, pending),
        editRequest: null,
      });
      get().persistPending();
      if (text) {
        const found = get().blocks.findIndex((item) => !item.pending && item.raw === text);
        if (found >= 0) useSelectionStore.getState().selectIndexRange(found, found);
      } else if (index > 0) useSelectionStore.getState().selectIndexRange(index - 1, index - 1);
      else useSelectionStore.getState().clear();
      return;
    }
    if (text === block.raw) {
      set({ editRequest: null });
      return;
    }
    const before = captureHistory();
    const content =
      state.content.slice(0, block.startOffset) + text + state.content.slice(block.endOffset);
    if (content === state.content) {
      set({ editRequest: null });
      return;
    }
    pushHistory(before);
    set({
      content,
      ...deriveWithPending(content, state.original, state.pending),
      editRequest: null,
    });
    const oldBlocks = splitBlocks(state.content);
    const newBlocks = get().blocks;
    if (oldBlocks.length === newBlocks.length) {
      const mapping: Record<string, string> = {};
      oldBlocks.forEach((oldBlock, blockIndex) => {
        const newKey = newBlocks[blockIndex]?.key;
        if (newKey && oldBlock.key !== newKey) mapping[oldBlock.key] = newKey;
      });
      if (Object.keys(mapping).length)
        useAnnotationsStore.getState().syncBlockVersionKeys(mapping, []);
    }
    const targetKey = get().blocks[index]?.key ?? oldKey;
    if (text.length > 0) {
      useAnnotationsStore
        .getState()
        .addBlockVersion(
          targetKey,
          oldRaw,
          versionSource ?? "manual",
          targetKey !== oldKey ? oldKey : undefined,
        );
    } else {
      useAnnotationsStore.getState().addBlockVersion(oldKey, oldRaw, versionSource ?? "manual");
    }
    if (text.length > 0)
      useAnnotationsStore.getState().appendHistory({
        kind: "manual",
        blocks: [{ key: block.key, beforeHash: block.hash, afterHash: hashBlock(text) }],
      });
    if (!text) {
      if (index > 0) useSelectionStore.getState().selectIndexRange(index - 1, index - 1);
      else useSelectionStore.getState().clear();
    } else {
      const count = splitBlocks(text).length;
      useSelectionStore
        .getState()
        .selectIndexRange(index, Math.min(index + count - 1, get().blocks.length - 1));
    }
  },
  splitInlineEdit: (index, text, caret) => {
    const state = get(),
      block = state.blocks[index];
    if (!block) return;
    const before = captureHistory();
    let { left, right } = splitBlockRaw(text, caret);
    left = left.replace(/\n+$/g, "");
    right = right.replace(/^\n+/, "");
    if (block.pending) {
      const pending = state.pending.filter((item) => item.key !== block.key);
      let content = state.content;
      let anchorKey = block.anchorKey ?? null;
      if (left) {
        const real = state.blocks.filter((item) => !item.pending);
        const anchorIndex =
          anchorKey === null ? null : real.findIndex((item) => item.key === anchorKey);
        const inserted = insertRawsAfter(content, real, anchorIndex, [left]);
        content = inserted.content;
        anchorKey = splitBlocks(content)[inserted.startIndex]?.key ?? anchorKey ?? null;
      }
      const key = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pending.push({ key, anchorKey });
      pushHistory(before);
      set({ content, pending, ...deriveWithPending(content, state.original, pending) });
      get().persistPending();
      get().requestInlineEdit(key, "start");
      return;
    }
    const raw = right ? `${left}\n\n${right}` : left;
    const content =
      state.content.slice(0, block.startOffset) + raw + state.content.slice(block.endOffset);
    const pending = right
      ? state.pending
      : [
          ...state.pending,
          {
            key: `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            anchorKey: block.key,
          },
        ];
    pushHistory(before);
    set({ content, pending, ...deriveWithPending(content, state.original, pending) });
    const target = right
      ? get().blocks[index + 1]
      : get().blocks.find((item) => item.pending && item.anchorKey === block.key);
    if (target) {
      useSelectionStore.getState().selectIndexRange(index, get().blocks.indexOf(target));
      get().requestInlineEdit(target.key, "start");
    }
    if (!right) get().persistPending();
  },
  mergeInlineEdit: (index, text) => {
    const state = get();
    if (index <= 0) return;
    const prev = state.blocks[index - 1],
      cur = state.blocks[index];
    if (!prev || !cur) return;
    if (cur.pending) {
      const pending = state.pending.filter((item) => item.key !== cur.key);
      pushHistory(captureHistory());
      set({ pending, ...deriveWithPending(state.content, state.original, pending) });
      get().persistPending();
      useSelectionStore.getState().selectIndexRange(index - 1, index - 1);
      get().requestInlineEdit(prev.key, "end");
      return;
    }
    const before = captureHistory();
    const joined = joinBlockRaws(prev, text);
    const joinOffset = joined.length - text.trim().length;
    const content =
      state.content.slice(0, prev.startOffset) + joined + state.content.slice(cur.endOffset);
    pushHistory(before);
    set({ content, ...deriveWithPending(content, state.original, state.pending) });
    useSelectionStore.getState().selectIndexRange(index - 1, index - 1);
    get().requestInlineEdit(prev.key, Math.max(0, joinOffset));
  },
  insertPendingParagraph: (index) => {
    const state = get();
    const before = captureHistory();
    const key = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pending = [
      ...state.pending,
      {
        key,
        anchorKey:
          index === null
            ? (state.blocks.filter((item) => !item.pending).at(-1)?.key ?? null)
            : (state.blocks[index]?.key ?? null),
      },
    ];
    pushHistory(before);
    set({ pending, ...deriveWithPending(state.content, state.original, pending) });
    get().persistPending();
    const block = get().blocks.find((b) => b.key === key);
    if (block) {
      const at = get().blocks.indexOf(block);
      useSelectionStore.getState().selectIndexRange(at, at);
    }
    return key;
  },
  insertBlockAfter: (index, kind) => {
    if (kind === "paragraph") {
      get().insertPendingParagraph(index);
      return;
    }
    const state = get();
    const before = captureHistory();
    {
      const raws =
        kind === "section" ? ["## Nueva sección"] : ["[Describe el contenido que quieres generar]"];
      const real = state.blocks.filter((item) => !item.pending);
      const insertionIndex = index === null && real.length > 0 ? real.length - 1 : index;
      const result = insertRawsAfter(state.content, real, insertionIndex, raws);
      const nextBlocks = splitBlocks(result.content);
      const created = nextBlocks[result.startIndex];
      if (kind === "section") {
        const key = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const pending = [...state.pending, { key, anchorKey: created?.key ?? null }];
        pushHistory(before);
        set({
          content: result.content,
          pending,
          ...deriveWithPending(result.content, state.original, pending),
        });
        get().persistPending();
        const p = get().blocks.findIndex((item) => item.key === key);
        if (created)
          useSelectionStore.getState().selectIndexRange(
            get().blocks.findIndex((item) => item.key === created.key),
            p,
          );
      } else if (created) {
        const pending = [
          ...state.pending,
          { key: created.key, anchorKey: index === null ? null : (real[index]?.key ?? null) },
        ];
        pushHistory(before);
        set({
          content: result.content,
          pending,
          ...deriveWithPending(result.content, state.original, pending),
        });
        get().persistPending();
        const at = get().blocks.findIndex((item) => item.key === created.key);
        useSelectionStore.getState().selectIndexRange(at, at);
      }
      return;
    }
  },
  removePendingBlock: (index) => {
    const block = get().blocks[index];
    if (!block?.pending) return;
    const pending = get().pending.filter((p) => p.key !== block.key);
    pushHistory(captureHistory());
    set({ pending, ...deriveWithPending(get().content, get().original, pending) });
    get().persistPending();
  },
  setPendingBlock: (key, pendingValue) => {
    const state = get();
    const pending = pendingValue
      ? [...state.pending, { key, anchorKey: null }]
      : state.pending.filter((p) => p.key !== key);
    if (JSON.stringify(state.pending) === JSON.stringify(pending)) return;
    pushHistory(captureHistory());
    set({
      pending,
      ...deriveWithPending(state.content, state.original, pending),
      editRequest: pendingValue
        ? state.editRequest
        : state.editRequest?.key === key
          ? null
          : state.editRequest,
    });
    get().persistPending();
  },
  applyPendingProposals: (parsed) => {
    const state = get();
    if (!parsed.every((p) => state.pending.some((entry) => entry.key === p.key))) return false;
    const before = captureHistory();
    let content = state.content;
    for (const proposal of parsed) {
      const entry = state.pending.find((p) => p.key === proposal.key);
      const real = splitBlocks(content);
      const block = real.find((item) => item.key === proposal.key);
      if (block)
        content =
          content.slice(0, block.startOffset) + proposal.after + content.slice(block.endOffset);
      else {
        const realBlocks = splitBlocks(content);
        const anchorIndex = entry?.anchorKey
          ? realBlocks.findIndex((item) => item.key === entry.anchorKey)
          : null;
        content = insertRawsAfter(content, realBlocks, anchorIndex, [proposal.after]).content;
      }
    }
    const keys = new Set(parsed.map((p) => p.key));
    const pending = state.pending.filter((p) => !keys.has(p.key));
    pushHistory(before);
    set({ content, pending, ...deriveWithPending(content, state.original, pending) });
    get().reanchorAfterProposal(parsed);
    get().persistPending();
    return true;
  },
  reanchorAfterProposal: (parsed) => {
    const blocks = get().blocks;
    const ranges: { start: number; end: number }[] = [];
    for (const item of parsed) {
      let start = blocks.findIndex((block) => block.key === item.key);
      const replacementBlocks = splitBlocks(item.after);
      if (start < 0 && replacementBlocks.length > 0)
        start = blocks.findIndex((block) => block.raw === replacementBlocks[0].raw);
      if (start < 0) continue;
      const count = Math.max(1, splitBlocks(item.after).length);
      ranges.push({ start, end: Math.min(blocks.length - 1, start + count - 1) });
    }
    if (ranges.length === 0) return;
    useSelectionStore
      .getState()
      .selectIndexRange(
        Math.min(...ranges.map((range) => range.start)),
        Math.max(...ranges.map((range) => range.end)),
      );
  },
  undo: () => {
    const entry = undoStack.pop();
    if (!entry) return;
    redoStack.push(captureHistory());
    set({
      content: entry.content,
      pending: entry.pending,
      ...deriveWithPending(entry.content, get().original, entry.pending),
      undoDepth: undoStack.length,
      redoDepth: redoStack.length,
      canUndo: undoStack.length > 0,
      canRedo: true,
    });
    restoreHistorySelection(entry);
    get().persistPending();
  },
  redo: () => {
    const entry = redoStack.pop();
    if (!entry) return;
    undoStack.push(captureHistory());
    set({
      content: entry.content,
      pending: entry.pending,
      ...deriveWithPending(entry.content, get().original, entry.pending),
      undoDepth: undoStack.length,
      redoDepth: redoStack.length,
      canUndo: true,
      canRedo: redoStack.length > 0,
    });
    restoreHistorySelection(entry);
    get().persistPending();
  },
}));

function restoreHistorySelection(entry: HistoryEntry): void {
  const length = useDocumentStore.getState().blocks.length;
  if (entry.anchor === null || entry.focus === null || length === 0) {
    useSelectionStore.getState().clear();
    return;
  }
  const clamp = (index: number): number => Math.max(0, Math.min(length - 1, index));
  useSelectionStore.setState({
    anchor: clamp(entry.anchor),
    focus: clamp(entry.focus),
    mode: entry.mode,
  });
}

function deriveWithPending(text: string, original: string, pending: PendingBlock[]) {
  const blocks = splitBlocks(text);
  const inserted = new Set<string>();
  for (const entry of pending) {
    const realIndex = blocks.findIndex((item) => item.key === entry.key);
    if (realIndex >= 0) {
      blocks[realIndex] = { ...blocks[realIndex], pending: true, anchorKey: entry.anchorKey };
      continue;
    }
    const anchorIndex =
      entry.anchorKey === null ? -1 : blocks.findIndex((b) => b.key === entry.anchorKey);
    const anchor =
      entry.anchorKey === null
        ? blocks[0]
        : anchorIndex >= 0
          ? blocks[anchorIndex]
          : blocks[blocks.length - 1];
    const base = anchor ?? {
      headingPath: [],
      startLine: 0,
      endLine: 0,
      startOffset: 0,
      endOffset: 0,
      ordinal: 0,
    };
    const synthetic: Block = {
      key: entry.key,
      type: "paragraph",
      headingPath: [...base.headingPath],
      ordinal: 0,
      startLine: base.startLine,
      endLine: base.endLine,
      startOffset: base.endOffset,
      endOffset: base.endOffset,
      raw: "",
      hash: "",
      pending: true,
      anchorKey: entry.anchorKey,
    };
    const at = entry.anchorKey === null ? 0 : anchorIndex >= 0 ? anchorIndex + 1 : blocks.length;
    let orderedAt = at;
    while (
      orderedAt < blocks.length &&
      inserted.has(blocks[orderedAt].key) &&
      blocks[orderedAt].anchorKey === entry.anchorKey
    )
      orderedAt += 1;
    blocks.splice(orderedAt, 0, synthetic);
    inserted.add(entry.key);
  }
  return {
    blocks,
    outline: extractOutline(blocks.filter((b) => !b.pending)),
    dirty: text !== original,
    saveState: (text !== original ? "dirty" : "saved") as SaveState,
  };
}
setSelectionBlockSource(() => useDocumentStore.getState().blocks);

function runBlockOperation(action: "up" | "down" | "duplicate" | "delete"): boolean {
  const state = useDocumentStore.getState();
  const selectionState = useSelectionStore.getState();
  const selectedStateIndexes = selectedIndexes(selectionState, state.blocks);
  if (!selectedStateIndexes.length) return false;
  if (selectedStateIndexes.some((index) => state.blocks[index]?.pending)) return false;
  const firstSelected = selectedStateIndexes[0];
  const lastSelected = selectedStateIndexes[selectedStateIndexes.length - 1];
  if (selectedStateIndexes.length !== lastSelected - firstSelected + 1) return false;
  const realBlocks = state.blocks.filter((block) => !block.pending);
  const start = realBlocks.indexOf(state.blocks[firstSelected]);
  const end = realBlocks.indexOf(state.blocks[lastSelected]);
  if (start < 0 || end < 0) return false;
  const result =
    action === "up" || action === "down"
      ? moveBlockRange(state.content, realBlocks, start, end, action)
      : action === "duplicate"
        ? duplicateBlock(state.content, realBlocks, start, end)
        : deleteBlock(state.content, realBlocks, start, end);
  if (!result.ok) {
    if (result.reason === "pending")
      useUiStore.getState().setToast("No se puede operar sobre un bloque pendiente");
    if (result.reason === "protected")
      useUiStore.getState().setToast("No se puede operar sobre el frontmatter");
    if (result.reason === "bounds") {
      const message =
        action === "up"
          ? "Ya está al principio"
          : action === "down"
            ? "Ya está al final"
            : "Límite del documento";
      useUiStore.getState().setToast(message);
    }
    return false;
  }
  const before = captureHistory();
  const oldReal = realBlocks;
  const newReal = splitBlocks(result.content);
  const pending = reanchorPending(
    state.pending,
    oldReal,
    newReal,
    result.indexMap,
    action,
    start,
    end,
  );
  pushHistory(before);
  useDocumentStore.setState({
    content: result.content,
    pending,
    ...deriveWithPending(result.content, state.original, pending),
  });
  const mapping: Record<string, string> = {};
  const deleted: string[] = [];
  oldReal.forEach((block, index) => {
    const ni = result.indexMap[index];
    if (ni !== undefined && ni >= 0 && newReal[ni]) mapping[block.key] = newReal[ni].key;
    else deleted.push(block.key);
  });
  if (Object.keys(mapping).some((key) => mapping[key] !== key) || deleted.length)
    useAnnotationsStore.getState().syncBlockVersionKeys(mapping, deleted);
  useDocumentStore.getState().persistPending();
  if (action === "delete") useUiStore.getState().setToast("Bloque eliminado · ⌘Z para deshacer");
  const selection = result.selection;
  if (selection) {
    const selected = useDocumentStore
      .getState()
      .blocks.flatMap((block, index) =>
        block.startOffset <= selection.end && block.endOffset >= selection.start ? [index] : [],
      );
    if (selected.length)
      useSelectionStore.getState().selectIndexRange(selected[0], selected[selected.length - 1]);
    else useSelectionStore.getState().clear();
  } else useSelectionStore.getState().clear();
  return true;
}

function reanchorPending(
  entries: PendingBlock[],
  oldReal: Block[],
  newReal: Block[],
  indexMap: number[],
  action: "up" | "down" | "duplicate" | "delete",
  start: number,
  end: number,
): PendingBlock[] {
  const mappedKey = (key: string): string | null => {
    if (key.startsWith("pending-")) return key;
    const oldIndex = oldReal.findIndex((block) => block.key === key);
    if (oldIndex < 0) return key;
    const newIndex = indexMap[oldIndex];
    return newIndex === undefined || newIndex < 0 ? null : (newReal[newIndex]?.key ?? null);
  };
  return entries.flatMap((entry) => {
    const key = mappedKey(entry.key);
    if (key === null) return [];
    const anchorKey = entry.anchorKey === null ? null : reanchorDeletedAnchor(entry.anchorKey);
    return [{ key, anchorKey }];
  });

  function reanchorDeletedAnchor(key: string): string | null {
    if (key.startsWith("pending-")) return key;
    const oldIndex = oldReal.findIndex((block) => block.key === key);
    if (oldIndex < 0) return key;
    const mappedIndex =
      action === "up" && oldIndex === start - 1 ? indexMap[end] : indexMap[oldIndex];
    if (mappedIndex !== undefined && mappedIndex >= 0) return newReal[mappedIndex]?.key ?? null;
    for (let index = oldIndex - 1; index >= 0; index--) {
      const survivor = indexMap[index];
      if (survivor !== undefined && survivor >= 0) return newReal[survivor]?.key ?? null;
    }
    for (let index = oldIndex + 1; index < oldReal.length; index++) {
      const survivor = indexMap[index];
      if (survivor !== undefined && survivor >= 0) return newReal[survivor]?.key ?? null;
    }
    return null;
  }
}
