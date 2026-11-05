import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { audienceName, primaryReviewBlockKey } from "../../lib/audiences";
import { computeBubbleReservation, computeSideBubblePosition } from "../../lib/bubble-position";
import { springSoft } from "../../lib/motion";
import { reviewLensLabel } from "../../lib/review-lens";
import { useAgentStore } from "../../store/agent";
import { useUiStore } from "../../store/ui";
import { AudienceAvatar } from "../agent/AudienceAvatar";
import { ReviewActions, ReviewBody } from "../agent/ReviewCard";

export function ReviewBubble() {
  const reduceMotion = useReducedMotion();
  const mode = useUiStore((state) => state.mode);
  const review = useAgentStore((state) => state.review);
  const pendingReview = useAgentStore((state) => state.pendingReview);
  const busy = useAgentStore((state) => state.busy);
  const fittingPreview = useAgentStore((state) => state.blockPreview);
  const lens = useAgentStore((state) => state.reviewLensUsed ?? "complete");
  const clearReview = useAgentStore((state) => state.clearReview);
  const cancel = useAgentStore((state) => state.cancel);
  const anchorKey = review ? primaryReviewBlockKey(review) : pendingReview?.blockKey;
  const anchor =
    typeof document !== "undefined" && anchorKey
      ? (Array.from(document.querySelectorAll<HTMLElement>("[data-block-key]")).find(
          (el) => el.dataset.blockKey === anchorKey,
        ) ?? null)
      : null;
  const [position, setPosition] = useState<ReturnType<typeof computeSideBubblePosition>>({
    top: 0,
    left: 0,
    placement: "right",
  });
  const [measured, setMeasured] = useState(false);
  const visible =
    mode === "render" && fittingPreview === null && !!anchor && !!(review || pendingReview);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const audienceId = review?.audience ?? pendingReview?.audience ?? null;
  const handleEscape = useCallback(
    (event: Pick<KeyboardEvent, "key">) => {
      if (event.key !== "Escape") return;
      if (document.querySelector("[data-overlay]")) return;
      if (review) {
        clearReview();
        anchor?.focus();
      } else if (pendingReview) {
        void cancel();
      }
    },
    [review, pendingReview, clearReview, cancel, anchor],
  );
  useEffect(() => {
    if (mode !== "render" || !anchor || !anchorKey) return;
    setMeasured(false);
    const bubble = bubbleRef.current;
    if (!bubble) return;
    let followups = 0;
    let followupFrame = 0;
    const recalc = () => {
      let rect = bubble.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const viewport = { width: innerWidth, height: innerHeight };
      const center = anchor.closest<HTMLElement>(".center-column")?.getBoundingClientRect();
      const centerBounds = center ? { left: center.left, right: center.right } : undefined;
      const side = computeSideBubblePosition(anchorRect, rect, viewport, centerBounds);
      const applied = anchor.dataset.bubbleReserve;
      const appliedAmount = Number.parseFloat(anchor.dataset.bubbleReserveValue ?? "0") || 0;
      const prose = anchor.closest<HTMLElement>(".prose");
      const documentBlocks = prose ? Array.from(prose.querySelectorAll<HTMLElement>(".block")) : [];
      const anchorIndex = documentBlocks.indexOf(anchor);
      const previousBlock = anchorIndex > 0 ? documentBlocks[anchorIndex - 1] : null;
      const prevBottom = previousBlock
        ? previousBlock.getBoundingClientRect().bottom
        : anchorRect.top - (applied === "above" ? appliedAmount : 0);
      const reserve =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--bubble-reserve"),
        ) || 48;
      let next = side;
      if (side.placement === "left" || side.placement === "right") {
        bubble.style.removeProperty("max-height");
        delete anchor.dataset.bubbleReserve;
        delete anchor.dataset.bubbleReserveValue;
        delete anchor.dataset.reviewReserve;
        anchor.style.removeProperty("--bubble-reserve-active");
      } else {
        // A clamped top must not leave a full-height bubble covering earlier
        // text. Fit the bubble into the viewport area after the previous block;
        // its body remains scrollable when the available space is smaller.
        const availableHeight = viewport.height - prevBottom - 24;
        bubble.style.maxHeight = `${Math.max(80, Math.min(420, viewport.height * 0.5, availableHeight))}px`;
        rect = bubble.getBoundingClientRect();
        const reservation = computeBubbleReservation({
          prevBottom,
          block: {
            top: anchorRect.top,
            bottom: anchorRect.bottom,
            left: anchorRect.left,
            width: anchorRect.width,
          },
          size: { width: rect.width, height: rect.height },
          viewport,
          reserve,
          current: applied === "above" || applied === "below" ? applied : undefined,
        });
        anchor.dataset.bubbleReserve = reservation.placement;
        anchor.dataset.bubbleReserveValue = String(reservation.amount);
        anchor.dataset.reviewReserve = "true";
        anchor.style.setProperty("--bubble-reserve-active", `${reservation.amount}px`);
        next = {
          // Reservation computes a viewport-clamped top; don't replace it with
          // an anchor-relative value that can push the bubble below the viewport.
          top: reservation.top,
          left: side.left,
          placement: reservation.placement,
        };
        if (
          (anchor.dataset.bubbleReserve !== applied ||
            Math.abs(reservation.amount - appliedAmount) > 0.5) &&
          followups < 3
        ) {
          followups += 1;
          followupFrame = requestAnimationFrame(recalc);
        }
      }
      setPosition(next);
      setMeasured(true);
    };
    recalc();
    const observer = new ResizeObserver(recalc);
    observer.observe(anchor);
    observer.observe(bubble);
    const container = anchor.closest("article");
    if (container) observer.observe(container);
    addEventListener("scroll", recalc, { capture: true, passive: true });
    addEventListener("resize", recalc);
    return () => {
      if (followupFrame !== 0) cancelAnimationFrame(followupFrame);
      observer.disconnect();
      removeEventListener("scroll", recalc, true);
      removeEventListener("resize", recalc);
      delete anchor.dataset.bubbleReserve;
      delete anchor.dataset.bubbleReserveValue;
      delete anchor.dataset.reviewReserve;
      anchor.style.removeProperty("--bubble-reserve-active");
    };
  }, [mode, anchor, anchorKey]);
  useEffect(() => {
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [handleEscape]);
  useEffect(() => {
    if (!review) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && bubbleRef.current?.contains(event.target)) return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "[data-block-key], [data-selection-retain], .zoom-controls, .mode-toggle, " +
            ".agent-panel",
        )
      )
        return;
      clearReview();
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    return () => document.removeEventListener("pointerdown", dismissOutside, true);
  }, [review, clearReview]);
  useEffect(() => {
    if ((review || pendingReview) && measured) bubbleRef.current?.focus();
  }, [review, pendingReview, measured]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="review-bubble"
          ref={bubbleRef}
          className="critique-bubble review-bubble"
          data-testid="review-bubble"
          data-placement={position.placement}
          data-critique-bubble
          data-selection-retain={visible ? true : undefined}
          role="dialog"
          aria-label="Revisión del texto"
          tabIndex={-1}
          style={{
            ...position,
            pointerEvents: !measured ? "none" : undefined,
          }}
          initial={{ opacity: 0, y: 4, scale: 0.985 }}
          animate={measured ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 4, scale: 0.985 }}
          exit={{ opacity: 0, y: 4, scale: 0.985, transition: { duration: 0 } }}
          transition={reduceMotion ? { duration: 0 } : springSoft}
        >
          {busy && pendingReview && !review ? (
            <header className="critique-bubble-header" aria-live="polite">
              <AudienceAvatar id={audienceId ?? ""} size="sm" /> Revisando…
              <button
                className="critique-bubble-close critique-bubble-cancel"
                type="button"
                onClick={() => void cancel()}
              >
                Cancelar
              </button>
            </header>
          ) : review ? (
            <>
              <header className="critique-bubble-header">
                <AudienceAvatar id={audienceId ?? ""} size="sm" /> Revisión del texto ·{" "}
                {audienceName(audienceId)}
                <span data-testid="review-lens-label" className="review-lens-label">
                  {reviewLensLabel(lens)}
                </span>
                <button
                  className="critique-bubble-close"
                  type="button"
                  aria-label="Cerrar revisión"
                  onClick={() => {
                    clearReview();
                    anchor?.focus();
                  }}
                >
                  <X size={15} />
                </button>
              </header>
              <div className="critique-bubble-body">
                <div role="status" aria-live="polite">
                  <ReviewBody review={review} lens={lens} />
                </div>
                <ReviewActions />
              </div>
            </>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
