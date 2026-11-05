import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { REVIEWERS } from "../../lib/audiences";
import { computeSideBubblePosition } from "../../lib/bubble-position";
import { springSnappy, tweenQuick } from "../../lib/motion";
import { REVIEW_LENSES } from "../../lib/review-lens";
import { useAgentStore } from "../../store/agent";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";
import { AudienceAvatar } from "./AudienceAvatar";

export function ReviewerPicker() {
  const reduceMotion = useReducedMotion();
  const open = useAgentStore((state) => state.reviewerPickerOpen);
  const audience = useAgentStore((state) => state.audience);
  const [selectedReviewer, setSelectedReviewer] = useState<string | null>(null);
  const [step, setStep] = useState<"reviewer" | "lens">("reviewer");
  const close = useAgentStore((state) => state.closeReviewerPicker);
  const blocks = useDocumentStore((state) => state.blocks);
  const selection = useSelectionStore();
  const indexes = selectedIndexes(selection, blocks);
  const index = selection.focus ?? selection.anchor ?? indexes[0];
  const key = index === undefined ? null : (blocks[index]?.key ?? null);
  const anchor =
    typeof document === "undefined" || !key
      ? null
      : (Array.from(document.querySelectorAll<HTMLElement>("[data-block-key]")).find(
          (el) => el.dataset.blockKey === key,
        ) ?? null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const firstReviewerRef = useRef<HTMLButtonElement>(null);
  const firstLensRef = useRef<HTMLButtonElement>(null);
  const focusedStepRef = useRef<"reviewer" | "lens" | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<ReturnType<typeof computeSideBubblePosition>>({
    top: 0,
    left: 0,
    placement: "right",
  });
  const [measured, setMeasured] = useState(false);

  const focusStepTarget = useCallback((targetStep: "reviewer" | "lens") => {
    const refTarget = targetStep === "lens" ? firstLensRef.current : firstReviewerRef.current;
    const selector = targetStep === "lens" ? ".reviewer-lens-card" : ".reviewer-card";
    const target = refTarget ?? pickerRef.current?.querySelector<HTMLElement>(selector) ?? null;
    if (target) {
      const stepChanged = focusedStepRef.current !== targetStep;
      const focusOutsidePicker = !pickerRef.current?.contains(document.activeElement);
      if (stepChanged || focusOutsidePicker) target.focus();
      focusedStepRef.current = targetStep;
      return;
    }
    requestAnimationFrame(() => {
      const fallback = pickerRef.current?.querySelector<HTMLElement>(selector);
      if (fallback) {
        const stepChanged = focusedStepRef.current !== targetStep;
        const focusOutsidePicker = !pickerRef.current?.contains(document.activeElement);
        if (stepChanged || focusOutsidePicker) fallback.focus();
        focusedStepRef.current = targetStep;
      }
    });
  }, []);

  useEffect(() => {
    if (open) {
      setStep("reviewer");
      setSelectedReviewer(null);
    } else {
      setStep("reviewer");
      setSelectedReviewer(null);
    }
  }, [open]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (step === "lens") {
          setStep("reviewer");
          setSelectedReviewer(null);
          return;
        }
        close();
        return;
      }
      if (event.key !== "Tab" || !pickerRef.current) return;
      const focusable = Array.from(
        pickerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    },
    [close, step],
  );

  useEffect(() => {
    if (!open || !anchor || !pickerRef.current) return;
    setMeasured(false);
    const recalc = () => {
      const rect = pickerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const bounds = anchor.closest<HTMLElement>(".center-column")?.getBoundingClientRect();
      setPosition(
        computeSideBubblePosition(
          anchor.getBoundingClientRect(),
          rect,
          { width: innerWidth, height: innerHeight },
          bounds ? { left: bounds.left, right: bounds.right } : undefined,
        ),
      );
      setMeasured(true);
    };
    recalc();
    const observer = new ResizeObserver(recalc);
    observer.observe(anchor);
    observer.observe(pickerRef.current);
    addEventListener("scroll", recalc, { capture: true, passive: true });
    addEventListener("resize", recalc);
    return () => {
      observer.disconnect();
      removeEventListener("scroll", recalc, true);
      removeEventListener("resize", recalc);
    };
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const activeElement =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    returnFocusRef.current = activeElement?.closest(".reviewer-picker")
      ? (document.querySelector<HTMLElement>("[data-testid='bubble-review']") ?? activeElement)
      : (activeElement ?? document.querySelector<HTMLElement>("[data-testid='bubble-review']"));
    window.addEventListener("keydown", onKeyDown, true);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", outside, true);
      const stored = returnFocusRef.current;
      if (stored?.isConnected && !stored.closest("[data-block-key]") && stored !== document.body) {
        stored.focus();
        return;
      }
      const bubbleReview = document.querySelector<HTMLElement>("[data-testid='bubble-review']");
      const bubbleRect = bubbleReview?.getBoundingClientRect();
      const target =
        bubbleRect && bubbleRect.width > 0 && bubbleRect.height > 0 ? bubbleReview : null;
      target?.focus();
    };
  }, [open, onKeyDown, close]);

  if (typeof document === "undefined") return null;
  const visible = open && indexes.length > 0 && !!anchor;
  return createPortal(
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="reviewer-picker"
          initial={{ opacity: 0, y: 6 }}
          animate={measured ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          exit={{ opacity: 0, y: 6 }}
          transition={reduceMotion ? { duration: 0 } : springSnappy}
          ref={pickerRef}
          className="reviewer-picker"
          data-selection-retain={visible ? true : undefined}
          data-overlay
          data-testid="reviewer-picker"
          role="dialog"
          aria-label={step === "reviewer" ? "Elegir revisor" : "Elegir lente de revisión"}
          aria-modal="true"
          data-placement={position.placement}
          style={{ ...position, pointerEvents: measured ? undefined : "none" }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={reduceMotion ? { duration: 0 } : tweenQuick}
              onAnimationStart={() => {
                if (open) focusStepTarget(step);
              }}
              onAnimationComplete={() => {
                if (open) focusStepTarget(step);
              }}
            >
              <header className="reviewer-picker-header">
                <div>
                  <h2>{step === "reviewer" ? "Elige un ayudante" : "Elige una lente"}</h2>
                  <p>
                    {step === "reviewer"
                      ? "Un ayudante con un rol concreto que critica este bloque. No es la audiencia."
                      : `Revisión desde la perspectiva de ${REVIEWERS.find((reviewer) => reviewer.id === selectedReviewer)?.name ?? "el revisor"}. Elige qué quieres explorar.`}
                  </p>
                </div>
                {step === "lens" ? (
                  <button
                    type="button"
                    className="reviewer-picker-back"
                    data-testid="reviewer-back"
                    aria-label="Volver a revisores"
                    onClick={() => {
                      setStep("reviewer");
                      setSelectedReviewer(null);
                    }}
                  >
                    Volver
                  </button>
                ) : null}
                <button
                  type="button"
                  className="critique-bubble-close"
                  aria-label="Cerrar selector de revisor"
                  onClick={close}
                >
                  <X size={15} />
                </button>
              </header>
              {step === "reviewer" ? (
                <>
                  {/* biome-ignore lint/a11y/useSemanticElements: el brief requiere un grupo ARIA para estos botones. */}
                  <div className="reviewer-grid" role="group" aria-label="Revisores disponibles">
                    {REVIEWERS.map((reviewer, i) => (
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { ...tweenQuick, delay: Math.min(i, 6) * 0.02 }
                        }
                        ref={(node) => {
                          if (i !== 0) return;
                          firstReviewerRef.current = node;
                          if (node && open) focusStepTarget("reviewer");
                        }}
                        type="button"
                        className="reviewer-card"
                        data-reviewer={reviewer.id}
                        aria-pressed={
                          selectedReviewer === null
                            ? audience === reviewer.id
                            : selectedReviewer === reviewer.id
                        }
                        key={reviewer.id}
                        onClick={() => {
                          setSelectedReviewer(reviewer.id);
                          setStep("lens");
                        }}
                      >
                        <AudienceAvatar id={reviewer.id} size="xl" />
                        <span className="reviewer-card-name">{reviewer.name}</span>
                        <span className="reviewer-card-role">{reviewer.role}</span>
                      </motion.button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {/* biome-ignore lint/a11y/useSemanticElements: las opciones se agrupan como botones de selección. */}
                  <div className="reviewer-lens-grid" role="group" aria-label="Lentes de revisión">
                    {REVIEW_LENSES.map((lens, i) => (
                      <button
                        key={lens.id}
                        ref={(node) => {
                          if (i !== 0) return;
                          firstLensRef.current = node;
                          if (node && open) focusStepTarget("lens");
                        }}
                        type="button"
                        className="reviewer-lens-card"
                        data-lens={lens.id}
                        onClick={() => {
                          if (selectedReviewer)
                            void useAgentStore
                              .getState()
                              .reviewWithAudience(selectedReviewer, lens.id);
                        }}
                      >
                        <img
                          className="reviewer-lens-icon"
                          src={lens.icon}
                          alt=""
                          width={44}
                          height={44}
                          data-testid={`lens-icon-${lens.id}`}
                        />
                        <strong>{lens.label}</strong>
                        <span>{lens.description}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
