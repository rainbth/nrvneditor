import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { docKeyForDocument } from "../../lib/agent-session";
import { isCommentStale } from "../../lib/annotations";
import { computeSideBubblePosition } from "../../lib/bubble-position";
import { hashBlock } from "../../lib/hash";
import { springSoft } from "../../lib/motion";
import { useAnnotationsStore } from "../../store/annotations";
import { useDocumentStore } from "../../store/document";

export function BlockCommentThread() {
  const reduceMotion = useReducedMotion();
  const composer = useAnnotationsStore((state) => state.composer);
  const comments = useAnnotationsStore((state) => state.comments);
  const closeComposer = useAnnotationsStore((state) => state.closeComposer);
  const commentDraft = useAnnotationsStore((state) => state.commentDraft);
  const setCommentDraft = useAnnotationsStore((state) => state.setCommentDraft);
  const blocks = useDocumentStore((state) => state.blocks);
  const path = useDocumentStore((state) => state.path);
  const localId = useDocumentStore((state) => state.localId);
  const loadForDocument = useAnnotationsStore((state) => state.ensureDocument);
  const docKey = docKeyForDocument(path, localId);
  const anchor =
    typeof document !== "undefined" && composer
      ? (Array.from(document.querySelectorAll<HTMLElement>("[data-block-key]")).find(
          (el) => el.dataset.blockKey === composer.blockKey,
        ) ?? null)
      : null;
  const block = blocks.find((item) => item.key === composer?.blockKey);
  const threadComments = comments
    .filter(
      (comment) =>
        comment.blockKey === composer?.blockKey || comment.blockHash === composer?.blockHash,
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  const unresolved = threadComments.filter((comment) => !comment.resolved);
  const resolved = threadComments.filter((comment) => comment.resolved);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ReturnType<typeof computeSideBubblePosition>>({
    top: 0,
    left: 0,
    placement: "right",
  });
  const [measured, setMeasured] = useState(false);
  const close = useCallback(() => {
    closeComposer();
    if (composer)
      document
        .querySelector<HTMLElement>(
          `[data-block-key="${CSS.escape(composer.blockKey)}"] .block-comment-badge`,
        )
        ?.focus();
  }, [closeComposer, composer]);

  useEffect(() => {
    if (!composer || !anchor || !bubbleRef.current) return;
    setMeasured(false);
    const recalc = () => {
      const bubble = bubbleRef.current;
      if (!bubble) return;
      const bounds = anchor.closest<HTMLElement>(".center-column")?.getBoundingClientRect();
      setPosition(
        computeSideBubblePosition(
          anchor.getBoundingClientRect(),
          bubble.getBoundingClientRect(),
          { width: innerWidth, height: innerHeight },
          bounds ? { left: bounds.left, right: bounds.right } : undefined,
        ),
      );
      setMeasured(true);
    };
    recalc();
    const observer = new ResizeObserver(recalc);
    observer.observe(anchor);
    observer.observe(bubbleRef.current);
    addEventListener("scroll", recalc, { capture: true, passive: true });
    addEventListener("resize", recalc);
    return () => {
      observer.disconnect();
      removeEventListener("scroll", recalc, true);
      removeEventListener("resize", recalc);
    };
  }, [composer, anchor]);

  useEffect(() => {
    if (composer && !anchor) close();
  }, [composer, anchor, close]);
  useEffect(() => {
    if (composer && measured) textareaRef.current?.focus();
  }, [composer, measured]);
  useEffect(() => {
    if (!composer) return;
    if (useAnnotationsStore.getState().docKey !== docKey) void loadForDocument(docKey);
  }, [composer, docKey, loadForDocument]);

  useEffect(() => {
    if (!composer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (bubbleRef.current?.contains(event.target)) return;
      if (
        event.target.closest(
          `[data-block-key="${CSS.escape(composer.blockKey)}"], [data-selection-retain], [data-overlay]`,
        )
      )
        return;
      close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [composer, close]);
  if (typeof document === "undefined") return null;

  const save = () => {
    const text = textareaRef.current?.value ?? useAnnotationsStore.getState().commentDraft;
    if (!text.trim()) return;
    useAnnotationsStore.getState().addComment(text, docKey);
  };
  return createPortal(
    <AnimatePresence>
      {composer && anchor && block ? (
        <motion.div
          key="comment-thread"
          ref={bubbleRef}
          className="comment-thread"
          data-overlay
          data-selection-retain={composer && anchor && block ? true : undefined}
          role="dialog"
          aria-label="Comentarios del bloque"
          data-testid="comment-thread"
          data-placement={position.placement}
          style={{ ...position, pointerEvents: measured ? undefined : "none" }}
          initial={{ opacity: 0, y: 4, scale: 0.985 }}
          animate={measured ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 4, scale: 0.985 }}
          exit={{ opacity: 0, y: 4, scale: 0.985 }}
          transition={reduceMotion ? { duration: 0 } : springSoft}
        >
          <header className="comment-thread-header">
            <strong>Comentarios del bloque</strong>
            <span>{unresolved.length}</span>
            <button type="button" aria-label="Cerrar hilo" onClick={close}>
              <X size={16} />
            </button>
          </header>
          <div className="comment-thread-list">
            {unresolved.map((comment) => (
              <article className="comment-thread-item" key={comment.id}>
                <p>{comment.body}</p>
                {isCommentStale(comment, hashBlock(block.raw)) && <small>Bloque editado</small>}
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      useAnnotationsStore.getState().setCommentResolved(comment.id, true)
                    }
                  >
                    Resolver
                  </button>
                  <button
                    type="button"
                    onClick={() => useAnnotationsStore.getState().removeComment(comment.id)}
                  >
                    Borrar
                  </button>
                </div>
              </article>
            ))}
            {resolved.length > 0 && (
              <details>
                <summary>Resueltos ({resolved.length})</summary>
                {resolved.map((comment) => (
                  <article className="comment-thread-item" key={comment.id}>
                    <p>{comment.body}</p>
                    {isCommentStale(comment, hashBlock(block.raw)) && <small>Bloque editado</small>}
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          useAnnotationsStore.getState().setCommentResolved(comment.id, false)
                        }
                      >
                        Reabrir
                      </button>
                      <button
                        type="button"
                        onClick={() => useAnnotationsStore.getState().removeComment(comment.id)}
                      >
                        Borrar
                      </button>
                    </div>
                  </article>
                ))}
              </details>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <textarea
              ref={textareaRef}
              aria-label="Comentario"
              placeholder="Escribe un comentario…"
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  save();
                }
              }}
            />
            <button type="submit" disabled={!commentDraft.trim()}>
              Comentar
            </button>
          </form>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
