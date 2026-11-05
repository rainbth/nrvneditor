/**
 * Cálculo puro de las marcas del gutter de Render.
 *
 * `computeGutterMarks` recibe los bloques con su línea de inicio (1-based) y
 * el número de líneas que ocupan, junto con las posiciones y alturas reales
 * medidas en el DOM. Devuelve el número absoluto en la línea de inicio de cada
 * bloque y un tick para cada línea interna, repartido proporcionalmente por la
 * altura medida del bloque.
 */

export interface GutterBlock {
  /** Línea inicial del bloque, 1-based. */
  startLine: number;
  /** Líneas que ocupa el bloque (siempre >= 1). */
  lineCount: number;
}

export type GutterMark = {
  /** Número de línea absoluto, 1-based. */
  line: number;
  /** Offset vertical en px respecto al contenedor del canvas. */
  top: number;
  /** `false` para el número del inicio de bloque; `true` para un tick interno. */
  tick: boolean;
};

export function computeGutterMarks(
  blocks: GutterBlock[],
  tops: number[],
  heights: number[],
): GutterMark[] {
  const marks: GutterMark[] = [];
  blocks.forEach((block, index) => {
    const top = tops[index] ?? 0;
    const height = heights[index] ?? 0;
    const lineCount = Math.max(1, Math.floor(block.lineCount));
    if (!Number.isFinite(top)) return;

    marks.push({ line: block.startLine, top, tick: false });
    for (let offset = 1; offset < lineCount; offset += 1) {
      marks.push({
        line: block.startLine + offset,
        top: top + (height * offset) / lineCount,
        tick: true,
      });
    }
  });
  return marks;
}
