import { Plus } from "lucide-react";
import { useAgentStore } from "../../store/agent";
import { useDocumentStore } from "../../store/document";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/menu";

export function FloatingInsert({ index, active = false }: { index: number; active?: boolean }) {
  const blurTrigger = () => {
    const focused = document.activeElement as HTMLElement | null;
    if (focused?.closest('[data-testid="floating-insert-trigger"]')) focused.blur();
  };
  const insert = (kind: "paragraph" | "section" | "agent") => {
    blurTrigger();
    if (kind === "agent") {
      void useAgentStore.getState().addAgentBlock(index);
      return;
    }
    useDocumentStore.getState().insertBlockAfter(index, kind);
  };
  const insertParagraph = () => {
    const before = useDocumentStore.getState();
    const existingPending = new Set(before.pending.map((block) => block.key));
    blurTrigger();
    useDocumentStore.getState().insertBlockAfter(index, "paragraph");
    const inserted = useDocumentStore
      .getState()
      .pending.find((block) => !existingPending.has(block.key));
    if (inserted) {
      window.setTimeout(
        () => useDocumentStore.getState().requestInlineEdit(inserted.key, "start"),
        0,
      );
    }
  };
  return (
    <div className="floating-insert" data-selection-retain="true" data-floating-insert>
      <span className="floating-insert-line" aria-hidden="true" />
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label="Insertar bloque debajo"
            data-testid="floating-insert-trigger"
            tabIndex={active ? 0 : -1}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") event.stopPropagation();
            }}
          >
            <Plus size={14} />
          </button>
        </MenuTrigger>
        <MenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
          <MenuItem onSelect={insertParagraph}>Párrafo</MenuItem>
          <MenuItem onSelect={() => insert("section")}>Sección</MenuItem>
          <MenuItem onSelect={() => insert("agent")}>Bloque de agente</MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}
