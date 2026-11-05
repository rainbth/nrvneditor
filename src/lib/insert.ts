import type { Block } from "./blocks";

export function replaceBlockRaw(content: string, block: Block, nextRaw: string): string {
  return content.slice(0, block.startOffset) + nextRaw + content.slice(block.endOffset);
}
export function insertRawsAfter(
  content: string,
  blocks: Block[],
  anchorIndex: number | null,
  raws: string[],
): { content: string; startIndex: number } {
  if (raws.length === 0) return { content, startIndex: anchorIndex === null ? 0 : anchorIndex + 1 };
  const index = anchorIndex === null ? 0 : anchorIndex + 1;
  const offset =
    anchorIndex === null
      ? (blocks[0]?.startOffset ?? 0)
      : (blocks[anchorIndex]?.endOffset ?? content.length);
  const inserted = raws.join("\n\n");
  const prefix = content.slice(0, offset),
    suffix = content.slice(offset);
  return {
    content:
      prefix +
      (prefix && !prefix.endsWith("\n\n") ? "\n\n" : "") +
      inserted +
      (suffix && !suffix.startsWith("\n\n") ? "\n\n" : "") +
      suffix,
    startIndex: index,
  };
}
export function splitBlockRaw(raw: string, offset: number): { left: string; right: string } {
  const at = Math.max(0, Math.min(raw.length, offset));
  return { left: raw.slice(0, at), right: raw.slice(at) };
}
export function joinBlockRaws(previous: Block, currentText: string): string {
  return previous.type === "heading"
    ? `${previous.raw.trimEnd()} ${currentText.trim()}`
    : `${previous.raw.trimEnd()}\n${currentText.trim()}`;
}
export function removeBlockRange(content: string, fromBlock: Block, toBlock: Block): string {
  return (
    content.slice(0, Math.min(fromBlock.startOffset, toBlock.startOffset)) +
    content.slice(Math.max(fromBlock.endOffset, toBlock.endOffset))
  );
}
