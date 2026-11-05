import { useEffect, useRef, useState } from "react";
import type { Block } from "../../lib/blocks";
import { computeGutterMarks, type GutterBlock, type GutterMark } from "../../lib/line-gutter";
import { useDocumentStore } from "../../store/document";
import { useUiStore } from "../../store/ui";

export function gutterLayoutSignature(
  blocks: readonly Block[],
  canvasWidth: number,
  canvasHeight: number,
  scrollHeight: number,
  pageZoom: number,
): string {
  let numberingHash = 0;
  for (const block of blocks) {
    numberingHash = (numberingHash * 31 + block.startLine * 131 + block.endLine) | 0;
  }
  return (
    `${canvasWidth}x${canvasHeight}:${scrollHeight}:${pageZoom}:${blocks.length}:` +
    `${blocks[0]?.key}:${blocks[blocks.length - 1]?.key}:${numberingHash}`
  );
}

/**
 * Gutter decorativo del modo Render: números de línea en el margen izquierdo,
 * fuera de la hoja. Mide las posiciones reales de los bloques respecto al
 * canvas para mantenerse alineado con el documento sin recalcular en cada
 * token (ResizeObserver + requestAnimationFrame).
 */
export function RenderGutter() {
  const gutterRef = useRef<HTMLDivElement>(null);
  const [marks, setMarks] = useState<GutterMark[]>([]);
  const lastSignature = useRef<string | null>(null);
  const lastMarks = useRef<GutterMark[]>([]);
  const blocks = useDocumentStore((state) => state.blocks);
  const lineNumbers = useUiStore((state) => state.lineNumbers);
  const pageZoom = useUiStore((state) => state.pageZoom);

  useEffect(() => {
    if (!lineNumbers) {
      lastSignature.current = null;
      lastMarks.current = [];
      setMarks([]);
      return;
    }
    if (blocks.length === 0) {
      setMarks([]);
      return;
    }

    const gutter = gutterRef.current;
    const canvas = gutter?.closest(".render-canvas");
    if (!gutter || !(canvas instanceof HTMLElement)) return;

    let frame = 0;
    const measure = () => {
      const canvasRect = canvas.getBoundingClientRect();
      const prose = canvas.querySelector<HTMLElement>(".prose");
      const signature = gutterLayoutSignature(
        blocks,
        canvasRect.width,
        canvasRect.height,
        prose?.scrollHeight ?? 0,
        pageZoom,
      );
      if (signature === lastSignature.current) return;
      lastSignature.current = signature;
      const nodes = canvas.querySelectorAll<HTMLElement>("[data-block-key]");
      const inputs: GutterBlock[] = [];
      const tops: number[] = [];
      const heights: number[] = [];

      for (const node of nodes) {
        const startLine = Number(node.dataset.startLine);
        const lineCount = Number(node.dataset.lineCount);
        if (!Number.isFinite(startLine) || !Number.isFinite(lineCount)) continue;
        const rect = node.getBoundingClientRect();
        inputs.push({ startLine, lineCount });
        tops.push(rect.top - canvasRect.top);
        heights.push(rect.height);
      }

      const nextMarks = computeGutterMarks(inputs, tops, heights);
      const same =
        nextMarks.length === lastMarks.current.length &&
        nextMarks.every((mark, index) => {
          const previous = lastMarks.current[index];
          return (
            previous !== undefined &&
            previous.top === mark.top &&
            previous.line === mark.line &&
            previous.tick === mark.tick
          );
        });
      if (!same) {
        lastMarks.current = nextMarks;
        setMarks(nextMarks);
      }
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();

    const observer = new ResizeObserver(schedule);
    const prose = canvas.querySelector(".prose");
    if (prose) observer.observe(prose);
    observer.observe(canvas);
    window.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [blocks, lineNumbers, pageZoom]);

  return (
    <div className="render-gutter" ref={gutterRef} data-testid="render-gutter" aria-hidden="true">
      {marks.map((mark) =>
        mark.tick ? (
          <span
            key={`tick-${mark.line}`}
            className="render-gutter-tick"
            style={{ top: `${mark.top}px` }}
          />
        ) : (
          <span
            key={`line-${mark.line}`}
            className="render-gutter-number"
            data-line={mark.line}
            style={{ top: `${mark.top}px` }}
          >
            {mark.line}
          </span>
        ),
      )}
    </div>
  );
}
