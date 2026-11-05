import type { Block } from "./blocks";
import { isFrontmatterBlock } from "./blocks";

export interface FindOptions {
  caseSensitive?: boolean;
  useRegex?: boolean;
}
export interface TextMatch {
  index: number;
  length: number;
  blockIndex: number;
}
export function findTextMatches(
  blocks: Block[],
  query: string,
  options: FindOptions = {},
): TextMatch[] {
  if (!query) return [];
  const source = options.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let regex: RegExp;
  try {
    regex = new RegExp(source, options.caseSensitive ? "g" : "gi");
  } catch {
    return [];
  }
  const matches: TextMatch[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.type === "code" || isFrontmatterBlock(block.raw)) return;
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    match = regex.exec(block.raw);
    while (match) {
      matches.push({ index: block.startOffset + match.index, length: match[0].length, blockIndex });
      if (!match[0].length) regex.lastIndex++;
      match = regex.exec(block.raw);
    }
  });
  return matches;
}
export function replaceTextMatches(
  content: string,
  blocks: Block[],
  query: string,
  replacement: string,
  options: FindOptions = {},
): { content: string; count: number; selection: { start: number; end: number } | null } {
  const matches = findTextMatches(blocks, query, options);
  let result = content;
  for (const match of [...matches].reverse())
    result = result.slice(0, match.index) + replacement + result.slice(match.index + match.length);
  const first = matches[0];
  return {
    content: result,
    count: matches.length,
    selection: first ? { start: first.index, end: first.index + replacement.length } : null,
  };
}
