export interface BubbleReservationInput {
  /** Borde inferior del bloque previo en coordenadas de viewport; `null` si es el primero. */
  prevBottom: number | null;
  /** Rect del bloque activo ANTES de aplicar la reserva. */
  block: { top: number; bottom: number; left: number; width: number };
  size: { width: number; height: number };
  viewport: { width: number; height: number };
  reserve: number;
  /** Franja del insert flotante que la burbuja debe salvar en below. */
  strip?: number;
  current?: "above" | "below";
}

export interface BubbleReservation {
  placement: "above" | "below";
  /** Margen de reserva a aplicar (margin-top en above, margin-bottom en below). */
  amount: number;
  /** `top` de la burbuja. En below usa `block.bottom + 16 + strip`. */
  top: number;
}

/**
 * Computes the active block's bubble reservation. `prevBottom` is not altered by
 * the active block's reservation, so this calculation has no feedback loop.
 */
export function computeBubbleReservation(input: BubbleReservationInput): BubbleReservation {
  const { block, size, viewport } = input;
  const reserve = Number.isFinite(input.reserve) ? input.reserve : 48;
  const height = Number.isFinite(size.height) ? size.height : 0;
  const strip = Math.max(
    0,
    input.strip !== undefined && Number.isFinite(input.strip) ? input.strip : 0,
  );
  const blockTop = Number.isFinite(block.top) ? block.top : 0;
  const blockBottom = Number.isFinite(block.bottom) ? block.bottom : 0;
  const viewportHeight = Number.isFinite(viewport.height) ? viewport.height : 0;
  const needed = Math.max(reserve, height + 32);
  const prevBottom =
    input.prevBottom !== null && Number.isFinite(input.prevBottom) ? input.prevBottom : blockTop;
  const aboveTop = prevBottom + (needed - height - 16);
  let placement: "above" | "below" =
    input.current === "below"
      ? aboveTop >= 32
        ? "above"
        : "below"
      : input.current === "above"
        ? aboveTop < 8
          ? "below"
          : "above"
        : aboveTop >= 8
          ? "above"
          : "below";
  let rawTop = placement === "above" ? aboveTop : blockBottom + 16 + strip;
  const maxTop = viewportHeight - height - 8;
  if (placement === "below" && rawTop > maxTop) {
    placement = "above";
    rawTop = aboveTop;
  }
  const amount = placement === "above" ? needed : needed + strip;
  const top = Math.max(8, Math.min(maxTop, rawTop));
  return { placement, amount, top };
}

export function computeSideBubblePosition(
  anchor: { top: number; bottom: number; left: number; right: number; width: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  bounds: { left: number; right: number } = { left: 0, right: viewport.width },
): { top: number; left: number; placement: "left" | "right" | "above" | "below" } {
  const rawTop = Math.max(8, Math.min(anchor.top, viewport.height - size.height - 8));
  const top = Number.isFinite(rawTop) ? rawTop : 8;
  const rightSpace = bounds.right - 8 - (anchor.right + 12);
  const leftSpace = anchor.left - 12 - (bounds.left + 8);
  const canLeft = leftSpace >= size.width;
  if (rightSpace >= size.width && (!canLeft || rightSpace >= leftSpace)) {
    return { top, left: anchor.right + 12, placement: "right" };
  }
  if (canLeft) {
    return { top, left: anchor.left - 12 - size.width, placement: "left" };
  }
  const canBelow = anchor.bottom + 8 + size.height <= viewport.height - 8;
  const canAbove = anchor.top >= size.height + 24;
  const placement = canBelow
    ? "below"
    : canAbove
      ? "above"
      : viewport.height - anchor.bottom >= anchor.top
        ? "below"
        : "above";
  const preferredTop = placement === "above" ? anchor.top - size.height - 8 : anchor.bottom + 8;
  const maxTop = viewport.height - size.height - 8;
  const fallbackTop = Number.isFinite(preferredTop)
    ? Math.max(8, Math.min(preferredTop, maxTop))
    : 8;
  const minLeft = bounds.left + 8;
  const maxLeft = bounds.right - size.width - 8;
  const rawLeft = anchor.left + anchor.width / 2 - size.width / 2;
  const left = Number.isFinite(rawLeft) ? Math.max(minLeft, Math.min(rawLeft, maxLeft)) : minLeft;
  return { top: fallbackTop, left, placement };
}
