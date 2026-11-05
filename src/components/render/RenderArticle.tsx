import { useEffect, useMemo, useRef } from "react";
import { docKeyForDocument } from "../../lib/agent-session";
import { commentCountsByBlock } from "../../lib/annotations";
import { useAgentStore } from "../../store/agent";
import { useAnnotationsStore } from "../../store/annotations";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";
import { BlockBubbleToolbar } from "./BlockBubbleToolbar";
import { BlockCommentThread } from "./BlockCommentThread";
import { MarkdownBlock } from "./MarkdownBlock";
import { ProposalBubble } from "./ProposalBubble";
import { ReviewBubble } from "./ReviewBubble";
import { ReviewerPopover } from "./ReviewerPopover";

/**
 * Documento completo en modo lectura: un bloque por unidad del splitter.
 * Un clic fuera de cualquier bloque (y sin overlay abierto) limpia la selección.
 */
export function RenderArticle() {
  const path = useDocumentStore((state) => state.path);
  const localId = useDocumentStore((state) => state.localId);
  const load = useAnnotationsStore((state) => state.loadForDocument);
  const blocks = useDocumentStore((state) => state.blocks);
  const comments = useAnnotationsStore((state) => state.comments);
  const counts = useMemo(() => commentCountsByBlock(comments), [comments]);
  const anchor = useSelectionStore((state) => state.anchor);
  const focus = useSelectionStore((state) => state.focus);
  const mode = useSelectionStore((state) => state.mode);
  const blockPreview = useAgentStore((state) => state.blockPreview);
  const closeBlockPreview = useAgentStore((state) => state.closeBlockPreview);
  const lastPreviewBlockKey = useRef<string | null>(null);

  useEffect(() => {
    void load(docKeyForDocument(path, localId));
  }, [path, localId, load]);

  const selected = new Set(selectedIndexes({ anchor, focus, mode }, blocks));
  const activeIndex = focus ?? anchor ?? 0;
  useEffect(() => {
    if (!blockPreview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector("[data-overlay]")) return;
      event.preventDefault();
      closeBlockPreview();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeBlockPreview, blockPreview]);

  useEffect(() => {
    if (!blockPreview) {
      lastPreviewBlockKey.current = null;
      return;
    }
    if (blockPreview.source === "chat" || blockPreview.source === "narrative") return;
    if (lastPreviewBlockKey.current !== blockPreview.blockKey) {
      lastPreviewBlockKey.current = blockPreview.blockKey;
      return;
    }
    const index = blocks.findIndex((block) => block.key === blockPreview.blockKey);
    if (index >= 0 && !selected.has(index)) closeBlockPreview();
  }, [blockPreview, blocks, selected, closeBlockPreview]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          "[data-block-key], [data-format-toolbar], [data-block-bubble], [data-proposal-bubble], [data-critique-bubble], [contenteditable='true']",
        )
      )
        return;
      if (target.closest("[data-selection-retain]")) return;
      if (document.querySelector("[data-overlay]")) return;
      const selection = useSelectionStore.getState();
      if (selection.mode !== "none") selection.clear();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (blocks.length === 0) return null;

  return (
    <>
      <BlockBubbleToolbar />
      <ProposalBubble />
      <ReviewBubble />
      <ReviewerPopover />
      <BlockCommentThread />
      <article
        className="prose"
        aria-label="Documento"
        data-editing-area={selected.size > 0 ? "true" : undefined}
      >
        {blocks.map((block, index) => (
          <MarkdownBlock
            key={block.key}
            block={block}
            index={index}
            selected={selected.has(index)}
            preview={blockPreview?.blockKey === block.key ? blockPreview : undefined}
            active={index === activeIndex}
            isLast={index === blocks.length - 1}
            commentCount={counts[block.key] ?? 0}
          />
        ))}
      </article>
    </>
  );
}
