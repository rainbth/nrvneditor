// biome-ignore-all lint/suspicious/noArrayIndexKey: el brief requiere claves compuestas con índice.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { audienceName, primaryReviewBlockKey, type ReviewResult } from "../../lib/audiences";
import { springSoft } from "../../lib/motion";
import { type ReviewLens, reviewLensLabel } from "../../lib/review-lens";
import { useAgentStore } from "../../store/agent";
import { useDocumentStore } from "../../store/document";
import { AudienceAvatar } from "./AudienceAvatar";

export const MAX_REVIEW_POINTS = 4;
function noReviewMaterial(review: ReviewResult | null): boolean {
  return (
    review !== null &&
    review.works.length === 0 &&
    review.problems.length === 0 &&
    review.suggestions.length === 0 &&
    review.fitting === null
  );
}
function moreNote(kind: "works" | "problems" | "suggestions", total: number) {
  const remaining = total - MAX_REVIEW_POINTS;
  return remaining > 0 ? (
    <p className="agent-review-more" data-testid={`review-more-${kind}`}>
      +{remaining} {remaining === 1 ? "punto" : "puntos"} más
    </p>
  ) : null;
}

function useFittingTargetApplicable(review: ReviewResult | null): boolean {
  const blocks = useDocumentStore((state) => state.blocks);
  if (review === null || review.blocks.length !== 1) return false;
  const key = primaryReviewBlockKey(review);
  const block = blocks.find((item) => item.key === key);
  return block?.type === "paragraph" || block?.type === "quote";
}

