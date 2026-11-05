import { create } from "zustand";
import type { PageSize, RenderFont, Theme } from "../../electron/types";
import { nrvn } from "../lib/ipc";
import {
  clampAgentWidth,
  DEFAULT_AGENT_WIDTH,
  MAX_AGENT_WIDTH,
  MIN_AGENT_WIDTH,
} from "../lib/panel-width";

export const MIN_TREE_WIDTH = 200;
export const MAX_TREE_WIDTH = 360;
export const MIN_PAGE_ZOOM = 50;
export const MAX_PAGE_ZOOM = 200;
export const PAGE_ZOOM_STEP = 10;
export const DEFAULT_PAGE_ZOOM = 100;
export function clampPageZoom(percent: number): number {
  if (!Number.isFinite(percent)) return DEFAULT_PAGE_ZOOM;
  const stepped = Math.round(percent / PAGE_ZOOM_STEP) * PAGE_ZOOM_STEP;
  return Math.min(MAX_PAGE_ZOOM, Math.max(MIN_PAGE_ZOOM, stepped));
}
export { MAX_AGENT_WIDTH, MIN_AGENT_WIDTH };

/** Modo de lectura del documento: prosa renderizada o Markdown editable. */
export type ViewMode = "render" | "markdown";

/** Bloque visible en el borde superior al cambiar de modo (Cmd+E). */
export interface ScrollAnchor {
  key: string;
  offsetRatio: number;
}

export interface UiState {
  editorLineRequest: { line: number; token: number } | null;
  activeBlockElement: HTMLElement | null;
  setActiveBlockElement: (element: HTMLElement | null) => void;
  resetEditing: () => void;
  bubbleDismissedFor: { anchor: number | null; selectionMode: string } | null;
  dismissBubble: (scope: { anchor: number | null; selectionMode: string }) => void;
  theme: Theme;
  treeOpen: boolean;
  treeUserSet: boolean;
  treeWidth: number;
  agentWidth: number;
  agentOpen: boolean;
  toast: string | null;
  toastToken: number;
  mode: ViewMode;
  scrollAnchor: ScrollAnchor | null;
  renderFont: RenderFont;
  lineNumbers: boolean;
  pageSize: PageSize;
  pageZoom: number;
  treeOutline: number;
  aboutOpen: boolean;
  onboardingOpen: boolean;
  onboardingDone: boolean;
  setTheme: (theme: Theme) => void;
  applyTheme: () => void;
  applyRenderFont: () => void;
  toggleTree: () => void;
  toggleAgent: () => void;
  setTreeWidth: (width: number) => void;
  setAgentWidth: (width: number) => void;
  setToast: (message: string | null) => void;
  setMode: (mode: ViewMode) => void;
  setScrollAnchor: (anchor: ScrollAnchor | null) => void;
  setRenderFont: (font: RenderFont) => void;
  setLineNumbers: (enabled: boolean) => void;
  setPageSize: (size: PageSize) => void;
  setPageZoom: (percent: number) => void;
  zoomPageIn: () => void;
  zoomPageOut: () => void;
  zoomPageReset: () => void;
  setTreeOutlineRatio: (ratio: number) => void;
  toggleLineNumbers: () => void;
  requestEditorLine: (line: number) => void;
  clearEditorLine: () => void;
  setAboutOpen: (open: boolean) => void;
  openOnboarding: () => void;
  dismissOnboarding: () => void;
}

function preferredTreeOpen(): boolean {
  if (typeof window === "undefined") return true;
  return window.innerWidth >= 1024;
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return MIN_TREE_WIDTH;
  return Math.min(MAX_TREE_WIDTH, Math.max(MIN_TREE_WIDTH, Math.round(width)));
}

function persist(partial: Parameters<typeof nrvn.settings.patch>[0]): void {
  void nrvn.settings.patch(partial).catch(() => {
    // Best-effort: el tema/estado local sigue funcionando aunque falle el guardado.
  });
}

let panelPersistenceTimer: ReturnType<typeof setTimeout> | null = null;
let panelPersistenceListenersRegistered = false;

export function flushPanelPersistence(): void {
  if (panelPersistenceTimer === null) return;
  clearTimeout(panelPersistenceTimer);
  panelPersistenceTimer = null;
  const state = useUiStore.getState();
  persist({
    panelWidths: { tree: state.treeWidth, agent: state.agentWidth },
    panelHeights: { treeOutline: state.treeOutline },
  });
}

function schedulePanelPersistence(): void {
  if (!panelPersistenceListenersRegistered && typeof window !== "undefined") {
    window.addEventListener("pointerup", flushPanelPersistence, true);
    window.addEventListener("pointercancel", flushPanelPersistence, true);
    window.addEventListener("pagehide", flushPanelPersistence, true);
    window.addEventListener("blur", flushPanelPersistence, true);
    panelPersistenceListenersRegistered = true;
  }
  if (panelPersistenceTimer !== null) clearTimeout(panelPersistenceTimer);
  panelPersistenceTimer = setTimeout(flushPanelPersistence, 150);
}

