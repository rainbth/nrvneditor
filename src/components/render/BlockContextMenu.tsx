import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  History,
  Maximize2,
  MessageSquare,
  Minimize2,
  Scissors,
  Sparkles,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import { Fragment, type ReactNode, useRef, useState } from "react";
import { isFrontmatterBlock } from "../../lib/blocks";
import { selectWholeDocument } from "../../lib/commands";
import { type BlockContextAction, blockContextItems } from "../../lib/context-menu-items";
import { narrativeEligibility } from "../../lib/prompt";
import { useAgentStore } from "../../store/agent";
import { useAnnotationsStore } from "../../store/annotations";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";
import { useUiStore } from "../../store/ui";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { BlockVersionsDialog } from "./BlockVersionsDialog";

interface OpenContext {
  editableFocused: boolean;
  hasTextSelection: boolean;
  hasActiveBlock: boolean;
  operations: boolean;
  pending: boolean;
  atTop: boolean;
  atBottom: boolean;
  protected: boolean;
  prevPending: boolean;
  nextPending: boolean;
  prevProtected: boolean;
  nextProtected: boolean;
  narrativeCanExtend: boolean;
  narrativeCanReduce: boolean;
  narrativeExtendReason: string | null;
  narrativeReduceReason: string | null;
  narrativeBusyKind: "extend" | "reduce" | null;
}

