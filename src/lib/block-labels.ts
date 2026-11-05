import type { Block, BlockType } from "./blocks";
import { normalizeHeadingText } from "./markdown";

/** Etiqueta de producto para un tipo de bloque (sin jerga interna). */
const LABELS: Record<BlockType, string> = {
  heading: "Título",
  paragraph: "Párrafo",
  list: "Lista",
  table: "Tabla",
  code: "Código",
  quote: "Cita",
  hr: "Separador",
  html: "HTML",
};

export function blockTypeLabel(type: BlockType): string {
  return LABELS[type] ?? "Bloque";
}

/**
 * Etiqueta legible a partir de la clave interna de un bloque
 * (`ruta#tipo:ordinal`), sin exponer la clave ni el ordinal.
 */
export function blockLabelFromKey(key: string): string {
  const hash = key.indexOf("#");
  const pathPart = hash === -1 ? "" : key.slice(0, hash);
  const typePart = hash === -1 ? key : key.slice(hash + 1);
  const type = typePart.split(":")[0] as BlockType;
  const label = blockTypeLabel(type);
  const path = pathPart.trim();
  if (path.length > 0 && path !== "Documento") {
    return `${label} · ${path}`;
  }
  return label;
}

/**
 * Extracto legible de un bloque: retira la sintaxis Markdown más ruidosa y
 * colapsa el espacio en blanco. Sin colores ni JSX (sólo texto).
 */
export function blockExcerpt(raw: string, max = 70): string {
  const text = raw
    .replace(/^\s*(```|~~~).*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function contextLabel(
  blocks: Block[],
  pendingKeys: ReadonlySet<string> = new Set(),
  mode?: "block" | "section" | "range" | "none",
): string {
  if (blocks.length === 0) return "Editando documento completo";
  if (blocks.length === 1 && pendingKeys.has(blocks[0].key)) return "Editando párrafo nuevo";
  const first = blocks[0];
  if (
    first.type === "heading" &&
    (mode === "section" || blocks.slice(1).every((block) => pendingKeys.has(block.key)))
  )
    return `Editando sección: “${normalizeHeadingText(first.raw.split("\n")[0] ?? "")}”`;
  const text = (first.raw.split("\n")[0] ?? "")
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (blocks.length === 1 && first.type === "heading")
    return `Editando sección: “${normalizeHeadingText(first.raw.split("\n")[0] ?? "")}”`;
  const excerpt = `${text.slice(0, 20)}${text.length > 20 ? "…" : ""}`;
  if (blocks.length > 1) return `Editando ${blocks.length} bloques: “${excerpt}”`;
  return `Editando párrafo: “${excerpt}”`;
}
