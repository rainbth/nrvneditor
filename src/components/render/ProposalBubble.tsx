import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeSideBubblePosition } from "../../lib/bubble-position";
import { springSoft } from "../../lib/motion";
import { resolveProposalAnchorKey } from "../../lib/proposal";
import { useAgentStore } from "../../store/agent";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";
import { useUiStore } from "../../store/ui";
import { ProposalCard } from "../agent/ProposalCard";

export function ProposalBubble() {
  const reduceMotion = useReducedMotion();
  const mode = useUiStore((state) => state.mode);
  const proposal = useAgentStore((state) => state.thread.proposal);
  const proposalId = proposal?.id;
  const revisionRequested = useAgentStore((state) => state.revisionRequested);
  const variantFromReview = useAgentStore((state) => state.variantFromReview);
  const [pos, setPos] = useState<ReturnType<typeof computeSideBubblePosition>>({
    top: 0,
    left: 0,
    placement: "right",
  });
  const [measured, setMeasured] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const lastBlockRef = useRef<HTMLElement | null>(null);
  const lastAnchorKeyRef = useRef<string | null>(null);
  const blocks = useDocumentStore((state) => state.blocks);
  const selection = useSelectionStore((state) => state);
  const anchorKey = resolveProposalAnchorKey(proposal, blocks, selectedIndexes(selection, blocks));
  const blockElement =
    typeof document !== "undefined" && anchorKey
      ? (Array.from(document.querySelectorAll<HTMLElement>("[data-block-key]")).find(
          (element) => element.dataset.blockKey === anchorKey,
        ) ?? null)
      : null;
  useEffect(() => {
    if (blockElement) {
      lastBlockRef.current = blockElement;
      lastAnchorKeyRef.current = anchorKey;
    }
  }, [blockElement, anchorKey]);

  const restoreAnchorFocus = useCallback(() => {
    const element = lastBlockRef.current;
    if (element?.isConnected) {
      element.focus();
      return;
    }
    if (lastAnchorKeyRef.current) {
      document
        .querySelector<HTMLElement>(`[data-block-key="${CSS.escape(lastAnchorKeyRef.current)}"]`)
        ?.focus();
    }
  }, []);

  const handleEscape = useCallback(
    (event: Pick<KeyboardEvent, "key" | "preventDefault" | "stopPropagation">) => {
      if (event.key !== "Escape" || !bubbleRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      blockElement?.focus();
    },
    [blockElement],
  );
  useEffect(() => {
    if (
      mode !== "render" ||
      !proposal ||
      proposal.kind !== "blocks" ||
      proposal.blocks.length < 2 ||
      !blockElement
    )
      return;
    setMeasured(false);
    const bubble = document.querySelector<HTMLElement>("[data-proposal-bubble]");
    if (!bubble) return;
    const recalc = () => {
      const rect = bubble.getBoundingClientRect();
      const position = computeSideBubblePosition(
        blockElement.getBoundingClientRect(),
        rect,
        {
          width: innerWidth,
          height: innerHeight,
        },
        (() => {
          const center = blockElement
            .closest<HTMLElement>(".center-column")
            ?.getBoundingClientRect();
          return center ? { left: center.left, right: center.right } : undefined;
        })(),
      );
      setPos(position);
      setMeasured(true);
    };
    recalc();
    const observer = new ResizeObserver(recalc);
    observer.observe(blockElement);
    observer.observe(bubble);
    const container = blockElement.closest("article");
    if (container) observer.observe(container);
    addEventListener("scroll", recalc, { capture: true, passive: true });
    addEventListener("resize", recalc);
    return () => {
      observer.disconnect();
      removeEventListener("scroll", recalc, true);
      removeEventListener("resize", recalc);
    };
  }, [mode, proposal, blockElement]);

  useEffect(() => {
    if (proposalId && measured) bubbleRef.current?.focus();
  }, [proposalId, measured]);

  useEffect(() => {
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [handleEscape]);

  if (typeof document === "undefined") return null;
  const visible =
    mode === "render" &&
    proposal?.kind === "blocks" &&
    proposal.blocks.length > 1 &&
    !!blockElement;
  const askChanges = () => {
    const ui = useUiStore.getState();
    if (!ui.agentOpen) ui.toggleAgent();
    useAgentStore.getState().requestChanges();
  };
  return createPortal(
    <AnimatePresence
      onExitComplete={() => {
        if (proposalId === undefined) restoreAnchorFocus();
      }}
    >
      {visible && proposal ? (
        <motion.div
          key="proposal-bubble"
          ref={bubbleRef}
          className="proposal-bubble"
          data-testid="proposal-bubble"
          data-placement={pos.placement}
          data-selection-retain={visible ? true : undefined}
          data-proposal-bubble
          role="dialog"
          aria-label="Propuesta del agente"
          tabIndex={-1}
          style={{ top: pos.top, left: pos.left, pointerEvents: measured ? undefined : "none" }}
          initial={{ opacity: 0, y: 4, scale: 0.985 }}
          animate={measured ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 4, scale: 0.985 }}
          exit={{ opacity: 0, y: 4, scale: 0.985 }}
          transition={reduceMotion ? { duration: 0 } : springSoft}
          onKeyDown={handleEscape}
        >
          <p className="sr-only" role="status" aria-live="polite">
            Propuesta lista para revisar junto al bloque.
          </p>
          <ProposalCard
            variant="inline"
            proposal={proposal}
            revisionRequested={revisionRequested}
            variantFromReview={variantFromReview}
            onAskChanges={askChanges}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
