import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import {
  Compartment,
  EditorState,
  Prec,
  type Range,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef, useState } from "react";
import { selectWholeDocument } from "../../lib/commands";
import { blockRangeForLines } from "../../lib/ranges";
import { setActiveEditorView } from "../../lib/view-anchor";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";
import { useUiStore } from "../../store/ui";
import { EditorFooter } from "./EditorFooter";

const CONTENT_DEBOUNCE_MS = 60;

/** Efecto que reemplaza las líneas realzadas por la selección de bloques. */
const setSelectedLines = StateEffect.define<ReadonlyArray<readonly [number, number]>>();

const selectionHighlight = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setSelectedLines)) continue;
      const doc = transaction.state.doc;
      const lines = new Set<number>();
      for (const [start, end] of effect.value) {
        for (let line = Math.max(0, start); line <= end; line += 1) {
          if (line < doc.lines) lines.add(line);
        }
      }
      const ranges: Range<Decoration>[] = [...lines]
        .sort((a, b) => a - b)
        .map((line) =>
          Decoration.line({ class: "cm-block-selected" }).range(doc.line(line + 1).from),
        );
      next = Decoration.set(ranges, true);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function codeLanguage(info: string) {
  const name = info.trim().toLowerCase();
  if (name === "ts" || name === "typescript" || name === "tsx") {
    return javascript({ typescript: true, jsx: name === "tsx" }).language;
  }
  if (name === "js" || name === "javascript" || name === "jsx") {
    return javascript({ jsx: name === "jsx" }).language;
  }
  if (name === "css") return css().language;
  if (name === "html" || name === "xml" || name === "svg") return html().language;
  return null;
}

/** Extensión de gutter: números + realce del número activo. */
const LINE_NUMBER_EXTENSIONS = [lineNumbers(), highlightActiveLineGutter()];

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--color-ink)", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--color-accent-text)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--color-muted)" },
  { tag: tags.monospace, color: "var(--color-accent-text)", fontFamily: "var(--font-mono)" },
  { tag: tags.quote, color: "var(--color-muted)" },
  { tag: [tags.meta, tags.processingInstruction], color: "var(--color-muted)" },
  { tag: [tags.keyword, tags.operator], color: "var(--color-accent-text)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--color-success)" },
  { tag: tags.comment, color: "var(--color-muted)", fontStyle: "italic" },
  { tag: [tags.number, tags.bool], color: "var(--color-warning)" },
]);

function editorTheme(dark: boolean) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        backgroundColor: "transparent",
        color: "var(--color-ink)",
        fontSize: "calc(13.5px * var(--page-zoom, 1))",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: "1.7",
        overflow: "auto",
        backgroundColor: "transparent",
      },
      ".cm-content": {
        // Carta reserva 96 px; la ascendencia y el line-padding dejan 94 px
        // arriba y 50 px a la izquierda para alinear el primer glifo con Render.
        padding: "94px 50px 56px",
        maxWidth: "none",
        margin: "0",
        fontFamily: "var(--font-mono)",
        caretColor: "var(--color-accent)",
      },
      ".cm-line": {
        padding: "0 8px",
      },
      ".cm-block-selected": {
        backgroundColor: "var(--color-selection-bg)",
        boxShadow: "inset 2px 0 0 var(--color-selection-bar)",
        borderTop: "1px solid transparent",
        borderBottom: "1px solid transparent",
      },
      ".cm-gutters": {
        background: "transparent",
        border: "none",
        color: "var(--color-muted)",
        fontSize: "calc(12px * var(--page-zoom, 1))",
        minWidth: "44px",
        paddingRight: "8px",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        minWidth: "44px",
      },
      ".cm-activeLineGutter": {
        background: "transparent",
        color: "var(--color-ink-secondary)",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-accent)" },
      // La selección de bloques ya se representa con la banda + barra
      // (`.cm-block-selected`); la selección nativa no debe duplicarla (C4).
      // Se mantiene `drawSelection()` y el estado de selección para copiar.
      // `drawSelection()` define el fondo con mayor especificidad
      // (`.cm-focused > .cm-scroller > .cm-selectionLayer ...`), así que se
      // replica esa profundidad para ganar la cascada.
      "& > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
        backgroundColor: "transparent",
      },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
        backgroundColor: "transparent",
      },
      ".cm-content ::selection, .cm-content::selection": {
        backgroundColor: "transparent",
      },
      ".cm-panels": {
        backgroundColor: "var(--color-surface)",
        color: "var(--color-ink)",
        borderColor: "var(--color-line)",
      },
      ".cm-searchMatch": { backgroundColor: "var(--color-warning-soft)" },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "var(--color-accent-soft)",
      },
      ".cm-tooltip": {
        backgroundColor: "var(--color-surface)",
        color: "var(--color-ink)",
        border: "1px solid var(--color-line)",
      },
    },
    { dark },
  );
}

