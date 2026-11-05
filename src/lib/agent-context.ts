/**
 * Contexto de trabajo del agente: selección de bloques o documento completo.
 *
 * La UI puede seleccionar bloques sueltos, pero hay dos casos en los que el
 * agente debe recibir el documento entero: cuando no hay selección y cuando la
 * selección cubre todos los bloques (⌘A equivale a documento completo).
 */

export type ContextMode = "selection" | "document";

function coversAll(blocks: { length: number }, indexes: number[]): boolean {
  if (blocks.length === 0) return false;
  const unique = new Set(indexes);
  for (let index = 0; index < blocks.length; index += 1) {
    if (!unique.has(index)) return false;
  }
  return true;
}

export function contextModeFor(blocks: { length: number }, indexes: number[]): ContextMode {
  if (blocks.length === 0) return "document";
  if (indexes.length === 0) return "document";
  if (coversAll(blocks, indexes)) return "document";
  return "selection";
}

/** Etiqueta de producto del contexto documento, sin jerga interna. */
export function documentContextLabel(blockCount: number): string {
  if (blockCount <= 0) return "Documento vacío";
  return `Documento completo · ${blockCount} ${blockCount === 1 ? "bloque" : "bloques"}`;
}