export const useUiStore = create<UiState>((set, get) => ({
  editorLineRequest: null,
  activeBlockElement: null,
  setActiveBlockElement: (activeBlockElement) => set({ activeBlockElement }),
  resetEditing: () =>
    set({ editorLineRequest: null, activeBlockElement: null, bubbleDismissedFor: null }),
  bubbleDismissedFor: null,
  dismissBubble: (bubbleDismissedFor) => set({ bubbleDismissedFor }),
  theme: "system",
  treeOpen: preferredTreeOpen(),
  treeUserSet: false,
  treeWidth: 248,
  agentWidth: DEFAULT_AGENT_WIDTH,
  agentOpen: true,
  toast: null,
  toastToken: 0,
  mode: "render",
  scrollAnchor: null,
  renderFont: "lato",
  lineNumbers: true,
  pageSize: "letter",
  pageZoom: DEFAULT_PAGE_ZOOM,
  treeOutline: 0.5,
  aboutOpen: false,
  onboardingOpen: false,
  onboardingDone: false,

  setTheme: (theme) => {
    set({ theme });
    persist({ theme });
    get().applyTheme();
  },

  applyTheme: () => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = resolveTheme(get().theme);
  },

  applyRenderFont: () => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.renderFont = get().renderFont;
  },

  toggleTree: () => {
    const treeOpen = !get().treeOpen;
    set({ treeOpen, treeUserSet: true });
    persist({ panels: { tree: treeOpen, agent: get().agentOpen } });
  },

  toggleAgent: () => {
    const agentOpen = !get().agentOpen;
    set({ agentOpen });
    persist({ panels: { tree: get().treeOpen, agent: agentOpen } });
  },

  setTreeWidth: (width) => {
    const treeWidth = clampWidth(width);
    set({ treeWidth });
    schedulePanelPersistence();
  },

  setAgentWidth: (width) => {
    const viewport = typeof window === "undefined" ? MAX_AGENT_WIDTH * 2 : window.innerWidth;
    const agentWidth = clampAgentWidth(width, viewport);
    set({ agentWidth });
    schedulePanelPersistence();
  },

  setToast: (message) => set((state) => ({ toast: message, toastToken: state.toastToken + 1 })),

  setMode: (mode) => set({ mode }),

  setScrollAnchor: (scrollAnchor) => set({ scrollAnchor }),

  setRenderFont: (renderFont) => {
    set({ renderFont });
    persist({
      render: {
        font: renderFont,
        lineNumbers: get().lineNumbers,
        pageSize: get().pageSize,
        zoom: get().pageZoom,
      },
    });
    get().applyRenderFont();
  },

  setLineNumbers: (lineNumbers) => {
    set({ lineNumbers });
    persist({
      render: {
        font: get().renderFont,
        lineNumbers,
        pageSize: get().pageSize,
        zoom: get().pageZoom,
      },
    });
  },

  setPageSize: (pageSize) => {
    set({ pageSize });
    persist({
      render: {
        font: get().renderFont,
        lineNumbers: get().lineNumbers,
        pageSize,
        zoom: get().pageZoom,
      },
    });
  },
  setPageZoom: (percent) => {
    const pageZoom = clampPageZoom(percent);
    set({ pageZoom });
    persist({
      render: {
        font: get().renderFont,
        lineNumbers: get().lineNumbers,
        pageSize: get().pageSize,
        zoom: pageZoom,
      },
    });
  },
  zoomPageIn: () => get().setPageZoom(get().pageZoom + PAGE_ZOOM_STEP),
  zoomPageOut: () => get().setPageZoom(get().pageZoom - PAGE_ZOOM_STEP),
  zoomPageReset: () => get().setPageZoom(DEFAULT_PAGE_ZOOM),
  setTreeOutlineRatio: (treeOutline) => {
    const ratio = Number.isFinite(treeOutline) ? Math.min(1, Math.max(0, treeOutline)) : 0.5;
    set({ treeOutline: ratio });
    schedulePanelPersistence();
  },

  toggleLineNumbers: () => {
    get().setLineNumbers(!get().lineNumbers);
  },
  requestEditorLine: (line) =>
    set((state) => ({
      editorLineRequest: { line, token: (state.editorLineRequest?.token ?? 0) + 1 },
    })),
  clearEditorLine: () => set({ editorLineRequest: null }),
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  openOnboarding: () => set({ onboardingOpen: true }),
  dismissOnboarding: () => {
    set({ onboardingOpen: false, onboardingDone: true });
    persist({ onboarding: { done: true } });
  },
}));
