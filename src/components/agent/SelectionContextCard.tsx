import { X } from "lucide-react";
import { contextModeFor } from "../../lib/agent-context";
import { contextLabel } from "../../lib/block-labels";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";

/** Chip compacto con el contexto exacto que recibirá el agente. */
export function SelectionContextCard() {
  const blocks = useDocumentStore((state) => state.blocks);
  const pending = useDocumentStore((state) => state.pending);
  const anchor = useSelectionStore((state) => state.anchor);
  const focus = useSelectionStore((state) => state.focus);
  const mode = useSelectionStore((state) => state.mode);
  const clear = useSelectionStore((state) => state.clear);

  const indexes = selectedIndexes({ anchor, focus, mode }, blocks);
  const selected = indexes.map((index) => blocks[index]).filter((block) => block !== undefined);
  const contextMode = contextModeFor(blocks, indexes);
  const pendingKeys = new Set(pending.map((entry) => entry.key));
  const hasPending = selected.some((block) => block.pending || pendingKeys.has(block.key));

  return (
    <section
      className={
        contextMode === "document" ? "agent-context agent-context-document" : "agent-context"
      }
      aria-label={
        contextMode === "document" ? "Contexto del documento" : "Contexto de la selección"
      }
      data-testid="selection-badge"
      data-block-count={contextMode === "document" ? 0 : selected.length}
      data-context-mode={contextMode}
      data-selection-mode={mode}
      data-pending={hasPending ? "true" : undefined}
    >
      <span className="agent-context-title">{contextLabel(selected, pendingKeys, mode)}</span>
      {selected.length > 0 ? (
        <button
          type="button"
          className="agent-context-clear"
          aria-label="Quitar selección"
          onClick={clear}
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
