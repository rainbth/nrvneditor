import type { Block } from "./blocks";
import { normalizeHeadingText } from "./markdown";

/**
 * Rango de una sección: desde el heading hasta el bloque anterior al siguiente
 * heading de nivel ≤ al suyo (inclusive). Si el índice no es heading, devuelve
 * solo ese bloque.
 */
export function sectionRange(
  blocks: Block[],
  headingIndex: number,
): { start: number; end: number } {
  if (headingIndex < 0 || headingIndex >= blocks.length) {
    return { start: -1, end: -1 };
  }
  const heading = blocks[headingIndex];
  if (heading.type !== "heading") {
    return { start: headingIndex, end: headingIndex };
  }
  const level = heading.level ?? 1;
  let end = blocks.length - 1;
  for (let index = headingIndex + 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type === "heading" && (block.level ?? 1) <= level) {
      end = index - 1;
      break;
    }
  }
  return { start: headingIndex, end };
}

/** Bloques que componen la sección de un heading. */
export function sectionBlocks(blocks: Block[], headingIndex: number): Block[] {
  const { start, end } = sectionRange(blocks, headingIndex);
  if (start === -1) return [];
  return blocks.slice(start, end + 1);
}

/** Ruta de headings aplicable al bloque dado. */
export function headingTrail(blocks: Block[], index: number): string[] {
  if (index < 0 || index >= blocks.length) return [];
  return [...blocks[index].headingPath];
}

/**
 * Ruta de headings de una selección de bloques. Se deriva del **primer** bloque
 * (orden de documento): si es un heading, su propio texto se añade al final;
 * si no, se usa su `headingPath`. Así la sección de un H1 no hereda la ruta
 * del último bloque seleccionado (BRD §8.3).
 */
export function headingTrailForSelection(blocks: Block[], indexes: number[]): string[] {
  const first = indexes.find((index) => index >= 0 && index < blocks.length);
  if (first === undefined) return [];
  const block = blocks[first];
  const trail = [...block.headingPath];
  if (block.type === "heading") {
    const firstLine = block.raw.split("\n")[0] ?? "";
    const text = normalizeHeadingText(firstLine);
    if (text.length > 0) trail.push(text);
  }
  return trail;
}
