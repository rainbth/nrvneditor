import type { Block } from "./blocks";

/** Entrada del outline derivada de un bloque `heading`. */
export interface OutlineItem {
  key: string;
  level: number;
  text: string;
  line: number;
  blockIndex: number;
}

/** Limpia el texto de un heading quitando marcadores Markdown. */
export function normalizeHeadingText(raw: string): string {
  let text = raw;

  // Marcadores ATX de apertura y cierre.
  text = text.replace(/^\s*#{1,6}\s*/, "");
  text = text.replace(/\s*#+\s*$/, "");

  // Imágenes y enlaces → texto visible.
  text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Código inline.
  text = text.replace(/`+([^`]*)`+/g, "$1");

  // Negritas, cursivas y tachado.
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");

  // Espacios colapsados y sin extremos.
  return text.replace(/\s+/g, " ").trim();
}

/** Recorre los bloques y devuelve el outline en orden de documento. */
export function extractOutline(blocks: Block[]): OutlineItem[] {
  const items: OutlineItem[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type !== "heading") continue;
    const firstLine = block.raw.split("\n")[0] ?? "";
    items.push({
      key: block.key,
      level: block.level ?? 1,
      text: normalizeHeadingText(firstLine),
      line: block.startLine,
      blockIndex: index,
    });
  }
  return items;
}

/** Último heading del outline cuya línea de inicio es <= la línea visible. */
export function activeOutlineKeyForLine(outline: OutlineItem[], line: number): string | null {
  let active: string | null = null;
  for (const item of outline) {
    if (item.line > line) break;
    active = item.key;
  }
  return active;
}

/** Contexto plano de una selección de bloques (lo usa el Loop B). */
export function blocksToPlainContext(blocks: Block[]): string {
  return blocks
    .map((block) =>
      block.raw
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim(),
    )
    .filter((text) => text.length > 0)
    .join("\n\n");
}
