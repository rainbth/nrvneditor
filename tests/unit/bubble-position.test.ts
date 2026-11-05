import { describe, expect, it } from "vitest";
import { computeBubbleReservation, computeSideBubblePosition } from "../../src/lib/bubble-position";

const size = { width: 100, height: 30 },
  viewport = { width: 300, height: 200 };
describe("computeBubbleReservation", () => {
  const bubbleSize = { width: 100, height: 67 };
  const reservationViewport = { width: 300, height: 1000 };
  const block = { top: 400, bottom: 420, left: 50, width: 200 };
  const calculate = (overrides: Partial<Parameters<typeof computeBubbleReservation>[0]> = {}) =>
    computeBubbleReservation({
      prevBottom: 400,
      block,
      size: bubbleSize,
      viewport: reservationViewport,
      reserve: 48,
      ...overrides,
    });

  it("reserva arriba según el borde del bloque previo", () => {
    expect(calculate()).toEqual({ placement: "above", amount: 99, top: 416 });
  });

  it("mantiene strip en la API por compatibilidad", () => {
    expect(calculate({ prevBottom: -40, strip: 22, block: { ...block, bottom: 60 } })).toEqual({
      placement: "below",
      amount: 121,
      top: 98,
    });
  });

  it("usa block.top cuando no hay bloque previo", () => {
    expect(calculate({ prevBottom: null, block: { ...block, top: 68 } })).toEqual({
      placement: "above",
      amount: 99,
      top: 84,
    });
  });

  it("usa strip cero por defecto en below", () => {
    expect(calculate({ prevBottom: -40 })).toEqual({
      placement: "below",
      amount: 99,
      top: 436,
    });
  });

  it("clampa el top de above al borde inferior del viewport", () => {
    const result = calculate({
      prevBottom: 190,
      block: { top: 180, bottom: 200, left: 50, width: 200 },
      viewport: { width: 300, height: 200 },
    });
    expect(result.placement).toBe("above");
    expect(result.top).toBe(125);
  });

  it("degrada below a above si el clamp inferior cubriría el bloque", () => {
    const result = calculate({
      prevBottom: -40,
      block: { top: 0, bottom: 1000, left: 50, width: 200 },
      viewport: { width: 300, height: 900 },
    });
    expect(result.placement).toBe("above");
    expect(result.top).toBeLessThanOrEqual(1000);
  });

  it("aplica histéresis de 24px entre placements", () => {
    const input = {
      prevBottom: 0,
      block,
      size: bubbleSize,
      viewport: reservationViewport,
      reserve: 48,
    };
    // needed-height-16 = 16, por encima del umbral de 8 y por debajo del de 32.
    expect(computeBubbleReservation({ ...input, current: "below" }).placement).toBe("below");
    expect(computeBubbleReservation({ ...input, current: "above" }).placement).toBe("above");
  });

  it("usa la reserva fallback cuando reserve es NaN", () => {
    expect(calculate({ reserve: Number.NaN }).amount).toBe(99);
  });

  it("mantiene above al recalcular cerca de la posición previa", () => {
    expect(calculate({ prevBottom: 400, current: "above" }).placement).toBe("above");
  });

  it("cambia de above a below al acercarse al borde superior", () => {
    expect(calculate({ prevBottom: -20, current: "above" }).placement).toBe("below");
  });

  it("cambia de below a above al alejarse del borde superior", () => {
    expect(calculate({ prevBottom: 400, current: "below" }).placement).toBe("above");
  });

  it("sanea valores no finitos y aplica los fallbacks", () => {
    const result = computeBubbleReservation({
      prevBottom: null,
      block: { top: Number.NaN, bottom: Number.NaN, left: 50, width: 200 },
      size: { width: 100, height: Number.NaN },
      viewport: { width: 300, height: Number.NaN },
      reserve: Number.NaN,
      strip: Number.NaN,
    });
    expect(result).toEqual({ placement: "above", amount: 48, top: 8 });
    expect(Number.isFinite(result.amount)).toBe(true);
    expect(Number.isFinite(result.top)).toBe(true);
  });
});

describe("computeSideBubblePosition", () => {
  it("coloca a la derecha con separación", () => {
    expect(
      computeSideBubblePosition(
        { top: 50, bottom: 60, left: 100, right: 120, width: 20 },
        size,
        viewport,
      ),
    ).toEqual({ top: 50, left: 132, placement: "right" });
  });

  it("coloca a la izquierda si no cabe a la derecha", () => {
    expect(
      computeSideBubblePosition(
        { top: 50, bottom: 60, left: 200, right: 220, width: 20 },
        size,
        viewport,
      ),
    ).toEqual({ top: 50, left: 88, placement: "left" });
  });

  it("elige el lado con más espacio si ambos caben", () => {
    expect(
      computeSideBubblePosition({ top: 50, bottom: 60, left: 100, right: 120, width: 20 }, size, {
        width: 400,
        height: 200,
      }).placement,
    ).toBe("right");
    expect(
      computeSideBubblePosition({ top: 50, bottom: 60, left: 250, right: 270, width: 20 }, size, {
        width: 400,
        height: 200,
      }).placement,
    ).toBe("left");
  });

  it("protege el clamp vertical de valores negativos y NaN", () => {
    expect(
      computeSideBubblePosition(
        { top: -10, bottom: 0, left: 100, right: 120, width: 20 },
        size,
        viewport,
      ).top,
    ).toBe(8);
    expect(
      computeSideBubblePosition({ top: 50, bottom: 60, left: 100, right: 120, width: 20 }, size, {
        width: 300,
        height: 20,
      }).top,
    ).toBe(8);
    expect(
      computeSideBubblePosition(
        { top: Number.NaN, bottom: 60, left: 100, right: 120, width: 20 },
        size,
        viewport,
      ).top,
    ).toBe(8);
  });

  it("elige abajo cuando hay espacio suficiente sin caber lateralmente", () => {
    expect(
      computeSideBubblePosition({ top: 50, bottom: 60, left: 100, right: 120, width: 20 }, size, {
        width: 200,
        height: 200,
      }).placement,
    ).toBe("below");
  });

  it("respeta bounds estrechos y clampa horizontalmente al caer arriba/abajo", () => {
    const positioned = computeSideBubblePosition(
      { top: 50, bottom: 60, left: 170, right: 190, width: 20 },
      size,
      viewport,
      { left: 100, right: 250 },
    );
    expect(positioned.placement).toBe("below");
    expect(positioned.left).toBeGreaterThanOrEqual(108);
    expect(positioned.left + size.width).toBeLessThanOrEqual(242);
  });

  it("mantiene separación del ancla arriba/abajo y coloca abajo si el ancla está fuera arriba", () => {
    const aboveAnchor = { top: 60, bottom: 70, left: 100, right: 120, width: 20 };
    const above = computeSideBubblePosition(aboveAnchor, size, { width: 200, height: 100 });
    expect(above.placement).toBe("above");
    expect(above.top + size.height).toBeLessThanOrEqual(aboveAnchor.top);

    const belowAnchor = { ...aboveAnchor, top: -20, bottom: -10 };
    const below = computeSideBubblePosition(belowAnchor, size, { width: 200, height: 200 });
    expect(below.placement).toBe("below");
    expect(below.top).toBeGreaterThanOrEqual(belowAnchor.bottom);
  });
});
