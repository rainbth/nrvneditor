import { create } from "zustand";
import type {
  BlockComment,
  BlockVersion,
  HistoryEvent,
  StoredCritique,
  StoredCritiqueBlock,
} from "../../electron/types";
import { nrvn } from "../lib/ipc";
import { useUiStore } from "./ui";

interface AnnotationState {
  docKey: string | null;
  history: HistoryEvent[];
  comments: BlockComment[];
  critiques: StoredCritique[];
  blockVersions: BlockVersion[];
  composer: { blockKey: string; blockHash: string } | null;
  commentDraft: string;
  setCommentDraft: (text: string) => void;
  clearCommentDraft: () => void;
  loadForDocument: (docKey: string, force?: boolean) => Promise<void>;
  ensureDocument: (docKey: string) => Promise<void>;
  openComposer: (blockKey: string, blockHash: string) => void;
  closeComposer: () => void;
  addComment: (body: string, docKeyOverride?: string) => void;
  setCommentResolved: (id: string, resolved: boolean) => void;
  removeComment: (id: string) => void;
  addCritique: (input: {
    audience: string;
    blocks: StoredCritiqueBlock[];
    blockHashes: Record<string, string>;
  }) => void;
  addBlockVersion: (blockKey: string, raw: string, source: string, rekeyFrom?: string) => void;
  rekeyBlockVersions: (fromKey: string, toKey: string) => void;
  syncBlockVersionKeys: (mapping: Record<string, string>, deleted: string[]) => void;
  appendHistory: (input: {
    kind: HistoryEvent["kind"];
    blocks: HistoryEvent["blocks"];
    prompt?: string;
  }) => void;
  refresh: () => Promise<void>;
}
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
let loadEpoch = 0;
let mutationEpoch = 0;

export function pruneBlockVersions(versions: BlockVersion[]): BlockVersion[] {
  const counts = new Map<string, number>();
  return [...versions]
    .reverse()
    .filter((version) => {
      const count = (counts.get(version.blockKey) ?? 0) + 1;
      counts.set(version.blockKey, count);
      return count <= 10;
    })
    .reverse();
}