export function ReviewBody({
  review,
  lens = "complete",
}: {
  review: ReviewResult;
  lens?: ReviewLens;
}) {
  const hasFindings =
    lens === "complete"
      ? review.works.length > 0 || review.problems.length > 0 || review.suggestions.length > 0
      : lens === "works"
        ? review.works.length > 0
        : lens === "problems"
          ? review.problems.length > 0
          : review.suggestions.length > 0;
  if (
    review.works.length === 0 &&
    review.problems.length === 0 &&
    review.suggestions.length === 0 &&
    review.fitting === null
  ) {
    return (
      <>
        <p className="agent-review-empty" data-testid="review-no-material">
          No hay material suficiente para evaluarlo.
        </p>
        <p className="agent-review-hint">
          El bloque es demasiado breve o simple; selecciona un párrafo más desarrollado y repite la
          revisión.
        </p>
      </>
    );
  }
  return (
    <>
      {lens !== "complete" && !hasFindings ? (
        <p className="agent-review-empty">Sin hallazgos en esta lente.</p>
      ) : null}
      {review.works.length > 0 ? (
        <section className="agent-review-section">
          <h3>{lens === "complete" ? "Lo que funciona" : "Qué ve bien"}</h3>
          <ul>
            {review.works.slice(0, MAX_REVIEW_POINTS).map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
          {moreNote("works", review.works.length)}
        </section>
      ) : null}
      {review.problems.length > 0 ? (
        <section className="agent-review-section">
          <h3>{lens === "complete" ? "Lo que no funciona" : "Qué ve mal"}</h3>
          {review.problems.slice(0, MAX_REVIEW_POINTS).map((item, index) => (
            <article key={`${item.issue}-${item.evidence}-${index}`} data-severity={item.severity}>
              <strong>
                {item.severity}: {item.issue}
              </strong>
              <p>{item.evidence}</p>
            </article>
          ))}
          {moreNote("problems", review.problems.length)}
        </section>
      ) : null}
      {review.suggestions.length > 0 ? (
        <section className="agent-review-section">
          <h3>
            {lens === "questions"
              ? "Preguntas al autor"
              : lens === "missing"
                ? "Carencias detectadas"
                : "Sugerencias"}
          </h3>
          <ul>
            {review.suggestions.slice(0, MAX_REVIEW_POINTS).map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
          {moreNote("suggestions", review.suggestions.length)}
        </section>
      ) : null}
    </>
  );
}

export function ReviewActions() {
  const lens = useAgentStore((state) => state.reviewLensUsed ?? "complete");
  const review = useAgentStore((state) => state.review);
  const createVariantFromReview = useAgentStore((state) => state.createVariantFromReview);
  const previewFitting = useAgentStore((state) => state.previewFitting);
  const requestFitting = useAgentStore((state) => state.requestFitting);
  const fittingBusy = useAgentStore((state) => state.fittingBusy);
  const busy = useAgentStore((state) => state.busy);
  const fittingError = useAgentStore((state) => state.fittingError);
  const clearReview = useAgentStore((state) => state.clearReview);
  const fittingApplicable = useFittingTargetApplicable(review);
  const noMaterial = noReviewMaterial(review);
  const hasFitting = review?.fitting !== null && review?.fitting !== undefined;
  const showVariant =
    !noMaterial &&
    (lens === "complete" || (lens === "problems" && (review?.problems.length ?? 0) > 0));
  return (
    <div className="agent-proposal-actions">
      {!noMaterial && fittingApplicable && hasFitting ? (
        <button
          type="button"
          className="button button-primary"
          data-testid="review-preview-fitting"
          onClick={previewFitting}
          title="Abre la vista previa de la sugerencia; podrás aceptarla o descartarla."
        >
          Ver recomendación
        </button>
      ) : !noMaterial && fittingApplicable ? (
        <button
          type="button"
          className="button button-primary"
          data-testid="review-request-fitting"
          onClick={() => void requestFitting()}
          disabled={fittingBusy || busy}
          aria-busy={fittingBusy ? "true" : undefined}
          title="Pide al revisor un único párrafo de mejora para este bloque."
        >
          {fittingBusy ? "Escribiendo…" : "Obtener sugerencia"}
        </button>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {fittingBusy ? "Generando sugerencia…" : ""}
      </span>
      {showVariant ? (
        <button
          type="button"
          className={hasFitting ? "button" : "button button-primary"}
          data-testid="review-variant"
          onClick={() => void createVariantFromReview()}
          disabled={fittingBusy || busy}
          title="Reescribe el párrafo aplicando todos los puntos de la revisión."
        >
          Crear variante que arregle estos puntos
        </button>
      ) : null}
      {!noMaterial && !fittingApplicable && !hasFitting && review !== null ? (
        <p className="agent-review-empty">
          {review.blocks.length > 1
            ? "La sugerencia está disponible para un solo párrafo. Selecciona uno y repite la revisión."
            : "La sugerencia está disponible para párrafos y citas."}
        </p>
      ) : null}
      <button type="button" className="button" data-testid="review-discard" onClick={clearReview}>
        Descartar
      </button>
      {fittingError !== null ? (
        <p className="agent-proposal-error" role="alert">
          {fittingError}
        </p>
      ) : null}
    </div>
  );
}

export function ReviewCard() {
  const reduceMotion = useReducedMotion();
  const review = useAgentStore((state) => state.review);
  const pendingReview = useAgentStore((state) => state.pendingReview);
  const busy = useAgentStore((state) => state.busy);
  const lens = useAgentStore((state) => state.reviewLensUsed ?? "complete");
  if (busy && pendingReview) return <p aria-live="polite">Revisando…</p>;
  return (
    <AnimatePresence initial={false}>
      {review === null ? null : (
        <motion.section
          key="review-card"
          initial={{ opacity: 0, y: 6, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4 }}
          transition={reduceMotion ? { duration: 0 } : springSoft}
          className="agent-review-card"
          data-testid="review-card"
          aria-label="Revisión del texto"
        >
          <header className="agent-proposal-header">
            <span className="agent-proposal-title">
              <AudienceAvatar id={review.audience ?? ""} size="sm" /> Revisión ·{" "}
              {audienceName(review.audience)}
              <span data-testid="review-lens-label" className="review-lens-label">
                {reviewLensLabel(lens)}
              </span>
            </span>
          </header>
          <ReviewBody review={review} lens={lens} />
          <ReviewActions />
        </motion.section>
      )}
    </AnimatePresence>
  );
}
