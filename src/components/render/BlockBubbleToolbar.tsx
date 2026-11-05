import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeBubbleReservation } from "../../lib/bubble-position";
import { shouldShowBubble } from "../../lib/format-scope";
import { tweenQuick } from "../../lib/motion";
import { useAgentStore } from "../../store/agent";
import { useDocumentStore } from "../../store/document";
import { useSelectionStore } from "../../store/selection";
import { useUiStore } from "../../store/ui";
import { FormatToolbar } from "./FormatToolbar";

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Duración declarada de la transición de márgenes del bloque (ms). Se usa solo
 * como tope del fallback: si `transitionend` no llega, el reveal no puede
 * quedarse retenido indefinidamente.
 */
function marginTransitionFallbackMs(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const properties = style.transitionProperty.split(",").map((part) => part.trim());
  const durations = style.transitionDuration.split(",").map((part) => Number.parseFloat(part) || 0);
  const delays = style.transitionDelay.split(",").map((part) => Number.parseFloat(part) || 0);
  let ms = 0;
  for (const [index, property] of properties.entries()) {
    if (property !== "margin-top" && property !== "margin-bottom" && property !== "all") continue;
    const duration = durations[index % durations.length] ?? 0;
    const delay = delays[index % delays.length] ?? 0;
    ms = Math.max(ms, duration + delay);
  }
  return ms * 1000;
}

function clearStaleReservations(active: HTMLElement | null): void {
  for (const block of document.querySelectorAll<HTMLElement>(".prose .block")) {
    if (block === active) continue;
    if (block.dataset.reviewReserve === "true") continue;
    delete block.dataset.bubbleReserve;
    delete block.dataset.bubbleReserveValue;
    block.style.removeProperty("--bubble-reserve-active");
    block.style.removeProperty("--bubble-gap-above");
  }
}

let selectedBridgeBlocks = new Set<HTMLElement>();
let selectionBridgeBlocks = new Set<HTMLElement>();

/** Sincroniza puentes; el barrido completo solo ocurre al cambiar la selección. */
function syncSelectionBridges(refreshSelection = false): boolean {
  if (refreshSelection) {
    const blocks = [...document.querySelectorAll<HTMLElement>(".prose .block")];
    selectedBridgeBlocks = new Set(blocks.filter((block) => block.dataset.selected === "true"));
    selectionBridgeBlocks = new Set();
    for (const block of selectedBridgeBlocks) {
      const previous = block.previousElementSibling;
      if (previous instanceof HTMLElement && selectedBridgeBlocks.has(previous)) {
        selectionBridgeBlocks.add(block);
      }
    }
    for (const block of blocks) {
      if (!selectionBridgeBlocks.has(block)) block.style.removeProperty("--bubble-gap-above");
    }
  }
  let marginsAnimating = false;
  for (const block of selectionBridgeBlocks) {
    const previous = block.previousElementSibling;
    if (previous instanceof HTMLElement) {
      const gap = Math.max(
        0,
        block.getBoundingClientRect().top - previous.getBoundingClientRect().bottom,
      );
      block.style.setProperty("--bubble-gap-above", `${Math.round(gap * 2) / 2}px`);
    }
  }
  for (const block of selectedBridgeBlocks) {
    if (
      block
        .getAnimations()
        .some(
          (animation) =>
            animation instanceof CSSTransition &&
            (animation.transitionProperty === "margin-top" ||
              animation.transitionProperty === "margin-bottom") &&
            animation.playState === "running",
        )
    ) {
      marginsAnimating = true;
    }
  }
  return marginsAnimating;
}

