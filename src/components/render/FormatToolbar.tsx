import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Minus,
  Pilcrow,
  Quote,
  Sparkles,
  SquareCode,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { isFrontmatterBlock } from "../../lib/blocks";
import {
  type BlockFormat,
  canEditInlineBlock,
  type InlineFormat,
  resolveInlineTarget,
  toggleInlineFormat,
} from "../../lib/format-actions";
import { selectionScopeLabel } from "../../lib/format-scope";
import {
  NARRATIVE_REWRITE_LABELS,
  type NarrativeRewriteKind,
  narrativeEligibility,
} from "../../lib/prompt";
import { useAgentStore } from "../../store/agent";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";
import { useUiStore } from "../../store/ui";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/menu";
import { BlockActionsMenu } from "./BlockActionsMenu";
import { getSelectionOffsets, readEditableText, restoreSelection } from "./editable-selection";

export function FormatToolbar({ activeKind }: { activeKind: "paragraph" | "block" | null }) {
  const narrativeHintId = useId();
  const [scope, setScope] = useState<"selection" | "word" | "line" | "none">("none");
  const [inlineTarget, setInlineTarget] = useState<{ start: number; end: number } | null>(null);
  const [inlineState, setInlineState] = useState({
    bold: false,
    italic: false,
    code: false,
    link: false,
  });
  useEffect(() => {
    const update = () => {
      const el = document.activeElement;
      if (
        !(el instanceof HTMLElement) ||
        el.dataset.blockEditable !== "true" ||
        !el.isContentEditable
      ) {
        setScope("none");
        setInlineTarget(null);
        setInlineState({ bold: false, italic: false, code: false, link: false });
        return;
      }
      const text = readEditableText(el);
      const result = resolveInlineTarget(text, getSelectionOffsets(el));
      setScope(result.scope);
      setInlineTarget(result.target);
      const target = result.target ? text.slice(result.target.start, result.target.end) : "";
      setInlineState({
        bold: /(?:\*\*|__)[\s\S]+?(?:\*\*|__)/.test(target),
        italic: /(?:\*|_)[^*_]+(?:\*|_)/.test(target.replace(/\*\*[^*]+\*\*/g, "")),
        code: /`[^`]+`/.test(target),
        link: /\]\(/.test(target),
      });
    };
    document.addEventListener("selectionchange", update);
    document.addEventListener("input", update, true);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("input", update, true);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  const blocks = useDocumentStore((s) => s.blocks);
  const anchor = useSelectionStore((s) => s.anchor);
  const focus = useSelectionStore((s) => s.focus);
  const mode = useSelectionStore((s) => s.mode);
  const agentReady = useAgentStore((s) => s.status.state === "ready");
  const agentBusy = useAgentStore((s) => s.busy);
  const narrativeBusy = useAgentStore((s) => s.narrativeBusy);
  const selection = { anchor, focus, mode };
  const indexes = selectedIndexes(selection, blocks);
  const activeIndex = focus ?? anchor;
  const activeBlock = activeIndex == null ? undefined : blocks[activeIndex];
  const extendEligibility = activeBlock
    ? narrativeEligibility(activeBlock.type, activeBlock.raw, "extend")
    : { ok: false, reason: "Selecciona un párrafo, cita o lista" };
  const reduceEligibility = activeBlock
    ? narrativeEligibility(activeBlock.type, activeBlock.raw, "reduce")
    : { ok: false, reason: "Selecciona un párrafo, cita o lista" };
  const narrativeBusyKind =
    narrativeBusy && activeBlock && narrativeBusy.blockKey === activeBlock.key
      ? narrativeBusy.kind
      : null;
  const chosen = indexes.length === 1 ? blocks[indexes[0]] : undefined;
  const enabled =
    activeIndex !== null &&
    activeIndex !== undefined &&
    canEditInlineBlock(blocks[activeIndex]?.type) &&
    !isFrontmatterBlock(blocks[activeIndex]?.raw ?? "");
  const block = (label: string, format: BlockFormat, icon: React.ReactNode, active?: boolean) => (
    <button
      type="button"
      title={
        !enabled
          ? `${label}: no aplicable al bloque activo`
          : `${label}${indexes.length > 1 ? " (solo el bloque del cursor)" : ""}`
      }
      aria-label={label}
      aria-pressed={!!active}
      disabled={!enabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const activeElement = document.activeElement;
        const editingElement =
          activeElement instanceof HTMLElement && activeElement.dataset.blockEditable === "true"
            ? activeElement
            : null;
        const documentStore = useDocumentStore.getState();
        const editingIndex = editingElement ? Number(editingElement.dataset.blockIndex) : null;
        if (editingElement && editingIndex !== activeIndex) {
          documentStore.confirmInlineEdit(editingIndex as number, readEditableText(editingElement));
          documentStore.applyBlockFormat(
            format,
            activeIndex == null ? undefined : { index: activeIndex },
          );
        } else {
          documentStore.applyBlockFormat(
            format,
            activeIndex == null
              ? undefined
              : {
                  index: activeIndex,
                  ...(editingElement ? { text: readEditableText(editingElement) } : {}),
                },
          );
        }
        if (editingElement) documentStore.requestInlineEditExit();
      }}
    >
      {icon}
    </button>
  );
  const inline = (
    label: string,
    format: InlineFormat,
    icon: React.ReactNode,
    shortcut?: string,
  ) => (
    <button
      type="button"
      title={
        !enabled || !inlineTarget
          ? `${label}: selecciona texto editable`
          : shortcut
            ? `${label} (${shortcut})`
            : label
      }
      aria-label={label}
      aria-pressed={inlineState[format === "inline-code" ? "code" : format]}
      aria-keyshortcuts={shortcut ? `Meta+${shortcut.slice(-1)}` : undefined}
      disabled={!enabled || !inlineTarget}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active.dataset.blockEditable === "true" &&
          active.isContentEditable
        ) {
          const text = readEditableText(active);
          const resolved = resolveInlineTarget(text, getSelectionOffsets(active));
          if (!resolved.target) return;
          const out = toggleInlineFormat(text, resolved.target, format);
          active.textContent = out.raw;
          restoreSelection(active, out.selection);
          active.dispatchEvent(new InputEvent("input", { bubbles: true }));
        }
      }}
    >
      {icon}
    </button>
  );
  const narrative = (
    kind: NarrativeRewriteKind,
    label: string,
    icon: React.ReactNode,
    eligibility: { ok: boolean; reason: string | null },
  ) => {
    const busyKind = narrativeBusyKind;
    return (
      <button
        type="button"
        className="format-action"
        data-testid={`bubble-${kind}-narrative`}
        aria-label={label}
        aria-busy={busyKind === kind ? true : undefined}
        aria-describedby={`${narrativeHintId}-${kind}`}
        disabled={!eligibility.ok || !agentReady || agentBusy || activeIndex == null}
        title={
          !agentReady
            ? "Conecta el agente para usarlo"
            : agentBusy
              ? "El agente está respondiendo; espera a que termine"
              : busyKind === kind
                ? "Escribiendo…"
                : busyKind != null
                  ? "Ya hay una reescritura en curso"
                  : !eligibility.ok
                    ? `${label}: ${eligibility.reason}`
                    : label
        }
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (activeIndex == null) return;
          const el = document.activeElement;
          let idx = activeIndex;
          if (
            el instanceof HTMLElement &&
            el.dataset.blockEditable === "true" &&
            el.isContentEditable
          ) {
            idx = Number(el.dataset.blockIndex);
            const store = useDocumentStore.getState();
            store.confirmInlineEdit(idx, readEditableText(el));
            store.requestInlineEditExit();
          }
          if (!indexes.includes(idx)) useSelectionStore.getState().selectBlock(idx);
          void useAgentStore.getState().narrativeRewrite(kind, idx);
        }}
      >
        {icon}
        <span>
          {busyKind === kind ? "Escribiendo…" : kind === "extend" ? "Extender" : "Reducir"}
        </span>
      </button>
    );
  };
  const uniqueReasons = [
    ...new Set(
      [
        !extendEligibility.ok ? extendEligibility.reason : null,
        !reduceEligibility.ok ? reduceEligibility.reason : null,
      ].filter((reason): reason is string => !!reason),
    ),
  ];
  const narrativeUnavailableReason = uniqueReasons.join(" · ");
  return (
    <div className="format-toolbar" data-testid="format-toolbar" data-format-toolbar>
      <span data-testid="format-scope" className="format-scope">
        <span
          title={
            scope === "none" && !activeKind
              ? "Selecciona texto o un bloque para aplicar formato"
              : undefined
          }
        >
          {selectionScopeLabel(scope, activeKind)}
        </span>
      </span>
      {block("Párrafo", "paragraph", <Pilcrow size={15} />, chosen?.type === "paragraph")}
      {block("H1", "h1", <Heading1 size={15} />, chosen?.type === "heading" && chosen.level === 1)}
      {block("H2", "h2", <Heading2 size={15} />, chosen?.type === "heading" && chosen.level === 2)}
      {block("H3", "h3", <Heading3 size={15} />, chosen?.type === "heading" && chosen.level === 3)}
      <i />
      {inline("Negrita", "bold", <Bold size={15} />, "⌘B")}
      {inline("Cursiva", "italic", <Italic size={15} />, "⌘I")}
      {inline("Enlace", "link", <Link size={15} />, "⌘K")}
      {inline("Código inline", "inline-code", <Code size={15} />)}
      <i />
      {block("Lista con viñetas", "bullet-list", <List size={15} />)}
      {block("Lista numerada", "numbered-list", <ListOrdered size={15} />)}
      {block("Cita", "quote", <Quote size={15} />)}
      {block("Bloque de código", "code-block", <SquareCode size={15} />)}
      {block("Separador", "hr", <Minus size={15} />)}
      <i />
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            data-testid="insert-menu-trigger"
            aria-label="Insertar bloque debajo"
            title="Insertar bloque"
          >
            +
          </button>
        </MenuTrigger>
        <MenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
          <MenuItem
            onSelect={() => {
              const existingPending = new Set(
                useDocumentStore.getState().pending.map((b) => b.key),
              );
              useDocumentStore.getState().insertBlockAfter(activeIndex ?? null, "paragraph");
              const inserted = useDocumentStore
                .getState()
                .pending.find((b) => !existingPending.has(b.key));
              if (inserted) {
                window.setTimeout(
                  () => useDocumentStore.getState().requestInlineEdit(inserted.key, "start"),
                  0,
                );
              }
            }}
          >
            Párrafo
          </MenuItem>
          <MenuItem
            onSelect={() =>
              useDocumentStore.getState().insertBlockAfter(activeIndex ?? null, "section")
            }
          >
            Sección
          </MenuItem>
          <MenuItem
            onSelect={() => {
              void useAgentStore
                .getState()
                .addAgentBlock(activeIndex ?? null)
                .finally(() => useAgentStore.getState().focusComposer());
            }}
          >
            Bloque de agente
          </MenuItem>
        </MenuContent>
      </Menu>
      <i />
      <button
        type="button"
        className="format-action"
        data-testid="bubble-review"
        title="Revisar · elegir revisor"
        aria-label="Revisar · elegir revisor"
        disabled={!agentReady || agentBusy}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (activeIndex == null) return;
          if (!indexes.includes(activeIndex)) useSelectionStore.getState().selectBlock(activeIndex);
          useAgentStore.getState().openReviewerPicker();
        }}
      >
        <Sparkles size={15} aria-hidden="true" /> <span>Revisar</span>
      </button>
      <button
        type="button"
        className="format-action"
        data-testid="bubble-ask"
        title="Pedir al agente"
        aria-label="Pedir al agente"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!useUiStore.getState().agentOpen) useUiStore.getState().toggleAgent();
          useAgentStore.getState().focusComposer();
        }}
      >
        <MessageSquarePlus size={15} aria-hidden="true" /> <span>Pedir</span>
      </button>
      <i />
      {narrative(
        "extend",
        NARRATIVE_REWRITE_LABELS.extend,
        <Maximize2 size={15} aria-hidden="true" />,
        extendEligibility,
      )}
      {narrative(
        "reduce",
        NARRATIVE_REWRITE_LABELS.reduce,
        <Minimize2 size={15} aria-hidden="true" />,
        reduceEligibility,
      )}
      <span className="sr-only" id={`${narrativeHintId}-extend`}>
        {!extendEligibility.ok
          ? `Extender narrativa: ${extendEligibility.reason}`
          : !agentReady
            ? "Extender narrativa: Conecta el agente para usarlo"
            : agentBusy
              ? "Extender narrativa: El agente está respondiendo"
              : "Extender narrativa disponible"}
      </span>
      <span className="sr-only" id={`${narrativeHintId}-reduce`}>
        {!reduceEligibility.ok
          ? `Reducir narrativa: ${reduceEligibility.reason}`
          : !agentReady
            ? "Reducir narrativa: Conecta el agente para usarlo"
            : agentBusy
              ? "Reducir narrativa: El agente está respondiendo"
              : "Reducir narrativa disponible"}
      </span>
      {narrativeUnavailableReason && (
        <span
          className="format-narrative-note"
          data-testid="narrative-unavailable"
          title={narrativeUnavailableReason}
        >
          {narrativeUnavailableReason}
        </span>
      )}
      <BlockActionsMenu />
    </div>
  );
}
