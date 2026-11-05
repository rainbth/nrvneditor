import { type Block, blocksForLineRange } from "./blocks";

export interface BlockIndexRange {
  start: number;
  end: number;
}

export function indexRangeForKeys(
  blocks: Block[],
  startKey: string,
  endKey: string,
): BlockIndexRange | null {
  const start = blocks.findIndex((block) => block.key === startKey);
  const end = blocks.findIndex((block) => block.key === endKey);
  return start < 0 || end < 0 ? null : { start: Math.min(start, end), end: Math.max(start, end) };
}

/**
 * Índices contiguos ordenados entre ancla y foco (inclusivo en ambos extremos).
 * Acepta ancla > foco y recorta al rango de bloques disponible.
 */
export function rangeBetween(blocks: Block[], anchorIndex: number, focusIndex: number): number[] {
  if (blocks.length === 0) return [];
  const start = Math.max(0, Math.min(anchorIndex, focusIndex));
  const end = Math.min(blocks.length - 1, Math.max(anchorIndex, focusIndex));
  const result: number[] = [];
  for (let index = start; index <= end; index += 1) result.push(index);
  return result;
}

/** `true` si los índices son contiguos (sin huecos) una vez ordenados. */
export function isContiguous(indexes: number[]): boolean {
  if (indexes.length <= 1) return true;
  const sorted = [...indexes].sort((a, b) => a - b);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] !== sorted[index - 1] + 1) return false;
  }
  return true;
}

export function selectionKey(keys: string[]): string {
  return keys.join("\u001f");
}

/**
 * Primer y último índice de los bloques que intersectan `[fromLine, toLine]`
 * (líneas 0-based, inclusivas), expandidos a bloques completos. Acepta
 * `fromLine > toLine`. Devuelve `null` si no hay intersección o no hay bloques.
 */
export function blockRangeForLines(
  blocks: Block[],
  fromLine: number,
  toLine: number,
): BlockIndexRange | null {
  const intersecting = blocksForLineRange(blocks, fromLine, toLine);
  if (intersecting.length === 0) return null;
  const start = blocks.indexOf(intersecting[0]);
  const end = blocks.indexOf(intersecting[intersecting.length - 1]);
  if (start < 0 || end < 0) return null;
  return { start, end };
}