export function BlockBubbleToolbar() {
  const reduceMotion = useReducedMotion();
  const mode = useUiStore((s) => s.mode);
  const pageZoom = useUiStore((s) => s.pageZoom);
  const element = useUiStore((s) => s.activeBlockElement);
  const bubbleDismissedFor = useUiStore((s) => s.bubbleDismissedFor);
  const dismissBubble = useUiStore((s) => s.dismissBubble);
  const reviewOpen = useAgentStore((s) => s.review !== null || s.pendingReview !== null);
  const proposalOpen = useAgentStore((s) => s.thread.proposal !== null);
  const blocks = useDocumentStore((s) => s.blocks.length);
  const anchor = useSelectionStore((s) => s.anchor);
  const focus = useSelectionStore((s) => s.focus);
  const selectionMode = useSelectionStore((s) => s.mode);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [revealed, setRevealed] = useState(false);
  const revealedRef = useRef(false);
  const revealElement = useRef<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pending = useRef<number | null>(null);
  const revealTimer = useRef<number | null>(null);
  const revealFrame = useRef<number | null>(null);
  const bridgeFrame = useRef<number | null>(null);
  const clearReveal = useCallback(() => {
    if (revealTimer.current !== null) clearTimeout(revealTimer.current);
    if (revealFrame.current !== null) cancelAnimationFrame(revealFrame.current);
    revealTimer.current = null;
    revealFrame.current = null;
  }, []);
  const anchorRect = element?.getBoundingClientRect();
  const visible =
    shouldShowBubble({
      mode,
      critiqueOpen: reviewOpen,
      proposalOpen,
      hasElement: !!element,
      blocks,
      selectionMode,
      contentEditable: !!element?.isContentEditable,
      elementIsActive: !!element && document.activeElement === element,
      dismissed:
        bubbleDismissedFor?.anchor === anchor && bubbleDismissedFor.selectionMode === selectionMode,
    }) &&
    !!anchorRect &&
    anchorRect.bottom >= 0 &&
    anchorRect.top <= innerHeight;
  const positionBubble = useCallback(() => {
    syncSelectionBridges();
    if (!visible || !element) return;
    if (revealElement.current !== element) {
      clearReveal();
      revealElement.current = element;
      if (!revealedRef.current) setRevealed(false);
    }
    const container = ref.current;
    if (!container) return;
    // Offset dimensions are not affected by the bubble's entry-scale animation.
    const nextSize = { width: container.offsetWidth, height: container.offsetHeight };
    if (nextSize.width === 0 || nextSize.height === 0) return;
    setSize((current) =>
      Math.abs(current.width - nextSize.width) > 0.5 ||
      Math.abs(current.height - nextSize.height) > 0.5
        ? nextSize
        : current,
    );
    const rect = element.getBoundingClientRect();
    const prev = element.previousElementSibling;
    const applied = element.dataset.bubbleReserve;
    const appliedAmount = Number(element.dataset.bubbleReserveValue ?? 0) || 0;
    const token =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--bubble-reserve"),
      ) || 48;
    const insert = element.querySelector<HTMLElement>(".floating-insert");
    const strip = insert
      ? Math.max(0, finite(insert.getBoundingClientRect().bottom, rect.bottom) - rect.bottom)
      : 0;
    const prevBottom =
      prev instanceof HTMLElement
        ? prev.getBoundingClientRect().bottom
        : rect.top - (applied === "above" ? appliedAmount : 0);
    const reservation = computeBubbleReservation({
      prevBottom,
      block: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
      size: nextSize,
      viewport: { width: innerWidth, height: innerHeight },
      reserve: token,
      strip,
      current: applied === "above" || applied === "below" ? applied : undefined,
    });
    let placement = reservation.placement;
    let amount = reservation.amount;
    const left = rect.left + rect.width / 2 - nextSize.width / 2;
    const clampedLeft =
      nextSize.width + 16 > innerWidth
        ? 8
        : Math.max(8, Math.min(left, innerWidth - nextSize.width - 8));
    const previousTransition = element.style.getPropertyValue("transition");
    const previousTransitionPriority = element.style.getPropertyPriority("transition");
    if (applied && applied !== placement) {
      element.style.setProperty("transition", "none", "important");
    }
    element.dataset.bubbleReserve = placement;
    element.dataset.bubbleReserveValue = String(amount);
    element.style.setProperty("--bubble-reserve-active", `${amount}px`);
    let settledBottom = rect.bottom;
    if (placement === "below") {
      if (applied && applied !== placement) void element.offsetHeight;
      settledBottom = finite(element.getBoundingClientRect().bottom, rect.bottom);
    }
    if (applied && applied !== placement) {
      if (previousTransition) {
        element.style.setProperty("transition", previousTransition, previousTransitionPriority);
      } else {
        element.style.removeProperty("transition");
      }
    }
    // Aplicar la reserva puede retirar el margen opuesto (above → below) y
    // desplazar el bloque; se vuelve a medir una vez para anclar `below` al
    // borde ya asentado. No es un reflujo redundante: sin él el top queda
    // obsoleto por el margen retirado.
    let top = reservation.top;
    if (placement === "below") {
      const settledReservation = computeBubbleReservation({
        prevBottom,
        block: { top: rect.top, bottom: settledBottom, left: rect.left, width: rect.width },
        size: nextSize,
        viewport: { width: innerWidth, height: innerHeight },
        reserve: token,
        strip,
        current: placement,
      });
      top = settledReservation.top;
      if (settledReservation.placement !== placement) {
        placement = settledReservation.placement;
        amount = settledReservation.amount;
        element.dataset.bubbleReserve = placement;
        element.dataset.bubbleReserveValue = String(amount);
        element.style.setProperty("--bubble-reserve-active", `${amount}px`);
      }
    }
    const marginTransitionRunning = element
      .getAnimations()
      .some(
        (animation) =>
          animation instanceof CSSTransition &&
          (animation.transitionProperty === "margin-top" ||
            animation.transitionProperty === "margin-bottom") &&
          animation.playState === "running",
      );
    // El reveal espera a que la reserva esté asentada en layout. Sin esto la
    // burbuja se pinta sobre el hueco todavía sin reservar (el párrafo previo)
    // y salta al terminar la transición de márgenes.
    if (!revealedRef.current) {
      if (marginTransitionRunning) {
        if (revealTimer.current === null) {
          revealTimer.current = window.setTimeout(
            () => {
              revealTimer.current = null;
              if (revealedRef.current) return;
              revealedRef.current = true;
              setRevealed(true);
            },
            Math.max(64, marginTransitionFallbackMs(element) + 80),
          );
        }
      } else if (revealFrame.current === null) {
        revealFrame.current = requestAnimationFrame(() => {
          revealFrame.current = null;
          if (revealTimer.current !== null) {
            clearTimeout(revealTimer.current);
            revealTimer.current = null;
          }
          revealedRef.current = true;
          setRevealed(true);
        });
      }
    }
    setPos((current) =>
      Math.abs(current.top - top) < 0.5 && Math.abs(current.left - clampedLeft) < 0.5
        ? current
        : { top, left: clampedLeft },
    );
  }, [visible, element, clearReveal]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: anchor/focus/selectionMode no se leen en el cuerpo, pero son el disparador intencional del barrido de puentes al cambiar de selección.
  useLayoutEffect(() => {
    clearStaleReservations(visible ? element : null);
    syncSelectionBridges(true);
    const started = performance.now();
    const syncDuringMarginTransition = () => {
      bridgeFrame.current = null;
      const animating = syncSelectionBridges();
      if (animating && performance.now() - started < 400) {
        bridgeFrame.current = requestAnimationFrame(syncDuringMarginTransition);
      }
    };
    // The full DOM scan is selection-change-only; scroll/transition frames update
    // the cached bridge set (bounded to 400 ms) to follow animated margins.
    syncDuringMarginTransition();
    positionBubble();
    return () => {
      if (bridgeFrame.current !== null) cancelAnimationFrame(bridgeFrame.current);
      bridgeFrame.current = null;
    };
  }, [anchor, focus, selectionMode, element, visible, positionBubble]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pageZoom no se lee en el cuerpo, pero es el disparador intencional del recálculo al cambiar el zoom de página.
  useEffect(() => {
    if (!visible || !element) return;
    const recalc = () => {
      syncSelectionBridges();
      if (pending.current !== null) return;
      pending.current = requestAnimationFrame(() => {
        pending.current = null;
        positionBubble();
      });
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.propertyName === "margin-top" || event.propertyName === "margin-bottom") recalc();
    };
    recalc();
    const observer = new ResizeObserver(recalc);
    observer.observe(element);
    const container = ref.current;
    if (container) observer.observe(container);
    addEventListener("scroll", recalc, { capture: true, passive: true });
    addEventListener("resize", recalc);
    element.addEventListener("transitionend", onTransitionEnd);
    element.addEventListener("transitioncancel", onTransitionEnd);
    return () => {
      observer.disconnect();
      if (pending.current !== null) cancelAnimationFrame(pending.current);
      pending.current = null;
      if (bridgeFrame.current !== null) cancelAnimationFrame(bridgeFrame.current);
      bridgeFrame.current = null;
      removeEventListener("scroll", recalc, true);
      removeEventListener("resize", recalc);
      element.removeEventListener("transitionend", onTransitionEnd);
      element.removeEventListener("transitioncancel", onTransitionEnd);
      clearStaleReservations(null);
    };
  }, [visible, element, positionBubble, pageZoom]);

  useEffect(() => {
    if (visible) return;
    clearReveal();
    revealedRef.current = false;
    revealElement.current = null;
  }, [visible, clearReveal]);

  useEffect(() => () => clearReveal(), [clearReveal]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence onExitComplete={() => setRevealed(false)}>
      {visible && element ? (
        <motion.div
          key="block-bubble"
          ref={ref}
          className="block-bubble"
          data-revealed={revealed ? "true" : undefined}
          data-block-bubble
          data-testid="block-bubble"
          role="toolbar"
          aria-label="Formato del bloque"
          style={{
            top: pos.top,
            left: pos.left,
            visibility: size.width === 0 || !revealed ? "hidden" : undefined,
            pointerEvents: revealed && visible ? undefined : "none",
          }}
          initial={{ opacity: 0, scale: 0.98, y: 4 }}
          animate={revealed ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.98, y: 4 }}
          exit={{ opacity: 0, scale: 0.98, y: 4 }}
          transition={reduceMotion ? { duration: 0 } : tweenQuick}
          onMouseDown={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              dismissBubble({ anchor, selectionMode });
              element.focus();
            }
          }}
        >
          <FormatToolbar
            activeKind={element.dataset.blockType === "paragraph" ? "paragraph" : "block"}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
