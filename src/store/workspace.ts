import { create } from "zustand";
import type { LanguageCreateResult, LanguageSyncResult, TreeNode } from "../../electron/types";
import { nrvn } from "../lib/ipc";

export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

export interface WorkspaceState {
  root: string | null;
  rootName: string | null;
  recent: string | null;
  tree: TreeNode[];
  status: WorkspaceStatus;
  error: string | null;
  expanded: Record<string, boolean>;
  toggleExpanded: (path: string) => void;
  setTree: (tree: TreeNode[]) => void;
  setRecent: (path: string | null) => void;
  openFolder: () => Promise<void>;
  reopenRecent: () => Promise<void>;
  refreshTree: () => Promise<void>;
  revealWorkspace: () => Promise<boolean>;
  revealPath: (relPath: string | null) => Promise<boolean>;
  copyPath: (relPath: string | null) => Promise<boolean>;
  createLanguage: (relPath: string, lang: string) => Promise<LanguageCreateResult>;
  syncLanguage: (relPath: string, lang: string) => Promise<LanguageSyncResult>;
  setRootFromSave: (root: string, name: string) => void;
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  root: null,
  rootName: null,
  recent: null,
  tree: [],
  status: "idle",
  error: null,
  expanded: {},

  toggleExpanded: (path) =>
    set((state) => ({
      expanded: { ...state.expanded, [path]: !(state.expanded[path] ?? false) },
    })),

  setTree: (tree) => set({ tree }),

  setRecent: (path) => set({ recent: path }),

  setRootFromSave: (root, name) => set({ root, rootName: name, recent: root }),

  openFolder: async () => {
    set({ status: "loading", error: null });
    try {
      const result = await nrvn.workspace.openFolder();
      if (result.canceled) {
        set((state) => ({ status: state.tree.length > 0 ? "ready" : "idle" }));
        return;
      }
      set({
        root: result.root ?? null,
        rootName: result.name ?? null,
        recent: result.root ?? get().recent,
      });
      const tree = await nrvn.workspace.getTree();
      set({ tree, status: "ready", error: null });
    } catch (reason: unknown) {
      set({ status: "error", error: messageOf(reason, "No se pudo abrir la carpeta") });
    }
  },

  reopenRecent: async () => {
    if (get().recent === null) return;
    set({ status: "loading", error: null });
    try {
      const result = await nrvn.workspace.openRecent();
      if (result.canceled) {
        set((state) => ({ status: state.tree.length > 0 ? "ready" : "idle" }));
        return;
      }
      const root = result.root ?? get().root;
      set({
        root,
        rootName: result.name ?? null,
        recent: root ?? get().recent,
      });
      const tree = await nrvn.workspace.getTree();
      set({ tree, status: "ready", error: null });
    } catch (reason: unknown) {
      set({ status: "error", error: messageOf(reason, "No se pudo reabrir la carpeta") });
    }
  },

  refreshTree: async () => {
    if (get().root === null) return;
    set({ status: "loading", error: null });
    try {
      const tree = await nrvn.workspace.getTree();
      set({ tree, status: "ready" });
    } catch (reason: unknown) {
      set({ status: "error", error: messageOf(reason, "No se pudo leer la carpeta") });
    }
  },

  revealWorkspace: () => nrvn.workspace.revealPath(null).catch(() => false),

  revealPath: (relPath) => nrvn.workspace.revealPath(relPath).catch(() => false),

  copyPath: (relPath) => nrvn.workspace.copyPath(relPath).catch(() => false),
  createLanguage: async (relPath, lang) => {
    const result = await nrvn.workspace.createLanguage(relPath, lang);
    if (result.ok) await get().refreshTree();
    return result;
  },
  syncLanguage: async (relPath, lang) => {
    const result = await nrvn.workspace.syncLanguage(relPath, lang);
    if (result.ok) await get().refreshTree();
    return result;
  },
}));
