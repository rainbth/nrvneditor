import { hashBlock } from "./hash";
import { normalizeHeadingText } from "./markdown";

const HASH_CACHE_LIMIT = 512;
const blockHashCache = new Map<string, string>();
let blockHashComputations = 0;

export function blockHashComputationCount(): number {
  return blockHashComputations;
}

function cachedBlockHash(raw: string): string {
  const cached = blockHashCache.get(raw);
  if (cached !== undefined) return cached;
  blockHashComputations += 1;
  const hash = hashBlock(raw);
  blockHashCache.set(raw, hash);
  if (blockHashCache.size > HASH_CACHE_LIMIT) {
    const oldest = blockHashCache.keys().next().value;
    if (oldest !== undefined) blockHashCache.delete(oldest);
  }
  return hash;
}

export function blockHashCacheSize(): number {
  return blockHashCache.size;
}

export type BlockType =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "code"
  | "quote"
  | "hr"
  | "html";

/** Bloque atómico del documento: fuente de verdad para selección y agente. */
export interface Block {
  key: string;
  type: BlockType;
  level?: number;
  headingPath: string[];
  ordinal: number;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  raw: string;
  hash: string;
  pending?: boolean;
  anchorKey?: string | null;
}

export function isFrontmatterBlock(raw: string): boolean {
  return /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n)?$/.test(raw);
}

interface Line {
  text: string;
  start: number;
  end: number;
}

interface HeadingFrame {
  level: number;
  text: string;
}

const HTML_BLOCK_TAGS: ReadonlySet<string> = new Set([
  "div",
  "table",
  "details",
  "section",
  "figure",
  "iframe",
  "script",
  "style",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "p",
  "blockquote",
]);

const ATX_RE = /^ {0,3}(#{1,6})[ \t]+/;
const SETEXT_RE = /^ {0,3}(=+|-+)[ \t]*$/;
const HR_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const LIST_RE = /^\s*(?:[-*+]|\d{1,9}[.)])[ \t]+/;
const QUOTE_RE = /^ {0,3}>/;

/** Divide el texto original en líneas conservando offsets exactos. */
function toLines(text: string): Line[] {
  const lines: Line[] = [];
  let index = 0;
  while (index < text.length) {
    const newline = text.indexOf("\n", index);
    const rawEnd = newline === -1 ? text.length : newline;
    let contentEnd = rawEnd;
    if (contentEnd > index && text[contentEnd - 1] === "\r") contentEnd -= 1;
    lines.push({ text: text.slice(index, contentEnd), start: index, end: contentEnd });
    if (newline === -1) break;
    index = newline + 1;
  }
  return lines;
}

function isBlank(line: Line): boolean {
  return line.text.trim() === "";
}

function fenceOpen(text: string): { char: string; length: number } | null {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(text);
  if (!match) return null;
  const run = match[1];
  return { char: run[0], length: run.length };
}

function isFenceClose(text: string, char: string, length: number): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text);
  if (!match) return false;
  const run = match[1];
  return run[0] === char && run.length >= length;
}

function isHr(text: string): boolean {
  return HR_RE.test(text);
}

function isSetextUnderline(text: string): boolean {
  return SETEXT_RE.test(text);
}

function isListMarker(text: string): boolean {
  return LIST_RE.test(text);
}

function htmlTagStart(text: string): string | null {
  const match = /^ {0,3}<([a-zA-Z][a-zA-Z0-9]*)\b/.exec(text);
  if (!match) return null;
  const tag = match[1].toLowerCase();
  return HTML_BLOCK_TAGS.has(tag) ? tag : null;
}

function isTableSeparator(text: string): boolean {
  if (!text.includes("|")) return false;
  return /^\s{0,3}\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(text);
}

function isTableStart(lines: Line[], index: number): boolean {
  const line = lines[index];
  if (!line?.text.includes("|")) return false;
  const next = lines[index + 1];
  if (!next) return false;
  return isTableSeparator(next.text);
}

function startsNewBlock(lines: Line[], index: number): boolean {
  const line = lines[index];
  if (!line || isBlank(line)) return true;
  const text = line.text;
  if (fenceOpen(text)) return true;
  if (ATX_RE.test(text)) return true;
  if (isHr(text)) return true;
  if (QUOTE_RE.test(text)) return true;
  if (isListMarker(text)) return true;
  if (htmlTagStart(text)) return true;
  if (isTableStart(lines, index)) return true;
  return false;
}

/** Cierra un bloque de código fence-aware; devuelve la última línea incluida. */
function consumeFence(lines: Line[], start: number, char: string, length: number): number {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (isFenceClose(lines[index].text, char, length)) return index;
  }
  return lines.length - 1;
}

function consumeQuote(lines: Line[], start: number): number {
  let index = start + 1;
  while (index < lines.length) {
    const text = lines[index].text;
    if (text.trim() === "") break;
    if (QUOTE_RE.test(text) || /^\s/.test(text)) {
      index += 1;
      continue;
    }
    break;
  }
  return index - 1;
}

function consumeTable(lines: Line[], start: number): number {
  let index = start + 2;
  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line) || !line.text.includes("|")) break;
    index += 1;
  }
  return index - 1;
}

function consumeHtml(lines: Line[], start: number, tag: string): number {
  const closing = new RegExp(`</${tag}\\b`, "i");
  let index = start;
  while (index < lines.length) {
    const text = lines[index].text;
    if (index > start && text.trim() === "") return index - 1;
    if (closing.test(text)) return index;
    index += 1;
  }
  return lines.length - 1;
}

