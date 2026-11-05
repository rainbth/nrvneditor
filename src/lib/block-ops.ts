import type { Block } from "./blocks";
import { isFrontmatterBlock, splitBlocks } from "./blocks";

export type BlockOpReason = "empty" | "bounds" | "pending" | "protected";
export interface BlockOpSuccess {
  ok: true;
  content: string;
  selection: { start: number; end: number } | null;
  indexMap: number[];
}
export type BlockOpResult = BlockOpSuccess | { ok: false; reason: BlockOpReason };

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);
function selected(content: string, map: number[], from: number, to: number): BlockOpSuccess {
  const next = splitBlocks(content);
  const first = next[map[from]];
  const last = next[map[to]];
  return {
    ok: true,
    content,
    selection: first && last ? { start: first.startOffset, end: last.endOffset } : null,
    indexMap: map,
  };
}
function validate(blocks: Block[], start: number, end: number): BlockOpReason | null {
  if (!blocks.length) return "empty";
  if (
    start < 0 ||
    end >= blocks.length ||
    start > end ||
    !Number.isInteger(start) ||
    !Number.isInteger(end)
  )
    return "bounds";
  if (blocks.slice(start, end + 1).some((b) => b.pending)) return "pending";
  if (blocks.slice(start, end + 1).some((b) => isFrontmatterBlock(b.raw))) return "protected";
  return null;
}
export function moveBlockUp(content: string, blocks: Block[], index: number): BlockOpResult {
  return moveBlockRange(content, blocks, index, index, "up");
}
export function moveBlockDown(content: string, blocks: Block[], index: number): BlockOpResult {
  return moveBlockRange(content, blocks, index, index, "down");
}
/** Reorders blocks while rotating original gaps to preserve each boundary. */
export function moveBlockRange(
  content: string,
  blocks: Block[],
  start: number,
  end: number,
  direction: "up" | "down",
): BlockOpResult {
  const error = validate(blocks, start, end);
  if (error) return { ok: false, reason: error };
  const neighbor = direction === "up" ? start - 1 : end + 1;
  if (neighbor < 0 || neighbor >= blocks.length) return { ok: false, reason: "bounds" };
  if (blocks[neighbor].pending) return { ok: false, reason: "pending" };
  if (isFrontmatterBlock(blocks[neighbor].raw)) return { ok: false, reason: "protected" };
  const lo = direction === "up" ? start - 1 : start,
    hi = direction === "up" ? end : end + 1;
  const order =
    direction === "up"
      ? [...Array.from({ length: end - start + 1 }, (_, i) => start + i), start - 1]
      : [end + 1, ...Array.from({ length: end - start + 1 }, (_, i) => start + i)];
  const gap = (i: number) => content.slice(blocks[i].endOffset, blocks[i + 1].startOffset);
  const raws = order.map((i) => blocks[i].raw);
  const gaps =
    direction === "up"
      ? [...Array.from({ length: end - start }, (_, i) => gap(start + i)), gap(start - 1)]
      : [gap(end), ...Array.from({ length: end - start }, (_, i) => gap(start + i))];
  let region = raws[0];
  for (let i = 1; i < raws.length; i++) region += gaps[i - 1] + raws[i];
  const nextContent =
    content.slice(0, blocks[lo].startOffset) + region + content.slice(blocks[hi].endOffset);
  const map = identity(blocks.length);
  if (direction === "up") {
    map[start - 1] = end;
    for (let i = start; i <= end; i++) map[i] = i - 1;
  } else {
    map[end + 1] = start;
    for (let i = start; i <= end; i++) map[i] = i + 1;
  }
  return selected(nextContent, map, start, end);
}
/**
 * Duplicates a range using one uniform separator; if parsing merges blocks,
 * retries with a double line break.
 */
export function duplicateBlock(
  content: string,
  blocks: Block[],
  start: number,
  end = start,
): BlockOpResult {
  const error = validate(blocks, start, end);
  if (error) return { ok: false, reason: error };
  const offset = blocks[end].endOffset;
  const raws = blocks.slice(start, end + 1).map((b) => b.raw);
  const gapAfter = content.slice(offset, blocks[end + 1]?.startOffset ?? content.length);
  const gapBefore =
    end > 0 ? content.slice(blocks[end - 1].endOffset, blocks[end].startOffset) : "";
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const sep =
    gapAfter.includes(eol + eol) || gapBefore.includes(eol + eol)
      ? eol + eol
      : gapAfter || gapBefore || eol + eol;
  let result = content.slice(0, offset) + sep + raws.join(sep) + content.slice(offset);
  let parsed = splitBlocks(result);
  if (parsed.length !== blocks.length + raws.length) {
    const fallback = eol + eol;
    result = content.slice(0, offset) + fallback + raws.join(fallback) + content.slice(offset);
    parsed = splitBlocks(result);
  }
  // If even the fallback merges blocks, parsed indices cannot identify the copies.
  const parsedAsExpected = parsed.length === blocks.length + raws.length;
  const first = parsedAsExpected ? parsed[end + 1] : undefined;
  const last = parsedAsExpected ? parsed[end + raws.length] : undefined;
  return {
    ok: true,
    content: result,
    selection: first && last ? { start: first.startOffset, end: last.endOffset } : null,
    indexMap: identity(blocks.length).map((i) => (i <= end ? i : i + raws.length)),
  };
}
export function deleteBlock(
  content: string,
  blocks: Block[],
  start: number,
  end = start,
): BlockOpResult {
  const error = validate(blocks, start, end);
  if (error) return { ok: false, reason: error };
  const from =
      end + 1 < blocks.length
        ? blocks[start].startOffset
        : start > 0
          ? blocks[start - 1].endOffset
          : 0,
    to = end + 1 < blocks.length ? blocks[end + 1].startOffset : content.length;
  const result = content.slice(0, from) + content.slice(to);
  const count = end - start + 1,
    map = identity(blocks.length).map((i) => (i < start ? i : i <= end ? -1 : i - count));
  const parsed = splitBlocks(result),
    target = parsed[Math.min(start, parsed.length - 1)];
  return {
    ok: true,
    content: result,
    selection: target ? { start: target.startOffset, end: target.endOffset } : null,
    indexMap: map,
  };
}