function useResolvedTheme(): "light" | "dark" {
  const theme = useUiStore((state) => state.theme);
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

/** Publica la selección de texto en el store de selección como rango de bloques. */
function publishSelection(state: EditorState): void {
  const main = state.selection.main;
  if (main.empty) return;
  const blocks = useDocumentStore.getState().blocks;
  if (blocks.length === 0) return;
  const fromLine = state.doc.lineAt(main.from).number - 1;
  const endPosition = main.to > main.from ? main.to - 1 : main.to;
  const toLine = state.doc.lineAt(endPosition).number - 1;
  const range = blockRangeForLines(blocks, fromLine, toLine);
  if (!range) return;
  useSelectionStore.getState().selectIndexRange(range.start, range.end);
}

/**
 * Atajos de selección con prioridad máxima sobre el keymap nativo:
 * - `Mod-a` selecciona todos los bloques (no el texto del documento).
 * - `Escape` limpia el área de edición; si no hay, deja pasar el evento para
 *   que el panel de búsqueda pueda cerrarse.
 */
const selectionKeymap = Prec.highest(
  keymap.of([
    {
      key: "Mod-a",
      run: () => {
        selectWholeDocument();
        return true;
      },
    },
    {
      key: "Escape",
      run: () => {
        const selection = useSelectionStore.getState();
        if (selection.mode === "none") return false;
        selection.clear();
        return true;
      },
    },
  ]),
);

/** Editor Markdown CodeMirror 6 (fuente de verdad del texto en modo edición). */
export function MarkdownEditor() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounceRef = useRef<number | null>(null);
  const themeCompartment = useRef(new Compartment()).current;
  const lineNumbersCompartment = useRef(new Compartment()).current;
  const content = useDocumentStore((state) => state.content);
  const blocks = useDocumentStore((state) => state.blocks);
  const selAnchor = useSelectionStore((state) => state.anchor);
  const selFocus = useSelectionStore((state) => state.focus);
  const selMode = useSelectionStore((state) => state.mode);
  const showLineNumbers = useUiStore((state) => state.lineNumbers);
  const editorLineRequest = useUiStore((state) => state.editorLineRequest);
  const resolvedTheme = useResolvedTheme();
  const dark = resolvedTheme === "dark";
  const hasEditingArea =
    selectedIndexes({ anchor: selAnchor, focus: selFocus, mode: selMode }, blocks).length > 0;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const next = update.state.doc.toString();
        if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          debounceRef.current = null;
          useDocumentStore.getState().setContent(next);
        }, CONTENT_DEBOUNCE_MS);
      }
      if (update.selectionSet || update.docChanged) publishSelection(update.state);
    });

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: useDocumentStore.getState().content,
        extensions: [
          markdown({
            base: markdownLanguage,
            codeLanguages: codeLanguage,
          }),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          selectionKeymap,
          EditorView.lineWrapping,
          drawSelection(),
          syntaxHighlighting(markdownHighlight),
          selectionHighlight,
          lineNumbersCompartment.of(
            useUiStore.getState().lineNumbers ? LINE_NUMBER_EXTENSIONS : [],
          ),
          themeCompartment.of(editorTheme(useUiStore.getState().theme === "dark")),
          updateListener,
          EditorView.contentAttributes.of({
            "aria-label": "Editor Markdown",
            spellcheck: "false",
          }),
        ],
      }),
    });

    viewRef.current = view;
    setActiveEditorView(view);
    view.focus();

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setActiveEditorView(null);
      viewRef.current = null;
      view.destroy();
    };
  }, [themeCompartment, lineNumbersCompartment]);

  useEffect(() => {
    if (!editorLineRequest) return;
    const view = viewRef.current;
    if (!view) return;
    const line = Math.max(0, Math.min(view.state.doc.lines - 1, editorLineRequest.line));
    const pos = view.state.doc.line(line + 1).from;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
    useUiStore.getState().clearEditorLine();
  }, [editorLineRequest]);

  // Cambio de tema (light/dark) sin recrear el editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: themeCompartment.reconfigure(editorTheme(dark)) });
  }, [dark, themeCompartment]);

  // Números de línea: reconfigura el compartment sin recrear el editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lineNumbersCompartment.reconfigure(showLineNumbers ? LINE_NUMBER_EXTENSIONS : []),
    });
  }, [showLineNumbers, lineNumbersCompartment]);

  // Realce de las líneas de los bloques seleccionados (también en modo edición).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const indexes = selectedIndexes({ anchor: selAnchor, focus: selFocus, mode: selMode }, blocks);
    // Un solo rango continuo: las líneas en blanco entre bloques también
    // reciben realce, de modo que la banda y la barra no tengan huecos (C4).
    const ranges =
      indexes.length > 0
        ? [[blocks[indexes[0]].startLine, blocks[indexes[indexes.length - 1]].endLine] as const]
        : [];
    view.dispatch({ effects: setSelectedLines.of(ranges) });
  }, [selAnchor, selFocus, selMode, blocks]);

  // Cambio externo del contenido (toggle, recarga): reemplaza preservando scroll.
  // Si solo difieren los EOL (CRLF vs LF), no se despacha: evita marcar dirty
  // y reescribir el documento por una diferencia que no es del usuario.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    if (current.replace(/\r\n/g, "\n") === content.replace(/\r\n/g, "\n")) return;
    const scrollTop = view.scrollDOM.scrollTop;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
      scrollIntoView: false,
    });
    view.scrollDOM.scrollTop = scrollTop;
  }, [content]);

  return (
    <>
      <div
        className="editor-host"
        data-testid="editor"
        data-editing-area={hasEditingArea ? "true" : undefined}
        ref={hostRef}
      />
      <EditorFooter />
    </>
  );
}