function consumeList(lines: Line[], start: number): number {
  let index = start + 1;
  while (index < lines.length) {
    const text = lines[index].text;
    if (text.trim() === "") {
      // Una línea en blanco no rompe la lista si el siguiente ítem/continuación
      // pertenece a la misma lista (interpretación simple, ver test).
      let next = index + 1;
      while (next < lines.length && lines[next].text.trim() === "") next += 1;
      if (next < lines.length && (isListMarker(lines[next].text) || /^\s/.test(lines[next].text))) {
        index = next;
        continue;
      }
      break;
    }
    if (isListMarker(text) || /^\s/.test(text)) {
      index += 1;
      continue;
    }
    break;
  }
  return index - 1;
}

function consumeParagraph(lines: Line[], start: number): number {
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line) || startsNewBlock(lines, index)) break;
    if (isSetextUnderline(line.text)) break;
    const next = lines[index + 1];
    if (next && isSetextUnderline(next.text)) break;
    index += 1;
  }
  return index - 1;
}

function makeBlock(
  type: BlockType,
  from: number,
  to: number,
  lines: Line[],
  original: string,
  stack: HeadingFrame[],
  ordinals: Map<string, number>,
  level?: number,
): Block {
  const headingPath = stack.map((frame) => frame.text);
  const pathId = headingPath.join("\u001f");
  const ordinalKey = `${pathId}\u0000${type}`;
  const ordinal = ordinals.get(ordinalKey) ?? 0;
  ordinals.set(ordinalKey, ordinal + 1);

  const startOffset = lines[from].start;
  const endOffset = lines[to].end;
  const raw = original.slice(startOffset, endOffset);

  const block: Block = {
    key: `${headingPath.join(" › ")}#${type}:${ordinal}`,
    type,
    headingPath,
    ordinal,
    startLine: from,
    endLine: to,
    startOffset,
    endOffset,
    raw,
    hash: cachedBlockHash(raw),
  };
  if (level !== undefined) block.level = level;
  return block;
}

/** Divide un documento Markdown en bloques fence-aware. */
export function splitBlocks(markdown: string): Block[] {
  if (markdown.length === 0) return [];

  const lines = toLines(markdown);
  const blocks: Block[] = [];
  const stack: HeadingFrame[] = [];
  const ordinals = new Map<string, number>();

  const push = (type: BlockType, from: number, to: number, level?: number): void => {
    blocks.push(makeBlock(type, from, to, lines, markdown, stack, ordinals, level));
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line)) {
      index += 1;
      continue;
    }
    const text = line.text;

    // 1. Frontmatter en la primera línea (solo si cierra).
    if (index === 0 && !markdown.startsWith("\uFEFF") && text.trim() === "---") {
      let close = -1;
      for (let cursor = 1; cursor < lines.length; cursor += 1) {
        const candidate = lines[cursor].text.trim();
        if (candidate === "---" || candidate === "...") {
          close = cursor;
          break;
        }
      }
      if (close !== -1) {
        push("paragraph", 0, close);
        index = close + 1;
        continue;
      }
    }

    // 2. Bloque de código delimitado por fences.
    const fence = fenceOpen(text);
    if (fence) {
      const end = consumeFence(lines, index, fence.char, fence.length);
      push("code", index, end);
      index = end + 1;
      continue;
    }

    // 3. Heading ATX (una sola línea).
    const atx = ATX_RE.exec(text);
    if (atx) {
      const level = atx[1].length;
      const headingText = normalizeHeadingText(text);
      push("heading", index, index, level);
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: headingText });
      index += 1;
      continue;
    }

    // 4. Heading Setext (texto + subrayado ===/---).
    const next = lines[index + 1];
    if (next && isSetextUnderline(next.text) && !startsNewBlock(lines, index)) {
      const level = next.text.trim().startsWith("=") ? 1 : 2;
      const headingText = normalizeHeadingText(text);
      push("heading", index, index + 1, level);
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: headingText });
      index += 2;
      continue;
    }

    // 5. Regla horizontal.
    if (isHr(text)) {
      push("hr", index, index);
      index += 1;
      continue;
    }

    // 6. Cita.
    if (QUOTE_RE.test(text)) {
      const end = consumeQuote(lines, index);
      push("quote", index, end);
      index = end + 1;
      continue;
    }

    // 7. Tabla.
    if (isTableStart(lines, index)) {
      const end = consumeTable(lines, index);
      push("table", index, end);
      index = end + 1;
      continue;
    }

    // 8. HTML de bloque.
    const tag = htmlTagStart(text);
    if (tag) {
      const end = consumeHtml(lines, index, tag);
      push("html", index, end);
      index = end + 1;
      continue;
    }

    // 9. Lista.
    if (isListMarker(text)) {
      const end = consumeList(lines, index);
      push("list", index, end);
      index = end + 1;
      continue;
    }

    // 10. Párrafo (por defecto).
    const end = consumeParagraph(lines, index);
    push("paragraph", index, end);
    index = end + 1;
  }

  return blocks;
}

/** Bloques cuyo rango de líneas intersecta `[fromLine, toLine]`, en orden. */
export function blocksForLineRange(blocks: Block[], fromLine: number, toLine: number): Block[] {
  const from = Math.min(fromLine, toLine);
  const to = Math.max(fromLine, toLine);
  return blocks.filter((block) => block.endLine >= from && block.startLine <= to);
}

/**
 * Índice del bloque que contiene el offset. Si cae en un hueco (línea en
 * blanco o final del documento) devuelve el bloque anterior más cercano.
 */
export function blockIndexAtOffset(blocks: Block[], offset: number): number {
  if (blocks.length === 0) return -1;
  let low = 0;
  let high = blocks.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const block = blocks[middle];
    if (offset < block.startOffset) {
      high = middle - 1;
    } else if (offset >= block.endOffset) {
      low = middle + 1;
    } else {
      return middle;
    }
  }
  return Math.min(Math.max(low - 1, 0), blocks.length - 1);
}
