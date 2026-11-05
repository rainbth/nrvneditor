import { EditorView } from "@codemirror/view";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { activeOutlineKeyForLine, type OutlineItem } from "../../lib/markdown";
import { getActiveEditorView } from "../../lib/view-anchor";
import { useDocumentStore } from "../../store/document";
import { useUiStore } from "../../store/ui";

export interface OutlinePanelProps {
  onSelect?: (line: number) => void;
}

/** Outline del documento activo: scroll al heading y marca del heading visible. */
export function OutlinePanel({ onSelect }: OutlinePanelProps) {
  const outline = useDocumentStore((state) => state.outline);
  const blocks = useDocumentStore((state) => state.blocks);
  const mode = useUiStore((state) => state.mode);
  const [open, setOpen] = useState(true);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Heading activo según el scroll de la prosa (IntersectionObserver throttled).
  // `blocks` re-observa los headings cuando el documento cambia.
  // biome-ignore lint/correctness/useExhaustiveDependencies: los headings viven en `blocks`.
  useEffect(() => {
    if (mode !== "render") {
      setActiveKey(null);
      return;
    }
    const scroller = document.querySelector<HTMLElement>("[data-document-scroll]");
    if (!scroller) return;
    const headings = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-block-type='heading']"),
    );
    if (headings.length === 0) return;

    const visible = new Map<string, number>();
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.blockKey;
          if (!key) continue;
          if (entry.isIntersecting) visible.set(key, entry.boundingClientRect.top);
          else visible.delete(key);
        }
        if (frame !== 0) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          let best: string | null = null;
          let bestTop = Number.POSITIVE_INFINITY;
          for (const [key, top] of visible) {
            if (top < bestTop) {
              bestTop = top;
              best = key;
            }
          }
          setActiveKey(best);
        });
      },
      { root: scroller, rootMargin: "-8% 0px -72% 0px", threshold: [0] },
    );
    for (const heading of headings) observer.observe(heading);
    return () => {
      observer.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [mode, blocks]);

  // Heading activo en Markdown: la línea visible del editor, no la selección.
  // `view` puede no existir aún (el editor monta después del panel): reintenta unos frames.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `blocks` solo fuerza el recálculo.
  useEffect(() => {
    if (mode !== "markdown") return;

    let view: EditorView | null = null;
    let frame = 0;
    let retryFrame = 0;
    let retries = 0;

    const update = () => {
      if (!view) return;
      const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 8).from;
      const line = view.state.doc.lineAt(top).number - 1;
      setActiveKey(activeOutlineKeyForLine(outline, line));
    };

    const onScroll = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    const waitForView = () => {
      const candidate = getActiveEditorView();
      if (candidate) {
        view = candidate;
        view.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
        update();
        return;
      }
      if (retries >= 20) return;
      retries += 1;
      retryFrame = window.requestAnimationFrame(waitForView);
    };

    waitForView();

    return () => {
      if (retryFrame !== 0) window.cancelAnimationFrame(retryFrame);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      view?.scrollDOM.removeEventListener("scroll", onScroll);
    };
  }, [mode, outline, blocks]);

  const selectItem = (item: OutlineItem) => {
    const block = blocks[item.blockIndex];
    if (mode === "render") {
      const target = document.querySelector<HTMLElement>(
        `[data-block-key="${CSS.escape(item.key)}"]`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const view = getActiveEditorView();
    if (view && block) {
      const pos = Math.min(block.startOffset, view.state.doc.length);
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: "start" }),
      });
      view.focus();
      return;
    }
    onSelect?.(item.line);
  };

  return (
    <section className="outline" aria-label="Outline del documento">
      <button
        type="button"
        className="outline-header"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="outline-chevron" aria-hidden="true">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span>Outline</span>
        <span className="outline-count">{outline.length}</span>
      </button>
      {open ? (
        outline.length === 0 ? (
          <p className="outline-empty">Sin headings</p>
        ) : (
          <nav className="outline-list" aria-label="Outline del documento">
            {outline.map((item) => (
              <button
                key={item.key}
                type="button"
                className="outline-item"
                data-outline-key={item.key}
                aria-current={activeKey === item.key ? "true" : undefined}
                style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
                onClick={() => selectItem(item)}
                title={`Línea ${item.line + 1}`}
              >
                {item.text}
              </button>
            ))}
          </nav>
        )
      ) : null}
    </section>
  );
}
