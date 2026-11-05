import { ArrowDown, ArrowUp, CopyPlus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { isFrontmatterBlock } from "../../lib/blocks";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";
import { useUiStore } from "../../store/ui";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/menu";
import { readEditableText } from "./editable-selection";

export function BlockActionsMenu() {
  const blocks = useDocumentStore((state) => state.blocks);
  const anchor = useSelectionStore((state) => state.anchor);
  const focus = useSelectionStore((state) => state.focus);
  const mode = useSelectionStore((state) => state.mode);
  const viewMode = useUiStore((state) => state.mode);
  const editingElement = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const indexes = selectedIndexes({ anchor, focus, mode }, blocks);
  const from = indexes[0] ?? -1;
  const to = indexes[indexes.length - 1] ?? -1;
  const protectedBlock = indexes.some((index) => isFrontmatterBlock(blocks[index]?.raw ?? ""));
  const invalid =
    indexes.length === 0 ||
    indexes.some((index) => blocks[index]?.pending) ||
    viewMode !== "render" ||
    protectedBlock;
  const operations = [
    {
      label: "Mover arriba",
      Icon: ArrowUp,
      shortcut: "⌘⇧↑",
      run: () => useDocumentStore.getState().moveSelectedBlocks("up"),
    },
    {
      label: "Mover abajo",
      Icon: ArrowDown,
      shortcut: "⌘⇧↓",
      run: () => useDocumentStore.getState().moveSelectedBlocks("down"),
    },
    {
      label: "Duplicar bloque",
      Icon: CopyPlus,
      shortcut: "⌘D",
      run: () => useDocumentStore.getState().duplicateSelectedBlocks(),
    },
    {
      label: "Eliminar bloque",
      Icon: Trash2,
      shortcut: "⌘⌫",
      tone: "danger" as const,
      run: () => useDocumentStore.getState().deleteSelectedBlocks(),
    },
  ].map((operation) => ({
    ...operation,
    disabled:
      invalid ||
      (operation.label === "Mover arriba" && indexes[0] === 0) ||
      (operation.label === "Mover arriba" && !!blocks[from - 1]?.pending) ||
      (operation.label === "Mover arriba" && isFrontmatterBlock(blocks[from - 1]?.raw ?? "")) ||
      (operation.label === "Mover abajo" && indexes[indexes.length - 1] === blocks.length - 1) ||
      (operation.label === "Mover abajo" && !!blocks[to + 1]?.pending) ||
      (operation.label === "Mover abajo" && isFrontmatterBlock(blocks[to + 1]?.raw ?? "")),
  }));
  return (
    <Menu
      onOpenChange={(open) => {
        if (!open) editingElement.current = null;
      }}
    >
      <MenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Operaciones del bloque"
          data-testid="block-actions-trigger"
          onMouseDown={() => {
            const active = document.activeElement;
            editingElement.current =
              active instanceof HTMLElement && active.dataset.blockEditable === "true"
                ? active
                : null;
          }}
        >
          ⋯
        </button>
      </MenuTrigger>
      <MenuContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        {operations.map(({ label, Icon, run, disabled, shortcut, tone }) => (
          <MenuItem
            key={label}
            disabled={disabled}
            shortcut={shortcut}
            tone={tone}
            onSelect={() => {
              const focused = document.activeElement;
              const active =
                editingElement.current ?? (focused instanceof HTMLElement ? focused : null);
              if (active instanceof HTMLElement && active.dataset.blockEditable === "true") {
                const index = Number(active.dataset.blockIndex);
                useDocumentStore.getState().confirmInlineEdit(index, readEditableText(active));
                useDocumentStore.getState().requestInlineEditExit();
              }
              editingElement.current = null;
              run();
            }}
          >
            <Icon size={15} />
            {label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
