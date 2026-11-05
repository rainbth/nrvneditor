import type { Element, ElementContent } from "hast";
import {
  type ComponentProps,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { shouldPreventBlockKey } from "../../lib/block-key";
import type { Block, BlockType } from "../../lib/blocks";
import { toggleViewMode } from "../../lib/commands";
import { resolveInlineTarget, toggleInlineFormat } from "../../lib/format-actions";
import { nrvn } from "../../lib/ipc";
import { normalizeHeadingText } from "../../lib/markdown";
import { useAgentStore } from "../../store/agent";
import { useAnnotationsStore } from "../../store/annotations";
import { useDocumentStore } from "../../store/document";
import { useSelectionStore } from "../../store/selection";
import { useUiStore } from "../../store/ui";
import { CodeBlock } from "./CodeBlock";
import {
  getCaretOffset,
  getSelectionOffsets,
  readEditableText,
  restoreSelection,
} from "./editable-selection";
import { FloatingInsert } from "./FloatingInsert";

export interface MarkdownBlockProps {
  block: Block;
  index: number;
  /** `true` si el bloque forma parte de la selección activa. */
  selected?: boolean;
  /** `true` si el bloque es el tab-stop del grupo (roving tabindex). */
  active?: boolean;
  isLast?: boolean;
  preview?: {
    blockKey: string;
    original: string;
    proposed: string;
    source: "chat" | "review" | "narrative" | "history";
    proposalId: string | null;
    versionDate?: number;
  };
  commentCount?: number;
}

/** Esquema estricto de sanitización para el contenido del usuario. */
const schema = defaultSchema;

const TYPE_LABEL: Record<BlockType, string> = {
  heading: "Sección",
  paragraph: "Párrafo",
  list: "Lista",
  table: "Tabla",
  code: "Código",
  quote: "Cita",
  hr: "Separador",
  html: "HTML",
};

const LABEL_MAX = 80;

/** Desplazamiento (px) a partir del cual el gesto es un arrastre y no un clic. */
const DRAG_THRESHOLD = 4;

function textOf(node: Element): string {
  let text = "";
  for (const child of node.children) {
    if (child.type === "text") text += child.value;
    else if (child.type === "element") text += textOf(child);
  }
  return text;
}

function classNameOf(node: Element | undefined): string[] {
  const value: unknown = node?.properties.className;
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") return value.split(/\s+/);
  return [];
}

/** Texto legible del bloque para el aria-label (sin marcadores Markdown). */
function spokenText(block: Block): string {
  const firstLine =
    block.raw
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const plain = normalizeHeadingText(
    firstLine
      .replace(/^>\s?/, "")
      .replace(/^(?:[-*+]|\d{1,9}[.)])\s+/, "")
      .replace(/^(?:`{3,}|~{3,})[^\n]*$/, ""),
  );
  if (plain.length <= LABEL_MAX) return plain;
  return `${plain.slice(0, LABEL_MAX - 1).trimEnd()}…`;
}

function blockLabel(block: Block): string {
  const label = TYPE_LABEL[block.type];
  if (block.type === "hr" || block.type === "html") return label;
  const text = spokenText(block);
  return text.length > 0 ? `${label}: ${text}` : label;
}

function scrollToAnchor(hash: string): void {
  let decoded = hash;
  try {
    decoded = decodeURIComponent(hash);
  } catch {
    // hash mal formado: se usa tal cual.
  }
  const headings = document.querySelectorAll<HTMLElement>(".prose [data-block-type='heading']");
  for (const heading of headings) {
    if ((heading.textContent ?? "").trim() === decoded.trim()) {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }
}

type PreProps = ComponentProps<"pre"> & ExtraProps;
type AnchorProps = ComponentProps<"a"> & ExtraProps;
type TableProps = ComponentProps<"table"> & ExtraProps;
type CodeProps = ComponentProps<"code"> & ExtraProps;

function PreRenderer({ node, children, ...props }: PreProps) {
  const codeElement = node?.children.find(
    (child: ElementContent): child is Element =>
      child.type === "element" && child.tagName === "code",
  );
  if (codeElement) {
    const classes = classNameOf(codeElement);
    const language = classes.find((name) => name.startsWith("language-"));
    const code = textOf(codeElement).replace(/\n$/, "");
    return <CodeBlock code={code} lang={language?.slice("language-".length)} />;
  }
  return <pre {...props}>{children}</pre>;
}

function AnchorRenderer({ node: _node, href, children, ...props }: AnchorProps) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!href) return;
    if (href.startsWith("#")) {
      event.preventDefault();
      scrollToAnchor(href.slice(1));
      return;
    }
    if (/^(https?:|mailto:)/i.test(href)) {
      event.preventDefault();
      void nrvn.app.openExternal(href);
    }
  };
  return (
    <a href={href} onClick={onClick} rel="noreferrer noopener" {...props}>
      {children}
    </a>
  );
}

function TableRenderer({ node: _node, children, ...props }: TableProps) {
  return (
    <div className="table-wrap">
      <table {...props}>{children}</table>
    </div>
  );
}

function CodeRenderer({ node: _node, children, ...props }: CodeProps) {
  return <code {...props}>{children}</code>;
}

/**
 * Las listas de tareas de GFM renderizan `<input type="checkbox" disabled>` sin
 * etiqueta. Son decorativas (el render no edita), así que se les da un nombre
 * accesible explícito en lugar de dejarlas como controles huérfanos.
 */
function InputRenderer({
  node: _node,
  type,
  checked,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { node?: unknown }) {
  if (type === "checkbox") {
    return (
      <input
        {...props}
        type="checkbox"
        checked={checked}
        aria-label={checked ? "Tarea completada" : "Tarea pendiente"}
      />
    );
  }
  return <input {...props} type={type} checked={checked} />;
}

const components: Components = {
  pre: PreRenderer,
  a: AnchorRenderer,
  table: TableRenderer,
  code: CodeRenderer,
  input: InputRenderer,
};

/**
 * Un bloque del documento renderizado de forma aislada. El clic selecciona el
 * bloque (o la sección si es un heading); Shift+clic extiende el rango.
 */
function MarkdownBlockInner({
  block,
  index,
  selected = false,
  active = false,
  isLast = false,
  preview,
  commentCount = 0,
}: MarkdownBlockProps) {
  useEffect(() => {
    // Instrumentación de medición solo si el host la activa; no-op en producción.
    if (typeof window === "undefined") return;
    const perf = (window as unknown as { __nrvnRenderCounts?: Record<string, number> })
      .__nrvnRenderCounts;
    if (!perf) return;
    perf[block.key] = (perf[block.key] ?? 0) + 1;
  });
  const tabIndex = active ? 0 : -1;
  /** Punto de inicio del gesto: distingue un clic de un arrastre de texto. */
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  /**
   * Origen del foco del bloque. Un `mousedown` local marca `pointer`; sin él, el
   * foco llega por teclado o desde el outline y se marca `keyboard`. El CSS usa
   * el atributo para pintar el anillo sólo cuando el foco no vino del ratón
   * (BRD §10.4: un rectángulo de foco dentro del grupo rompe la banda).
   */
  const [focusOrigin, setFocusOrigin] = useState<"pointer" | "keyboard">("pointer");
  const [previewSide, setPreviewSide] = useState<"original" | "proposed">(
    preview?.source === "history" ? "original" : "proposed",
  );
  /** `true` entre el `mousedown` y el `focus`/`click` que provoca ese gesto. */
  const pointerPressRef = useRef(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const wasPreviewing = useRef(false);
  const draftRef = useRef("");
  const pendingCaretRef = useRef<"start" | "end" | number | null>(null);
  const rawRef = useRef(block.raw);
  rawRef.current = block.raw;
  const [localEditing, setLocalEditing] = useState(false);
  const editRequest = useDocumentStore((state) =>
    state.editRequest?.key === block.key ? state.editRequest : null,
  );
  const editExitToken = useDocumentStore((state) => state.editExitToken);
  const previousEditExitToken = useRef(editExitToken);
  const editing = localEditing;
  const acceptBlockPreview = useAgentStore((state) => state.acceptBlockPreview);
  const rejectBlockPreview = useAgentStore((state) => state.rejectBlockPreview);
  const requestChangesBlockPreview = useAgentStore((state) => state.requestChangesBlockPreview);
  const busy = useAgentStore((state) => state.busy);
  const applying = useAgentStore((state) => state.applying);
  const isHistory = preview?.source === "history";

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is keyed to preview identity/content.
  useEffect(() => {
    setPreviewSide(preview?.source === "history" ? "original" : "proposed");
  }, [preview?.blockKey, preview?.proposed, preview?.source]);

  useEffect(() => {
    if (preview) {
      wasPreviewing.current = true;
      previewRef.current?.focus();
      return;
    }
    if (wasPreviewing.current) {
      wasPreviewing.current = false;
      const element = elementRef.current;
      if (!element) return;
      const frameId = requestAnimationFrame(() => {
        if (!element.isConnected) return;
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active !== element &&
          !element.contains(active) &&
          active.closest("[data-block-key]")
        )
          return;
        element.focus();
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [preview]);
  const editable =
    ["paragraph", "heading", "quote", "list"].includes(block.type) &&
    !(
      (index === 0 && block.raw.trimStart().startsWith("---")) ||
      ["code", "table", "html", "hr"].includes(block.type)
    );

  useEffect(() => {
    if (editRequest?.key !== block.key) return;
    if (block.pending) useSelectionStore.getState().selectBlock(index);
    pendingCaretRef.current = editRequest.caret;
    setLocalEditing(true);
    useDocumentStore.getState().clearInlineEdit();
  }, [editRequest, block.key, block.pending, index]);

  useLayoutEffect(() => {
    if (!editing) return;
    const el = elementRef.current;
    if (!el) return;
    const raw = rawRef.current;
    const currentText = readEditableText(el);
    if (currentText !== "" && currentText !== raw) return;
    if (el.textContent !== raw) el.textContent = raw;
    el.dataset.empty = String(raw.length === 0);
    el.focus();
    const caret = pendingCaretRef.current ?? "end";
    const offset =
      caret === "start"
        ? 0
        : caret === "end"
          ? raw.length
          : Math.max(0, Math.min(raw.length, caret));
    const range = document.createRange();
    range.selectNodeContents(el);
    const textNode = el.firstChild ?? el.appendChild(document.createTextNode(""));
    range.setStart(textNode, offset);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    pendingCaretRef.current = null;
  }, [editing]);

  useEffect(() => {
    const el = elementRef.current;
    if (!selected && !editing) return;
    useUiStore.getState().setActiveBlockElement(el);
    return () => {
      if (useUiStore.getState().activeBlockElement === el)
        useUiStore.getState().setActiveBlockElement(null);
    };
  }, [selected, editing]);

  const beginEdit = (caret: "start" | "end" | number = "end") => {
    if (!editable) return;
    draftRef.current = block.raw;
    pendingCaretRef.current = caret;
    setLocalEditing(true);
  };

  const exitEditing = useCallback(() => {
    if (elementRef.current) elementRef.current.textContent = "";
    elementRef.current?.removeAttribute("data-empty");
    setLocalEditing(false);
  }, []);

  const finishEdit = (confirm: boolean) => {
    if (!editing) return;
    const text = elementRef.current ? readEditableText(elementRef.current) : draftRef.current;
    if (confirm) useDocumentStore.getState().confirmInlineEdit(index, text);
    else useDocumentStore.getState().clearInlineEdit();
    exitEditing();
    window.getSelection()?.removeAllRanges();
  };

  useEffect(() => {
    if (previousEditExitToken.current === editExitToken) return;
    previousEditExitToken.current = editExitToken;
    if (!editing) return;
    exitEditing();
    window.getSelection()?.removeAllRanges();
  }, [editExitToken, editing, exitEditing]);

  const select = (extend: boolean) => {
    const selection = useSelectionStore.getState();
    if (extend) {
      selection.extendTo(index);
      return;
    }
    if (block.type === "heading") selection.selectSection(index);
    else selection.selectBlock(index);
  };

  /** Colapsa la selección de texto del documento (el realce de bloques basta). */
  const clearTextSelection = () => {
    window.getSelection()?.removeAllRanges();
  };

  /**
   * Con Shift el navegador extendería la selección de texto nativa desde el
   * último punto de inserción. Se cancela antes de que se aplique para que el
   * único feedback sea el realce de bloques.
   */
  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    pressRef.current = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    if (event.button === 0) {
      // El foco que provoque este gesto (si lo hay) es de puntero: sin anillo.
      pointerPressRef.current = true;
      setFocusOrigin((previous) => (previous === "pointer" ? previous : "pointer"));
    }
    if (!event.shiftKey) return;
    event.preventDefault();
    clearTextSelection();
  };

  /**
   * Sólo un `mousedown` previo sobre este bloque marca el foco como de puntero.
   * Chromium mantiene el foco en el ancla al Cancelar el `mousedown` del
   * Shift+clic y la tecla Shift cambia la modalidad a teclado, así que el ancla
   * pasaría a coincidir con `:focus-visible` sin haber recibido foco nuevo.
   */
  const onFocus = (_event: FocusEvent<HTMLDivElement>) => {
    const viaPointer = pointerPressRef.current;
    pointerPressRef.current = false;
    setFocusOrigin(viaPointer ? "pointer" : "keyboard");
  };

  /** `true` si el gesto fue un arrastre: el usuario está seleccionando texto. */
  const isTextDrag = (event: MouseEvent<HTMLDivElement>) => {
    const start = pressRef.current;
    if (!start) return false;
    return Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_THRESHOLD;
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (editing) return;
    if (preview) {
      pressRef.current = null;
      pointerPressRef.current = false;
      event.stopPropagation();
      clearTextSelection();
      return;
    }
    const dragged = isTextDrag(event);
    pressRef.current = null;
    pointerPressRef.current = false;
    // Un arrastre sobre el texto selecciona para copiar: no es un clic de bloque.
    if (dragged) return;
    event.stopPropagation();
    if (event.shiftKey) event.preventDefault();
    clearTextSelection();
    select(event.shiftKey);
    if (!event.shiftKey && editable) {
      const caret = document.caretRangeFromPoint?.(event.clientX, event.clientY);
      let offset: number | "end" = "end";
      if (caret && elementRef.current?.contains(caret.startContainer)) {
        const range = document.createRange();
        range.selectNodeContents(elementRef.current);
        range.setEnd(caret.startContainer, caret.startOffset);
        offset = Math.max(0, Math.min(block.raw.length, range.toString().length));
      }
      beginEdit(offset);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.target instanceof HTMLElement && event.target.closest(".block-preview")) return;
    if (editing) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") return;
      const meta = event.metaKey || event.ctrlKey;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finishEdit(false);
        return;
      }
      if (meta && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        finishEdit(true);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        useDocumentStore
          .getState()
          .splitInlineEdit(
            index,
            elementRef.current ? readEditableText(elementRef.current) : "",
            getCaretOffset(event.currentTarget),
          );
        exitEditing();
        return;
      }
      if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        const el = event.currentTarget;
        document.execCommand("insertText", false, "  \n");
        draftRef.current = elementRef.current
          ? readEditableText(elementRef.current)
          : draftRef.current;
        el.dataset.empty = String(draftRef.current.length === 0);
        return;
      }
      if (
        event.key === "Backspace" &&
        window.getSelection()?.isCollapsed &&
        getCaretOffset(event.currentTarget) === 0
      ) {
        event.preventDefault();
        event.stopPropagation();
        useDocumentStore.getState().mergeInlineEdit(index, readEditableText(event.currentTarget));
        exitEditing();
        return;
      }
      if (meta && ["b", "i", "k"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        const fmt =
          event.key.toLowerCase() === "b"
            ? "bold"
            : event.key.toLowerCase() === "i"
              ? "italic"
              : "link";
        const el = elementRef.current;
        if (el) {
          const text = readEditableText(el);
          const target = resolveInlineTarget(text, getSelectionOffsets(el)).target;
          if (!target) return;
          const result = toggleInlineFormat(text, target, fmt);
          el.textContent = result.raw;
          draftRef.current = result.raw;
          restoreSelection(el, result.selection);
        }
        return;
      }
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        finishEdit(false);
        event.shiftKey ? useDocumentStore.getState().redo() : useDocumentStore.getState().undo();
        return;
      }
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const container = event.currentTarget.closest(".prose");
      if (!container) return;
      const siblings = Array.from(container.querySelectorAll<HTMLElement>("[data-block-index]"));
      const position = siblings.indexOf(event.currentTarget);
      if (position === -1) return;
      const target = siblings[position + (event.key === "ArrowDown" ? 1 : -1)];
      if (!target) return;
      event.preventDefault();
      target.focus();
      target.scrollIntoView({ block: "nearest" });
      return;
    }

    if (!editing && shouldPreventBlockKey(event, editing)) {
      event.preventDefault();
      if (event.key === "Enter" && isLast) {
        useDocumentStore.getState().insertBlockAfter(index, "paragraph");
        return;
      }
      select(event.shiftKey);
      if (!event.shiftKey && editable) beginEdit();
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: el bloque es la unidad seleccionable; el foco y los atajos lo hacen operable sin role.
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: el brief exige aria-label en el bloque focusable; se evita role=button/group a propósito.
    <div
      ref={elementRef}
      className="block"
      data-previewing={preview ? "true" : undefined}
      contentEditable={editing ? "plaintext-only" : undefined}
      suppressContentEditableWarning
      data-block-editable={editing ? "true" : undefined}
      data-pending={block.pending ? "true" : undefined}
      data-empty={
        editing &&
        (elementRef.current ? readEditableText(elementRef.current) : block.raw).length === 0
          ? "true"
          : undefined
      }
      data-block-key={block.key}
      data-block-type={block.type}
      data-block-level={block.type === "heading" ? block.level : undefined}
      data-block-index={index}
      data-start-line={block.startLine + 1}
      data-line-count={block.endLine - block.startLine + 1}
      data-selected={selected ? "true" : undefined}
      data-focus-origin={focusOrigin}
      tabIndex={tabIndex}
      aria-label={`${blockLabel(block)}${block.pending ? " (pendiente de editar)" : ""}${selected ? " (seleccionado)" : ""}${editing ? " (editando)" : ""}${preview ? " (vista previa)" : ""}`}
      onMouseDown={onMouseDown}
      onMouseUp={() => {
        pointerPressRef.current = false;
      }}
      onFocus={onFocus}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onInput={(event) => {
        draftRef.current = readEditableText(event.currentTarget);
        event.currentTarget.dataset.empty = String(draftRef.current.length === 0);
      }}
      onBlur={(event) => {
        if (!event.relatedTarget?.closest("[data-format-toolbar], [data-block-bubble]"))
          finishEdit(true);
      }}
      onDoubleClick={() => beginEdit()}
    >
      {!editing && commentCount > 0 && (
        <button
          type="button"
          className="block-comment-badge"
          data-testid="block-comment-badge"
          aria-label={`${commentCount} comentario${commentCount === 1 ? "" : "s"} · abrir hilo`}
          title={`${commentCount} comentarios`}
          onClick={(event) => {
            event.stopPropagation();
            useAnnotationsStore.getState().openComposer(block.key, block.hash);
          }}
        >
          {commentCount}
        </button>
      )}
      {!editing && block.pending && <span className="pending-badge">Pendiente de editar</span>}
      {!editing && !editable && (
        <button
          type="button"
          data-testid="block-edit-markdown"
          onClick={(event) => {
            event.stopPropagation();
            useSelectionStore.getState().selectBlock(index);
            toggleViewMode("markdown");
            useUiStore.getState().requestEditorLine(block.startLine);
          }}
        >
          Editar en Markdown
        </button>
      )}
      {!editing && editable && <FloatingInsert index={index} active={active} />}
      {editing ? null : preview ? (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: el preview agrupa contenido y acciones; fieldset alteraría el layout del bloque. */}
          <div
            ref={previewRef}
            className="block-preview"
            data-testid="block-preview"
            role="group"
            aria-label={
              isHistory ? "Versión del bloque en comparación" : "Vista previa de la propuesta"
            }
            tabIndex={-1}
            data-side={previewSide}
          >
            <div className="block-preview-head">
              <span className="block-preview-badge" data-testid="block-preview-badge">
                {isHistory
                  ? `Vista previa · versión del ${new Date(preview.versionDate ?? Date.now()).toLocaleDateString("es-ES")}`
                  : "Vista previa"}
              </span>
              {!isHistory && (
                <span className="block-preview-source">
                  {
                    {
                      chat: "Propuesta del agente",
                      review: "Sugerencia de revisión",
                      narrative: "Reescritura narrativa",
                      history: "Versión anterior",
                    }[preview.source]
                  }
                </span>
              )}
              {/* biome-ignore lint/a11y/useSemanticElements: segmented side toggle needs group semantics without fieldset layout. */}
              <div
                className="block-preview-toggle"
                role="group"
                aria-label={
                  isHistory
                    ? "Comparar versiones del bloque"
                    : "Comparar versión original y propuesta"
                }
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    const side = event.key === "ArrowLeft" ? "original" : "proposed";
                    setPreviewSide(side);
                    event.currentTarget
                      .querySelector<HTMLButtonElement>(`[data-preview-side="${side}"]`)
                      ?.focus();
                  }
                }}
              >
                {(["original", "proposed"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    data-preview-side={side}
                    aria-pressed={previewSide === side}
                    onClick={() => setPreviewSide(side)}
                  >
                    {isHistory
                      ? side === "original"
                        ? "Actual"
                        : "Anterior"
                      : side === "original"
                        ? "Original"
                        : "Propuesta"}
                  </button>
                ))}
              </div>
            </div>
            <span className="sr-only" aria-live="polite">
              {isHistory
                ? previewSide === "original"
                  ? "Mostrando versión actual"
                  : "Mostrando versión anterior"
                : previewSide === "original"
                  ? "Mostrando versión original"
                  : "Mostrando propuesta"}
            </span>
            <div className="block-preview-original" hidden={previewSide !== "original"}>
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeSanitize, schema]]}
                components={components}
              >
                {preview.original}
              </Markdown>
            </div>
            <div className="block-preview-text" hidden={previewSide !== "proposed"}>
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeSanitize, schema]]}
                components={components}
              >
                {preview.proposed}
              </Markdown>
            </div>
            <div className="block-preview-actions">
              <button
                type="button"
                className="button button-primary"
                data-testid="block-preview-accept"
                disabled={busy || applying || (isHistory && previewSide === "original")}
                aria-busy={applying ? "true" : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  void acceptBlockPreview();
                }}
              >
                {isHistory ? "Restaurar" : "Aceptar"}
              </button>
              <button
                type="button"
                className="button"
                data-testid="block-preview-discard"
                aria-label={isHistory ? "Cerrar vista de historial" : "Rechazar la propuesta"}
                disabled={busy || applying}
                aria-busy={applying ? "true" : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  rejectBlockPreview();
                }}
              >
                {isHistory ? "Cerrar" : "Rechazar"}
              </button>
              {!isHistory && (
                <button
                  type="button"
                  className="button"
                  data-testid="block-preview-changes"
                  disabled={busy || applying}
                  aria-busy={applying ? "true" : undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    requestChangesBlockPreview();
                  }}
                >
                  Pedir cambios
                </button>
              )}
            </div>
          </div>
        </>
      ) : editing ? null : (
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeSanitize, schema]]}
          components={components}
        >
          {block.raw}
        </Markdown>
      )}
    </div>
  );
}

export function areMarkdownBlockPropsEqual(
  previous: MarkdownBlockProps,
  next: MarkdownBlockProps,
): boolean {
  return (
    previous.block.key === next.block.key &&
    previous.block.type === next.block.type &&
    previous.block.level === next.block.level &&
    previous.block.startLine === next.block.startLine &&
    previous.block.endLine === next.block.endLine &&
    previous.block.raw === next.block.raw &&
    previous.block.hash === next.block.hash &&
    previous.block.pending === next.block.pending &&
    previous.block.anchorKey === next.block.anchorKey &&
    previous.index === next.index &&
    previous.selected === next.selected &&
    previous.active === next.active &&
    previous.isLast === next.isLast &&
    previous.preview?.blockKey === next.preview?.blockKey &&
    previous.preview?.original === next.preview?.original &&
    previous.preview?.proposed === next.preview?.proposed &&
    previous.preview?.source === next.preview?.source &&
    previous.preview?.proposalId === next.preview?.proposalId &&
    (previous.commentCount ?? 0) === (next.commentCount ?? 0)
  );
}

export const MarkdownBlock = memo(MarkdownBlockInner, areMarkdownBlockPropsEqual);
