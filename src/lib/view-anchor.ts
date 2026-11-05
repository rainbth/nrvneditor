import { EditorView } from "@codemirror/view";
import { useDocumentStore } from "../store/document";
import type { ScrollAnchor, ViewMode } from "../store/ui";
import { blockIndexAtOffset } from "./blocks";

let activeView: EditorView | null = null;

/** MarkdownEditor registra aquí su vista para el anclaje de Cmd+E y el outline. */
export function setActiveEditorView(view: EditorView | null): void {
  activeView = view;
}

export function getActiveEditorView(): EditorView | null {
  return activeView;
}

/** Bloque visible en el borde superior del scroller de prosa. */
function captureRenderAnchor(): ScrollAnchor | null {
  const scroller = document.querySelector<HTMLElement>("[data-document-scroll]");
  if (!scroller) return null;
  const top = scroller.getBoundingClientRect().top;
  const blocks = Array.from(scroller.querySelectorAll<HTMLElement>("[data-block-key]"));
  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (rect.bottom > top + 4) {
      const key = block.dataset.blockKey;
      if (!key) return null;
      const ratio = rect.height > 0 ? Math.min(Math.max((top - rect.top) / rect.height, 0), 1) : 0;
      return { key, offsetRatio: ratio };
    }
  }
  return null;
}

/** Bloque visible en el borde superior del editor de Markdown. */
function captureEditorAnchor(): ScrollAnchor | null {
  const view = activeView;
  if (!view) return null;
  const scrollTop = view.scrollDOM.scrollTop;
  const info = view.lineBlockAtHeight(scrollTop + 4);
  const line = view.state.doc.lineAt(info.from);
  const blocks = useDocumentStore.getState().blocks;
  const index = blockIndexAtOffset(blocks, line.from);
  const block = blocks[index];
  if (!block) return null;
  const ratio =
    info.height > 0 ? Math.min(Math.max((info.top - scrollTop) / info.height, 0), 1) : 0;
  return { key: block.key, offsetRatio: ratio };
}

export function captureScrollAnchor(mode: ViewMode): ScrollAnchor | null {
  return mode === "render" ? captureRenderAnchor() : captureEditorAnchor();
}

function restoreRenderAnchor(anchor: ScrollAnchor): void {
  const scroller = document.querySelector<HTMLElement>("[data-document-scroll]");
  if (!scroller) return;
  const target = scroller.querySelector<HTMLElement>(
    `[data-block-key="${CSS.escape(anchor.key)}"]`,
  );
  if (!target) return;
  const scrollerTop = scroller.getBoundingClientRect().top;
  const targetTop = target.getBoundingClientRect().top;
  scroller.scrollTop += targetTop - scrollerTop + target.offsetHeight * anchor.offsetRatio;
}

function restoreEditorAnchor(anchor: ScrollAnchor): void {
  const view = activeView;
  if (!view) return;
  const { blocks } = useDocumentStore.getState();
  const block = blocks.find((candidate) => candidate.key === anchor.key);
  if (!block) return;
  const pos = Math.min(block.startOffset, view.state.doc.length);
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "start" }),
  });
  view.focus();
}

/** Reposiciona la vista tras cambiar Render ↔ Markdown. */
export function restoreScrollAnchor(anchor: ScrollAnchor, mode: ViewMode): void {
  if (mode === "render") restoreRenderAnchor(anchor);
  else restoreEditorAnchor(anchor);
}
