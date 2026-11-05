import type { BlockType } from "./blocks";

export type BlockFormat =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet-list"
  | "numbered-list"
  | "quote"
  | "code-block"
  | "hr";
export type InlineFormat = "bold" | "italic" | "inline-code" | "link";
export interface InlineRange {
  start: number;
  end: number;
}
export type InlineScope = "selection" | "word" | "line" | "none";
export function resolveInlineTarget(
  raw: string,
  range: InlineRange,
): { target: InlineRange | null; scope: InlineScope } {
  const start = Math.max(0, Math.min(raw.length, range.start));
  const end = Math.max(start, Math.min(raw.length, range.end));
  if (start !== end) return { target: { start, end }, scope: "selection" };
  const lineStart = raw.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const newline = raw.indexOf("\n", start);
  const lineEnd = newline < 0 ? raw.length : newline;
  const line = raw.slice(lineStart, lineEnd);
  const prefix = /^(?: {0,3}(?:#{1,6}[ \t]+|(?:[-*+] |\d+[.)] |> ?)))/.exec(line)?.[0].length ?? 0;
  const contentEnd = line.replace(/[ \t]+$/, "").length;
  const contentStart = lineStart + prefix;
  const targetEnd = lineStart + contentEnd;
  if (raw.slice(contentStart, targetEnd).trim().length === 0)
    return { target: null, scope: "none" };
  // Carets at line edges or between words target the whole line; only a caret
  // strictly inside a word narrows inline formatting to that word.
  const word = /[\p{L}\p{N}\p{M}_]/u;
  if (
    start > contentStart &&
    start < targetEnd &&
    word.test(raw[start - 1]) &&
    word.test(raw[start])
  ) {
    let left = start;
    let right = start;
    while (left > contentStart && word.test(raw[left - 1])) left--;
    while (right < targetEnd && word.test(raw[right])) right++;
    return { target: { start: left, end: right }, scope: "word" };
  }
  return { target: { start: contentStart, end: targetEnd }, scope: "line" };
}

const PREFIX = /^ {0,3}(?:#{1,6}[ \t]+|(?:[-*+]|\d+[.)])[ \t]+|>[ \t]?)/;
export function applyBlockFormat(raw: string, format: BlockFormat): string {
  if (format === "hr") return "---";
  const lines = raw.split("\n").map((line) => line.replace(PREFIX, ""));
  if (format === "paragraph") return lines.join("\n");
  if (format === "code-block") return `\`\`\`\n${raw}\n\`\`\``;
  if (format === "h1" || format === "h2" || format === "h3") {
    const prefix = `${"#".repeat(Number(format[1]))} `;
    const index = lines.findIndex((line) => line.length > 0);
    if (index >= 0) lines[index] = prefix + lines[index];
    return lines.join("\n");
  }
  const marker = format === "bullet-list" ? "- " : format === "numbered-list" ? "1. " : "> ";
  return lines.map((line) => (line.length === 0 ? line : marker + line)).join("\n");
}

export function toggleInlineFormat(
  raw: string,
  range: InlineRange,
  format: InlineFormat,
  href?: string,
): { raw: string; selection: InlineRange } {
  const start = Math.max(0, Math.min(raw.length, range.start));
  const end = Math.max(start, Math.min(raw.length, range.end));
  if (format === "link") {
    if (start === end)
      return {
        raw: `${raw.slice(0, start)}[](${href ?? "https://"})${raw.slice(end)}`,
        selection: { start: start + 1, end: start + 1 },
      };

    const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g;
    for (const match of raw.matchAll(linkPattern)) {
      const linkStart = match.index;
      const linkEnd = linkStart + match[0].length;
      const textStart = linkStart + 1;
      const textEnd = textStart + match[1].length;
      const selectsText = start >= textStart && end <= textEnd;
      const selectsWholeLink = start === linkStart && end === linkEnd;
      if (!selectsText && !selectsWholeLink) continue;
      return {
        raw: raw.slice(0, linkStart) + match[1] + raw.slice(linkEnd),
        selection: selectsWholeLink
          ? { start: linkStart, end: linkStart + match[1].length }
          : { start: start - 1, end: end - 1 },
      };
    }

    return {
      raw:
        raw.slice(0, start) +
        "[" +
        raw.slice(start, end) +
        `](${href ?? "https://"})` +
        raw.slice(end),
      selection: { start: start + 1, end: end + 1 },
    };
  }

  const kind = format;
  const marker = kind === "bold" ? "**" : kind === "italic" ? "*" : "`";
  if (start === end)
    return {
      raw: raw.slice(0, start) + marker + marker + raw.slice(end),
      selection: { start: start + marker.length, end: start + marker.length },
    };

  const spans = findSpans(raw, kind);
  const exact = spans.find((span) => span.open === start && span.closeEnd === end);
  const span = exact ?? findEnclosingSpan(spans, start, end);
  if (span) {
    const nextRaw =
      raw.slice(0, span.open) + raw.slice(span.openEnd, span.close) + raw.slice(span.closeEnd);
    const nextStart = mapAfterMarkerRemoval(
      start,
      span.open,
      span.openEnd,
      span.close,
      span.closeEnd,
    );
    const nextEnd = mapAfterMarkerRemoval(end, span.open, span.openEnd, span.close, span.closeEnd);
    return { raw: nextRaw, selection: { start: nextStart, end: Math.max(nextStart, nextEnd) } };
  }

  const containsSpan = spans.some(
    (candidate) =>
      (candidate.open >= start && candidate.closeEnd <= end) ||
      (candidate.open >= start && candidate.close < end && candidate.closeEnd > end),
  );
  const markerCharacter = marker[0];
  const leftRun =
    raw[start - 1] === markerCharacter ? runLengthBack(raw, start - 1, markerCharacter) : 0;
  const rightRun = raw[end] === markerCharacter ? runLengthForward(raw, end, markerCharacter) : 0;
  const touchesProhibitedRun = leftRun + marker.length >= 4 || rightRun + marker.length >= 4;
  if (containsSpan || touchesProhibitedRun) return { raw, selection: { start, end } };

  return {
    raw: raw.slice(0, start) + marker + raw.slice(start, end) + marker + raw.slice(end),
    selection: { start: start + marker.length, end: end + marker.length },
  };
}

interface InlineSpan {
  open: number;
  openEnd: number;
  close: number;
  closeEnd: number;
}

function findSpans(raw: string, kind: "bold" | "italic" | "inline-code"): InlineSpan[] {
  const runs: { start: number; length: number; lineStart: number }[] = [];
  const isStar = kind !== "inline-code";
  let lineStart = 0;
  for (let index = 0; index < raw.length; ) {
    if (raw[index] === "\n") {
      lineStart = ++index;
      continue;
    }
    if (raw[index] !== (isStar ? "*" : "`")) {
      index++;
      continue;
    }
    const start = index;
    while (raw[index] === (isStar ? "*" : "`")) index++;
    const length = index - start;
    const bulletPrefix = raw.slice(raw.lastIndexOf("\n", start - 1) + 1, start);
    if (kind === "italic" && /^ {0,3}$/.test(bulletPrefix) && raw[start + 1] === " ") continue;
    if (kind === "bold" ? length >= 2 : kind === "italic" ? length % 2 === 1 : length >= 1)
      runs.push({ start, length, lineStart });
  }

  const spans: InlineSpan[] = [];
  const runsByLine = new Map<number, typeof runs>();
  for (const run of runs)
    runsByLine.set(run.lineStart, [...(runsByLine.get(run.lineStart) ?? []), run]);
  for (const lineRuns of runsByLine.values()) {
    for (let pair = 0; pair + 1 < lineRuns.length; pair += 2) {
      const opening = lineRuns[pair];
      const closing = lineRuns[pair + 1];
      const open = opening.start;
      const close =
        kind === "bold"
          ? closing.start + closing.length - 2
          : kind === "italic"
            ? closing.start + closing.length - 1
            : closing.start;
      const markerLength = kind === "bold" ? 2 : 1;
      const openEnd = open + markerLength;
      const closeEnd = close + markerLength;
      if (openEnd <= close) spans.push({ open, openEnd, close, closeEnd });
    }
  }
  return spans;
}

function runLengthBack(raw: string, index: number, character: string): number {
  let cursor = index;
  while (cursor >= 0 && raw[cursor] === character) cursor--;
  return index - cursor;
}

function runLengthForward(raw: string, index: number, character: string): number {
  let cursor = index;
  while (cursor < raw.length && raw[cursor] === character) cursor++;
  return cursor - index;
}

function findEnclosingSpan(spans: InlineSpan[], start: number, end: number): InlineSpan | null {
  return (
    spans
      .filter((span) => span.open <= start && span.closeEnd >= end)
      .sort((a, b) => a.closeEnd - a.open - (b.closeEnd - b.open))[0] ?? null
  );
}

function mapAfterMarkerRemoval(
  offset: number,
  open: number,
  openEnd: number,
  close: number,
  closeEnd: number,
): number {
  if (offset <= open) return offset;
  if (offset < openEnd) return open;
  if (offset <= close) return offset - (openEnd - open);
  if (offset < closeEnd) return close - (openEnd - open);
  return offset - (openEnd - open) - (closeEnd - close);
}
export function isBlockFormatSupported(type: BlockType): boolean {
  return !["code", "table", "html", "hr"].includes(type);
}
export function canEditInlineBlock(type: BlockType): boolean {
  return ["paragraph", "heading", "quote", "list"].includes(type);
}
