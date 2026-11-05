import { splitBlocks } from "../../src/lib/blocks";
import type { ProposalApplyBlock } from "../types";

const MAX_BLOCKS = 2000;

/**
 * Aplica reemplazos de bloques sobre el contenido actual, validando en el
 * proceso principal que cada bloque existe y conserva el `before` propuesto.
 * El contenido de entrada debe estar normalizado a LF.
 */
export function applyBlockReplacements(
  content: string,
  replacements: ProposalApplyBlock[],
): { ok: true; content: string } | { ok: false; error: string } {
  if (replacements.length === 0) {
    return { ok: false, error: "La propuesta no incluye bloques que aplicar." };
  }
  if (replacements.length > MAX_BLOCKS) {
    return { ok: false, error: "La propuesta supera el límite de 2000 bloques." };
  }

  const seen = new Set<string>();
  for (const replacement of replacements) {
    if (seen.has(replacement.key)) {
      return { ok: false, error: `La clave «${replacement.key}» está repetida en la propuesta.` };
    }
    seen.add(replacement.key);
  }

  const byKey = new Map(splitBlocks(content).map((block) => [block.key, block]));

  const targets: { startOffset: number; endOffset: number; after: string }[] = [];
  for (const replacement of replacements) {
    const block = byKey.get(replacement.key);
    if (block === undefined) {
      return {
        ok: false,
        error: `El bloque «${replacement.key}» ya no existe en el documento.`,
      };
    }
    if (block.raw !== replacement.before) {
      return {
        ok: false,
        error: `El bloque «${replacement.key}» cambió en el documento; no se puede aplicar la propuesta.`,
      };
    }
    targets.push({
      startOffset: block.startOffset,
      endOffset: block.endOffset,
      after: replacement.after,
    });
  }

  // Reemplazar de mayor a menor offset evita desplazar los rangos pendientes.
  targets.sort((a, b) => b.startOffset - a.startOffset);
  let next = content;
  for (const target of targets) {
    next = next.slice(0, target.startOffset) + target.after + next.slice(target.endOffset);
  }

  return { ok: true, content: next };
}