export const useAnnotationsStore = create<AnnotationState>((set, get) => {
  const persistComments = (comments: BlockComment[], docKeyOverride?: string) => {
    const docKey = docKeyOverride ?? get().docKey;
    if (!docKey) return;
    void nrvn.annotations.saveComments(docKey, comments).catch(() => {
      useUiStore.getState().setToast("No se pudieron guardar los comentarios.");
    });
  };
  const persistCritiques = (critiques: StoredCritique[]) => {
    const docKey = get().docKey;
    if (!docKey) return;
    void nrvn.annotations.saveCritiques(docKey, critiques).catch(() => {
      useUiStore.getState().setToast("No se pudieron guardar las críticas.");
    });
  };
  return {
    docKey: null,
    history: [],
    comments: [],
    critiques: [],
    blockVersions: [],
    composer: null,
    commentDraft: "",
    setCommentDraft: (commentDraft) => set({ commentDraft }),
    clearCommentDraft: () => set({ commentDraft: "" }),
    loadForDocument: async (docKey, force = false) => {
      if (!force && get().docKey === docKey) return;
      const epoch = ++loadEpoch;
      const mutationsAtStart = mutationEpoch;
      set({
        docKey,
        history: [],
        comments: [],
        critiques: [],
        blockVersions: [],
        composer: null,
      });
      try {
        const loaded = await nrvn.annotations.load(docKey);
        if (epoch === loadEpoch && get().docKey === docKey && mutationEpoch === mutationsAtStart)
          set({
            history: loaded.history,
            comments: loaded.comments,
            critiques: loaded.critiques,
            blockVersions: pruneBlockVersions(loaded.blockVersions ?? []),
          });
      } catch {
        if (epoch === loadEpoch && get().docKey === docKey)
          useUiStore.getState().setToast("No se pudieron cargar las anotaciones.");
      }
    },
    ensureDocument: async (docKey) => {
      if (get().docKey === docKey) return;
      const epoch = ++loadEpoch;
      const mutationsAtStart = mutationEpoch;
      set({ docKey, history: [], comments: [], critiques: [], blockVersions: [] });
      try {
        const loaded = await nrvn.annotations.load(docKey);
        if (epoch === loadEpoch && get().docKey === docKey && mutationEpoch === mutationsAtStart)
          set({
            history: loaded.history,
            comments: loaded.comments,
            critiques: loaded.critiques,
            blockVersions: pruneBlockVersions(loaded.blockVersions ?? []),
          });
      } catch {
        if (epoch === loadEpoch && get().docKey === docKey)
          useUiStore.getState().setToast("No se pudieron cargar las anotaciones.");
      }
    },
    openComposer: (blockKey, blockHash) =>
      set({ composer: { blockKey, blockHash }, commentDraft: "" }),
    closeComposer: () => set({ composer: null, commentDraft: "" }),
    addComment: (body, docKeyOverride) => {
      const { composer, comments } = get();
      const docKey = docKeyOverride ?? get().docKey;
      if (!composer || !docKey || !body.trim()) return;
      const now = Date.now();
      const next = [
        ...comments,
        {
          id: id("comment"),
          docKey,
          blockKey: composer.blockKey,
          blockHash: composer.blockHash,
          body: body.trim(),
          createdAt: now,
          updatedAt: now,
          resolved: false,
        },
      ];
      set({ comments: next, commentDraft: "" });
      mutationEpoch += 1;
      persistComments(next, docKey);
    },
    setCommentResolved: (commentId, resolved) => {
      const { docKey, comments } = get();
      if (!docKey || !comments.some((comment) => comment.id === commentId)) return;
      const next = get().comments.map((c) =>
        c.id === commentId ? { ...c, resolved, updatedAt: Date.now() } : c,
      );
      set({ comments: next });
      mutationEpoch += 1;
      persistComments(next);
    },
    removeComment: (commentId) => {
      const { docKey, comments } = get();
      if (!docKey || !comments.some((comment) => comment.id === commentId)) return;
      const next = get().comments.filter((c) => c.id !== commentId);
      set({ comments: next });
      mutationEpoch += 1;
      persistComments(next);
    },
    addCritique: ({ audience, blocks, blockHashes }) => {
      const docKey = get().docKey;
      if (!docKey) return;
      const next = [
        ...get().critiques,
        {
          id: id("critique"),
          docKey,
          audience,
          createdAt: Date.now(),
          blockHashes,
          blocks,
        },
      ];
      set({ critiques: next });
      mutationEpoch += 1;
      persistCritiques(next);
    },
    addBlockVersion: (blockKey, raw, source, rekeyFrom) => {
      const docKey = get().docKey;
      if (!docKey || !raw) return;
      let versions = get().blockVersions;
      if (rekeyFrom && rekeyFrom !== blockKey) {
        versions = versions.map((version) =>
          version.blockKey === rekeyFrom ? { ...version, blockKey } : version,
        );
      }
      const newest = versions.filter((version) => version.blockKey === blockKey).at(-1);
      const next =
        newest?.raw === raw
          ? versions
          : [...versions, { id: id("version"), blockKey, raw, createdAt: Date.now(), source }];
      const pruned = pruneBlockVersions(next);
      set({ blockVersions: pruned });
      mutationEpoch += 1;
      void nrvn.annotations.saveBlockVersions(docKey, pruned).catch(() => {
        useUiStore.getState().setToast("No se pudieron guardar las versiones del bloque.");
      });
    },
    rekeyBlockVersions: (fromKey, toKey) => {
      const docKey = get().docKey;
      if (!docKey || fromKey === toKey) return;
      const versions = get().blockVersions;
      const next = versions.map((version) =>
        version.blockKey === fromKey ? { ...version, blockKey: toKey } : version,
      );
      set({ blockVersions: next });
      mutationEpoch += 1;
      void nrvn.annotations.saveBlockVersions(docKey, next).catch(() => {
        useUiStore.getState().setToast("No se pudieron guardar las versiones del bloque.");
      });
    },
    syncBlockVersionKeys: (mapping, deleted) => {
      const docKey = get().docKey;
      if (!docKey) return;
      const deletedKeys = new Set(deleted);
      const versions = get().blockVersions;
      const next = versions.flatMap((version) => {
        if (deletedKeys.has(version.blockKey)) return [];
        const blockKey = mapping[version.blockKey];
        return blockKey && blockKey !== version.blockKey ? [{ ...version, blockKey }] : [version];
      });
      if (next.length === versions.length && next.every((v, i) => v === versions[i])) return;
      set({ blockVersions: next });
      mutationEpoch += 1;
      void nrvn.annotations.saveBlockVersions(docKey, next).catch(() => {
        useUiStore.getState().setToast("No se pudieron guardar las versiones del bloque.");
      });
    },
    appendHistory: ({ kind, blocks, prompt }) => {
      const docKey = get().docKey;
      if (!docKey) return;
      const event: HistoryEvent = {
        id: id("history"),
        docKey,
        kind,
        createdAt: Date.now(),
        blocks,
        ...(prompt === undefined ? {} : { prompt }),
      };
      set({ history: [...get().history, event].slice(-5000) });
      mutationEpoch += 1;
      void nrvn.annotations.appendHistory(docKey, event).catch(() => {
        useUiStore.getState().setToast("No se pudo guardar el historial.");
      });
    },
    refresh: async () => {
      const key = get().docKey;
      if (key) await get().loadForDocument(key, true);
    },
  };
});