function isEditableTarget(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

function hasInputSelection(element: Element | null): boolean {
  return (
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    element.selectionStart !== null &&
    element.selectionEnd !== null &&
    element.selectionStart !== element.selectionEnd
  );
}

export function BlockContextMenu({ children }: { children: ReactNode }) {
  const documentReady = useDocumentStore((state) => state.status === "ready");
  const mode = useUiStore((state) => state.mode);
  const activeBlockElement = useUiStore((state) => state.activeBlockElement);
  const selectionMode = useSelectionStore((state) => state.mode);
  const agentAvailable = useAgentStore((state) => state.status.state === "ready");
  const agentBusy = useAgentStore((state) => state.busy);
  const narrativeBusy = useAgentStore((state) => state.narrativeBusy);
  const contextTarget = useRef<HTMLElement | null>(null);
  const clickedBlockIndex = useRef(-1);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [currentRaw, setCurrentRaw] = useState("");
  const [openContext, setOpenContext] = useState<OpenContext>({
    editableFocused: false,
    hasTextSelection: false,
    hasActiveBlock: false,
    operations: false,
    pending: false,
    atTop: false,
    atBottom: false,
    protected: false,
    prevPending: false,
    nextPending: false,
    prevProtected: false,
    nextProtected: false,
    narrativeCanExtend: false,
    narrativeCanReduce: false,
    narrativeExtendReason: null,
    narrativeReduceReason: null,
    narrativeBusyKind: null,
  });

  const captureContext = (eventTarget: EventTarget | null) => {
    const target = eventTarget instanceof Element ? eventTarget : null;
    contextTarget.current = target instanceof HTMLElement ? target : null;
    const blockElement = target?.closest<HTMLElement>("[data-block-key]");
    const targetIndex = blockElement ? Number(blockElement.dataset.blockIndex) : -1;
    clickedBlockIndex.current = targetIndex;
    const currentSelection = useSelectionStore.getState();
    if (
      targetIndex >= 0 &&
      !selectedIndexes(currentSelection, useDocumentStore.getState().blocks).includes(targetIndex)
    ) {
      currentSelection.selectBlock(targetIndex);
    }
    const currentBlocks = useDocumentStore.getState().blocks;
    const targetBlock = targetIndex >= 0 ? currentBlocks[targetIndex] : undefined;
    const extend = targetBlock
      ? narrativeEligibility(targetBlock.type, targetBlock.raw, "extend")
      : { ok: false, reason: "No hay un bloque de texto seleccionado" };
    const reduce = targetBlock
      ? narrativeEligibility(targetBlock.type, targetBlock.raw, "reduce")
      : { ok: false, reason: "No hay un bloque de texto seleccionado" };
    const pendingBlock = !!targetBlock?.pending;
    const targetBusy =
      narrativeBusy && targetBlock && narrativeBusy.blockKey === targetBlock.key
        ? narrativeBusy.kind
        : null;
    const selected = selectedIndexes(useSelectionStore.getState(), currentBlocks);
    const activeElement = document.activeElement;
    const editableFocused = isEditableTarget(target) || isEditableTarget(activeElement);
    const hasTextSelection =
      !!window.getSelection()?.toString() ||
      hasInputSelection(target) ||
      hasInputSelection(activeElement);
    setOpenContext({
      editableFocused,
      hasTextSelection,
      hasActiveBlock:
        selectionMode !== "none" ||
        activeBlockElement !== null ||
        !!target?.closest("[data-block-key]"),
      operations: targetIndex >= 0,
      pending: selected.some((index) => currentBlocks[index]?.pending),
      atTop: selected[0] === 0,
      atBottom: selected[selected.length - 1] === currentBlocks.length - 1,
      protected: selected.some((index) => isFrontmatterBlock(currentBlocks[index]?.raw ?? "")),
      prevPending: selected.length > 0 && !!currentBlocks[selected[0] - 1]?.pending,
      nextPending:
        selected.length > 0 && !!currentBlocks[selected[selected.length - 1] + 1]?.pending,
      prevProtected:
        selected.length > 0 && isFrontmatterBlock(currentBlocks[selected[0] - 1]?.raw ?? ""),
      nextProtected:
        selected.length > 0 &&
        isFrontmatterBlock(currentBlocks[selected[selected.length - 1] + 1]?.raw ?? ""),
      narrativeCanExtend: extend.ok && !pendingBlock && agentAvailable && !agentBusy,
      narrativeCanReduce: reduce.ok && !pendingBlock && agentAvailable && !agentBusy,
      narrativeExtendReason: !agentAvailable
        ? "Conecta el agente para usarlo"
        : agentBusy
          ? "El agente está respondiendo; espera a que termine"
          : pendingBlock
            ? "El bloque está pendiente"
            : extend.reason,
      narrativeReduceReason: !agentAvailable
        ? "Conecta el agente para usarlo"
        : agentBusy
          ? "El agente está respondiendo; espera a que termine"
          : pendingBlock
            ? "El bloque está pendiente"
            : reduce.reason,
      narrativeBusyKind: targetBusy,
    });
  };

  const runReview = () => {
    const index = clickedBlockIndex.current;
    const blocks = useDocumentStore.getState().blocks;
    if (index < 0 || index >= blocks.length) return;
    const selection = useSelectionStore.getState();
    if (!selectedIndexes(selection, blocks).includes(index)) selection.selectBlock(index);
    useAgentStore.getState().openReviewerPicker();
  };

  const canEdit =
    documentReady &&
    (openContext.editableFocused || openContext.hasTextSelection || openContext.hasActiveBlock);
  const canClipboard =
    documentReady && (openContext.editableFocused || openContext.hasTextSelection);
  const items = blockContextItems({
    canEdit,
    canClipboard,
    agentAvailable,
    operations: openContext.operations,
    pending: openContext.pending,
    markdown: mode !== "render",
    atTop: openContext.atTop,
    atBottom: openContext.atBottom,
    protected: openContext.protected,
    prevPending: openContext.prevPending,
    nextPending: openContext.nextPending,
    prevProtected: openContext.prevProtected,
    nextProtected: openContext.nextProtected,
    narrative: {
      canExtend: openContext.narrativeCanExtend,
      canReduce: openContext.narrativeCanReduce,
      extendReason: openContext.narrativeExtendReason,
      reduceReason: openContext.narrativeReduceReason,
      busyKind: openContext.narrativeBusyKind,
      agentBusy,
    },
  });
  const run = (action: BlockContextAction): void => {
    switch (action) {
      case "cut":
        document.execCommand("cut");
        break;
      case "copy":
        document.execCommand("copy");
        break;
      case "paste":
        void navigator.clipboard
          .readText()
          .then((text) => document.execCommand("insertText", false, text))
          .catch(() => useUiStore.getState().setToast("No se pudo pegar"));
        break;
      case "select-all":
        if (
          contextTarget.current instanceof HTMLInputElement ||
          contextTarget.current instanceof HTMLTextAreaElement
        ) {
          contextTarget.current.select();
        } else if (
          contextTarget.current instanceof HTMLElement &&
          contextTarget.current.isContentEditable
        ) {
          document.execCommand("selectAll");
        } else {
          selectWholeDocument();
        }
        break;
      case "ask-agent":
        if (!useUiStore.getState().agentOpen) useUiStore.getState().toggleAgent();
        if (!useAgentStore.getState().instruction.trim()) {
          useAgentStore.getState().setInstruction("Sobre este bloque: ");
        }
        setTimeout(() => useAgentStore.getState().focusComposer(), 0);
        break;
      case "comment": {
        const block = useDocumentStore.getState().blocks[clickedBlockIndex.current];
        if (block) useAnnotationsStore.getState().openComposer(block.key, block.hash);
        break;
      }
      case "versions": {
        const block = useDocumentStore.getState().blocks[clickedBlockIndex.current];
        if (block) {
          setCurrentRaw(block.raw);
          setVersionsFor(block.key);
        }
        break;
      }
      case "review":
        runReview();
        break;
      case "extend-narrative":
        void useAgentStore.getState().narrativeRewrite("extend", clickedBlockIndex.current);
        break;
      case "reduce-narrative":
        void useAgentStore.getState().narrativeRewrite("reduce", clickedBlockIndex.current);
        break;
      case "move-up":
        useDocumentStore.getState().moveSelectedBlocks("up");
        break;
      case "move-down":
        useDocumentStore.getState().moveSelectedBlocks("down");
        break;
      case "duplicate":
        useDocumentStore.getState().duplicateSelectedBlocks();
        break;
      case "delete":
        useDocumentStore.getState().deleteSelectedBlocks();
        break;
    }
  };

  const icons: Partial<Record<BlockContextAction, ReactNode>> = {
    cut: <Scissors size={15} />,
    copy: <Copy size={15} />,
    paste: <ClipboardPaste size={15} />,
    "select-all": <TextCursorInput size={15} />,
    "ask-agent": <Sparkles size={15} />,
    comment: <MessageSquare size={15} />,
    versions: <History size={15} />,
    "extend-narrative": <Maximize2 size={15} />,
    "reduce-narrative": <Minimize2 size={15} />,
    "move-up": <ArrowUp size={15} />,
    "move-down": <ArrowDown size={15} />,
    duplicate: <CopyPlus size={15} />,
    delete: <Trash2 size={15} />,
  };

  if (mode !== "render") return children;

  return (
    <ContextMenuRoot>
      <ContextMenuTrigger asChild onContextMenu={(event) => captureContext(event.target)}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <div data-testid="block-context-menu" data-overlay="">
          {(["write", "review", "block"] as const).map((group) => {
            const grouped = items.filter((item) => item.group === group);
            const visibleGroup = group === "write" || openContext.operations;
            if (!visibleGroup) return null;
            if (!grouped.length) return null;
            const title =
              group === "write" ? "Escribir" : group === "review" ? "Revisar" : "Bloque";
            return (
              <Fragment key={group}>
                {group !== "write" && <ContextMenuSeparator />}
                <ContextMenuLabel>{title}</ContextMenuLabel>
                {grouped.map((item) => (
                  <FragmentMenuItem
                    key={item.action}
                    action={item.action}
                    label={item.label}
                    shortcut={item.shortcut}
                    tone={item.tone}
                    disabled={item.action === "review" ? item.disabled || agentBusy : item.disabled}
                    title={item.title}
                    icon={
                      item.action === "review" ? (
                        <Sparkles size={15} />
                      ) : (
                        (icons[item.action] ?? null)
                      )
                    }
                    testId={item.action === "review" ? "menu-review" : undefined}
                    onSelect={() => run(item.action)}
                  />
                ))}
              </Fragment>
            );
          })}
        </div>
      </ContextMenuContent>
      {versionsFor !== null && (
        <BlockVersionsDialog
          blockKey={versionsFor}
          currentRaw={currentRaw}
          onClose={() => setVersionsFor(null)}
        />
      )}
    </ContextMenuRoot>
  );
}

function FragmentMenuItem({
  action,
  label,
  shortcut,
  tone,
  disabled,
  title,
  testId,
  icon,
  onSelect,
}: {
  action: BlockContextAction;
  label: string;
  shortcut?: string;
  tone?: "danger";
  disabled: boolean;
  title?: string;
  testId?: string;
  icon: ReactNode;
  onSelect: () => void;
}) {
  return (
    <>
      {action === "ask-agent" && <ContextMenuSeparator />}
      <ContextMenuItem
        icon={icon}
        disabled={disabled}
        onSelect={onSelect}
        shortcut={shortcut}
        tone={tone}
        title={title}
        testId={testId}
      >
        {label}
      </ContextMenuItem>
    </>
  );
}
