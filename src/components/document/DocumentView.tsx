import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { runCommand, selectWholeDocument, toggleViewMode } from "../../lib/commands";
import { tweenQuick } from "../../lib/motion";
import { classifyToast } from "../../lib/toast";
import { restoreScrollAnchor } from "../../lib/view-anchor";
import { useDocumentStore } from "../../store/document";
import { useSelectionStore } from "../../store/selection";
import { useUiStore } from "../../store/ui";
import { useWorkspaceStore } from "../../store/workspace";
import { EmptyState } from "../common/EmptyState";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { useAutosave } from "../editor/useAutosave";
import { RenderArticle } from "../render/RenderArticle";
import { RenderGutter } from "../render/RenderGutter";
import { DocumentPlaceholder } from "./DocumentPlaceholder";
import { EditorAgentNote } from "./EditorAgentNote";
import { EmptyDocument } from "./EmptyDocument";

/** Área central: orquesta render/edición, atajos de documento y autosave. */
export function DocumentView() {
  useAutosave();
  const reduceMotion = useReducedMotion();

  const status = useDocumentStore((state) => state.status);
  const path = useDocumentStore((state) => state.path);
  const blocks = useDocumentStore((state) => state.blocks);
  const error = useDocumentStore((state) => state.error);
  const mode = useUiStore((state) => state.mode);
  const renderFont = useUiStore((state) => state.renderFont);
  const pageSize = useUiStore((state) => state.pageSize);
  const pageZoom = useUiStore((state) => state.pageZoom);
  const scrollAnchor = useUiStore((state) => state.scrollAnchor);
  const toast = useUiStore((state) => state.toast);
  const toastToken = useUiStore((state) => state.toastToken);
  const openFolder = useWorkspaceStore((state) => state.openFolder);
  const toastTimer = useRef<number | null>(null);
  const remainingToastMs = useRef(0);
  const toastStartedAt = useRef(0);
  const pausedRef = useRef(false);

  // Atajos globales de documento que en la app real aporta el menú nativo.
  // En el renderer (mock/E2E) se replican aquí: Cmd+N y Cmd+E.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "=" || key === "+" || key === "-" || key === "0") {
        const target = event.target;
        if (
          (target instanceof HTMLElement &&
            (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
              target.isContentEditable)) ||
          document.querySelector("[data-overlay]")
        )
          return;
      }
      if (key === "=" || key === "+") {
        event.preventDefault();
        useUiStore.getState().zoomPageIn();
        return;
      }
      if (key === "-") {
        event.preventDefault();
        useUiStore.getState().zoomPageOut();
        return;
      }
      if (key === "0") {
        event.preventDefault();
        useUiStore.getState().zoomPageReset();
        return;
      }
      if (key === "n") {
        event.preventDefault();
        runCommand("new-document");
        return;
      }
      if (key === "e") {
        event.preventDefault();
        toggleViewMode();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Cmd+A en modo render: selecciona todos los bloques (área de edición) en
  // lugar del texto nativo. En el editor lo gestiona CodeMirror y en campos de
  // texto u overlays no se intercepta.
  useEffect(() => {
    if (mode !== "render") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() !== "a") return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      if (document.querySelector("[data-overlay]")) return;
      event.preventDefault();
      selectWholeDocument();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode]);

  useEffect(() => {
    if (mode !== "render") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
      )
        return;
      if (document.querySelector("[data-overlay]")) return;
      const selection = useSelectionStore.getState();
      if (selection.mode === "none") return;
      const documentStore = useDocumentStore.getState();
      if (event.shiftKey && event.key === "ArrowUp") {
        event.preventDefault();
        documentStore.moveSelectedBlocks("up");
      } else if (event.shiftKey && event.key === "ArrowDown") {
        event.preventDefault();
        documentStore.moveSelectedBlocks("down");
      } else if (!event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        documentStore.duplicateSelectedBlocks();
      } else if (!event.shiftKey && event.key === "Backspace") {
        event.preventDefault();
        documentStore.deleteSelectedBlocks();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode]);

  useEffect(() => {
    if (mode !== "render") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "z")
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
      )
        return;
      if (document.querySelector("[data-overlay]")) return;
      event.preventDefault();
      event.shiftKey ? useDocumentStore.getState().redo() : useDocumentStore.getState().undo();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode]);

  // Restaura la posición aproximada después del toggle.
  useEffect(() => {
    if (!scrollAnchor) return;
    const started = performance.now();
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        restoreScrollAnchor(scrollAnchor, useUiStore.getState().mode);
        useUiStore.getState().setScrollAnchor(null);
        console.info("[nrvn] toggle ms=", performance.now() - started);
      });
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, [scrollAnchor]);

  // Esc global: prioridad overlay → limpiar selección. No se secuestra Esc
  // cuando el foco está en un campo de texto (editor, composer, inputs).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      // Un overlay abierto tiene prioridad y gestiona su propio Esc.
      if (document.querySelector("[data-overlay]")) return;
      const selection = useSelectionStore.getState();
      if (selection.mode !== "none") {
        event.preventDefault();
        selection.clear();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Toast efímero para avisos como "El archivo cambió en disco".
  useEffect(() => {
    // `toastToken` fuerza el reinicio del temporizador cuando llega el mismo mensaje otra vez.
    void toastToken;
    if (toast === null) {
      pausedRef.current = false;
      remainingToastMs.current = 0;
      toastTimer.current = null;
      return;
    }
    const { durationMs } = classifyToast(toast);
    remainingToastMs.current = durationMs;
    toastStartedAt.current = Date.now();
    if (!pausedRef.current) {
      toastTimer.current = window.setTimeout(
        () => useUiStore.getState().setToast(null),
        durationMs,
      );
    }
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    };
  }, [toast, toastToken]);

  const pauseToast = () => {
    pausedRef.current = true;
    if (toastTimer.current === null) return;
    window.clearTimeout(toastTimer.current);
    toastTimer.current = null;
    remainingToastMs.current = Math.max(
      0,
      remainingToastMs.current - (Date.now() - toastStartedAt.current),
    );
  };
  const resumeToast = () => {
    pausedRef.current = false;
    if (toast === null || toastTimer.current !== null) return;
    toastStartedAt.current = Date.now();
    toastTimer.current = window.setTimeout(
      () => useUiStore.getState().setToast(null),
      remainingToastMs.current,
    );
  };

  const toastTone = toast ? classifyToast(toast).tone : "info";
  const toastNode = (
    <AnimatePresence>
      {toast ? (
        <motion.div
          key={`${toast}-${toastToken}`}
          className="toast"
          role={toastTone === "error" ? "alert" : "status"}
          aria-live={toastTone === "error" ? "assertive" : "polite"}
          onMouseEnter={pauseToast}
          onMouseLeave={resumeToast}
          onFocus={pauseToast}
          onBlur={resumeToast}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={reduceMotion ? { duration: 0 } : tweenQuick}
        >
          {toast}
          <button
            type="button"
            data-testid="toast-close"
            aria-label="Cerrar aviso"
            onClick={() => useUiStore.getState().setToast(null)}
          >
            ×
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (status === "error") {
    return (
      <div className="document-view" data-mode={mode}>
        <div className="document-area">
          <EmptyState
            title="No se pudo abrir el archivo"
            description={error ?? undefined}
            action={
              <button
                type="button"
                className="button"
                onClick={() => {
                  if (path) void useDocumentStore.getState().reload();
                  else void openFolder();
                }}
              >
                Reintentar
              </button>
            }
          />
        </div>
        {toastNode}
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="document-view" data-mode={mode}>
        <div className="document-area">
          <DocumentPlaceholder />
        </div>
        {toastNode}
      </div>
    );
  }

  return (
    <div className="document-view" data-testid="document-view" data-mode={mode}>
      <div
        className="document-area document-scroll"
        data-document-scroll
        style={{ "--page-zoom": pageZoom / 100 } as CSSProperties}
      >
        {mode === "render" ? (
          <div className="render-canvas" data-page-size={pageSize}>
            <RenderGutter />
            <div
              className="document-sheet"
              data-mode="render"
              data-render-font={renderFont}
              data-page-size={pageSize}
              style={{ "--page-zoom": pageZoom / 100 } as CSSProperties}
            >
              {blocks.length === 0 ? <EmptyDocument /> : <RenderArticle />}
              <EditorAgentNote />
            </div>
          </div>
        ) : (
          <div
            className="document-sheet"
            data-mode="markdown"
            style={{ "--page-zoom": pageZoom / 100 } as CSSProperties}
          >
            <MarkdownEditor />
            <EditorAgentNote />
          </div>
        )}
      </div>
      {toastNode}
    </div>
  );
}
