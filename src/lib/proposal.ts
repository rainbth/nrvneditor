/**
 * Parser tolerante de propuestas del agente (C11).
 *
 * El agente responde con bloques delimitados por marcadores. El parser no
 * confía en el texto recibido: duplicados o texto fuera
 * de los bloques invalida la propuesta completa. El contenido de cada bloque
 * se preserva byte a byte salvo los saltos de línea de cortesía del delimitador.
 */

import type { AgentProposal } from "../../electron/types";
import type { ReviewProblem, ReviewResult } from "./audiences";
import { reviewerById } from "./audiences";
import type { Block } from "./blocks";

/** Selecciona el bloque propuesto más relevante que existe en el documento. */
export function resolveProposalAnchorKey(
  proposal: AgentProposal | null,
  blocks: Block[],
  selected: number[],
): string | null {
  if (proposal?.kind !== "blocks") return null;
  const keys = new Set(proposal.blocks.map((block) => block.key));
  for (const index of selected) {
    const key = blocks[index]?.key;
    if (key && keys.has(key)) return key;
  }
  return (
    proposal.blocks.find((block) => blocks.some((item) => item.key === block.key))?.key ?? null
  );
}

export interface ParsedProposalBlock {
  key: string;
  after: string;
}

export type ParseProposalResult =
  | { ok: true; blocks: ParsedProposalBlock[] }
  | { ok: false; raw: string; reason: string };

const START_RE =
  /<<<[ \t]*NRVN_BLOCK[ \t]+key[ \t]*=[ \t]*(?:"([^"\r\n]*)"|'([^'\r\n]*)')[ \t]*>>>/g;
const END_RE = /<<<[ \t]*NRVN_END[ \t]*>>>/g;
const NO_CHANGE_RE = /<<<[ \t]*NRVN_NO_CHANGE[ \t]*>>>/;

function fail(text: string, reason: string): ParseProposalResult {
  return { ok: false, raw: text, reason };
}

/** Retira un único salto de línea inicial y otro final (LF o CRLF). */
function trimCourtesyNewlines(value: string): string {
  return value.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

/**
 * Parsea la respuesta del agente contra el conjunto de claves seleccionadas.
 * Devuelve `{ ok: true, blocks: [] }` para `NRVN_NO_CHANGE`.
 */
export function parseProposal(text: string, allowedKeys: ReadonlySet<string>): ParseProposalResult {
  const blocks: ParsedProposalBlock[] = [];
  const seen = new Set<string>();
  let cursor = 0;

  START_RE.lastIndex = 0;
  let start = START_RE.exec(text);
  while (start !== null) {
    const outside = text.slice(cursor, start.index);
    if (outside.trim() !== "") {
      return fail(text, "Hay texto fuera de los bloques de la propuesta.");
    }

    const key = start[1] ?? start[2] ?? "";
    if (key.length === 0) {
      return fail(text, "Un bloque de la propuesta no incluye clave.");
    }
    if (!allowedKeys.has(key)) {
      return fail(text, `El bloque «${key}» no pertenece a la selección.`);
    }
    if (seen.has(key)) {
      return fail(text, `El bloque «${key}» está repetido en la propuesta.`);
    }

    END_RE.lastIndex = START_RE.lastIndex;
    const end = END_RE.exec(text);
    if (end === null) {
      return fail(text, `Falta <<<NRVN_END>>> para el bloque «${key}».`);
    }

    const after = trimCourtesyNewlines(text.slice(START_RE.lastIndex, end.index));
    blocks.push({ key, after });
    seen.add(key);

    cursor = END_RE.lastIndex;
    START_RE.lastIndex = END_RE.lastIndex;
    start = START_RE.exec(text);
  }

  if (blocks.length === 0) {
    const withoutNoChange = text.replace(NO_CHANGE_RE, "");
    if (withoutNoChange.trim() === "" && NO_CHANGE_RE.test(text)) {
      return { ok: true, blocks: [] };
    }
    if (NO_CHANGE_RE.test(text)) {
      return fail(text, "Hay texto fuera de los bloques de la propuesta.");
    }
    return fail(text, "No se encontró ninguna propuesta.");
  }

  if (text.slice(cursor).trim() !== "") {
    return fail(text, "Hay texto fuera de los bloques de la propuesta.");
  }

  return { ok: true, blocks };
}

const DOCUMENT_START_RE = /<<<[ \t]*NRVN_DOCUMENT[ \t]*>>>/g;
const DOCUMENT_END_RE = /<<<[ \t]*NRVN_END[ \t]*>>>/g;

export type ParseDocumentResult =
  | { ok: true; content: string | null }
  | { ok: false; raw: string; reason: string };

function countMatches(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(text) !== null) count += 1;
  return count;
}

/**
 * Parser estricto de una propuesta de documento completo. El contenido entre
 * marcadores se preserva byte a byte salvo un salto de línea de cortesía en
 * cada extremo; cualquier texto fuera de los marcadores invalida la propuesta.
 */
export function parseDocumentProposal(text: string): ParseDocumentResult {
  const noChangeOnly = text.replace(NO_CHANGE_RE, "");
  if (noChangeOnly.trim() === "" && NO_CHANGE_RE.test(text)) {
    return { ok: true, content: null };
  }

  const documentCount = countMatches(text, DOCUMENT_START_RE);
  const endCount = countMatches(text, DOCUMENT_END_RE);
  if (documentCount === 0 || endCount === 0) {
    return { ok: false, raw: text, reason: "No se encontró el documento de la propuesta." };
  }
  if (documentCount > 1 || endCount > 1) {
    return {
      ok: false,
      raw: text,
      reason: "La propuesta incluye marcadores duplicados del documento.",
    };
  }

  DOCUMENT_START_RE.lastIndex = 0;
  const start = DOCUMENT_START_RE.exec(text);
  DOCUMENT_END_RE.lastIndex = 0;
  const end = DOCUMENT_END_RE.exec(text);
  if (start === null || end === null) {
    return { ok: false, raw: text, reason: "No se encontró el documento de la propuesta." };
  }

  const before = text.slice(0, start.index);
  const after = text.slice(end.index + end[0].length);
  if (before.trim() !== "" || after.trim() !== "") {
    return {
      ok: false,
      raw: text,
      reason: "Hay texto fuera del documento de la propuesta.",
    };
  }
  if (end.index < DOCUMENT_START_RE.lastIndex - start[0].length) {
    return {
      ok: false,
      raw: text,
      reason: "El cierre del documento aparece antes de su apertura.",
    };
  }

  const content = trimCourtesyNewlines(text.slice(start.index + start[0].length, end.index));
  return { ok: true, content };
}

/**
 * Reemplazo total del documento. Exige que el contenido actual coincida con el
 * que se propuso (antes) para no pisar cambios del usuario.
 */
export function buildDocumentReplacement(
  current: string,
  before: string,
  after: string,
): { ok: true; content: string } | { ok: false; error: string } {
  const normalize = (value: string): string => value.replace(/\r\n/g, "\n");
  if (normalize(current) !== normalize(before)) {
    return { ok: false, error: "El documento cambió desde que se propuso el cambio." };
  }
  return { ok: true, content: after };
}

export interface ReplacementBlock {
  key: string;
  startOffset: number;
  endOffset: number;
  raw: string;
}

export type BuildReplacementResult = { ok: true; content: string } | { ok: false; error: string };

/**
 * Aplica los bloques parseados sobre el contenido actual, validando que cada
 * clave existe y que el bloque no cambió desde que se propuso el cambio.
 */
export function buildReplacement(
  content: string,
  blocks: ReplacementBlock[],
  parsed: ParsedProposalBlock[],
): BuildReplacementResult {
  if (parsed.length === 0) return { ok: true, content };

  const byKey = new Map<string, ReplacementBlock>();
  for (const block of blocks) {
    if (byKey.has(block.key)) {
      return { ok: false, error: `La clave «${block.key}» está repetida en el documento.` };
    }
    byKey.set(block.key, block);
  }

  const targets: (ReplacementBlock & { after: string })[] = [];
  const seen = new Set<string>();
  for (const candidate of parsed) {
    if (seen.has(candidate.key)) {
      return { ok: false, error: `La clave «${candidate.key}» está repetida en la propuesta.` };
    }
    seen.add(candidate.key);

    const block = byKey.get(candidate.key);
    if (block === undefined) {
      return { ok: false, error: `El bloque «${candidate.key}» ya no existe en el documento.` };
    }
    if (
      block.startOffset < 0 ||
      block.endOffset > content.length ||
      block.startOffset > block.endOffset
    ) {
      return { ok: false, error: `Los offsets del bloque «${block.key}» no son válidos.` };
    }
    const current = content.slice(block.startOffset, block.endOffset);
    const normalize = (value: string): string => value.replace(/\r\n/g, "\n");
    if (normalize(current) !== normalize(block.raw)) {
      return {
        ok: false,
        error: `El bloque «${block.key}» cambió en el documento; no se puede aplicar la propuesta.`,
      };
    }
    targets.push({ ...block, after: candidate.after });
  }

  // Reemplazar de mayor a menor offset evita desplazar los rangos pendientes.
  targets.sort((a, b) => b.startOffset - a.startOffset);
  let next = content;
  for (const target of targets) {
    next = next.slice(0, target.startOffset) + target.after + next.slice(target.endOffset);
  }

  return { ok: true, content: next };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type ParseReviewResult =
  | { ok: true; review: ReviewResult }
  | { ok: false; raw: string; reason: string };
const REVIEW_RE = /^<<<[ \t]*NRVN_REVIEW[ \t]*>>>([\s\S]*?)<<<[ \t]*NRVN_END[ \t]*>>>$/;

function unwrapReviewEnvelope(text: string): string {
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/);
  const opening = lines[0]?.match(/^(`{3,}|~{3,})[^\r\n]*$/);
  const closing = lines[lines.length - 1]?.match(/^(`{3,}|~{3,})\s*$/);
  if (
    !opening ||
    !closing ||
    opening[1][0] !== closing[1][0] ||
    closing[1].length < opening[1].length
  )
    return trimmed;
  const inner = lines.slice(1, -1).join("\n").trim();
  if (inner.startsWith("<<<NRVN_REVIEW") && inner.endsWith("<<<NRVN_END>>>")) return inner;
  return trimmed;
}

export function sanitizeFitting(value: string): string | null {
  const lines = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .flatMap((line) => {
      let item = line.trim();
      if (/^(?:`{3,}|~{3,})/.test(item)) return [];
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(item) || /^<!--[\s\S]*-->$/.test(item)) return [];
      item = item.trim();
      let previous: string;
      do {
        previous = item;
        item = item
          .replace(/^#{1,6}\s+/, "")
          .replace(/^(?:[-*+]\s+|\d{1,9}[.)]\s+)/, "")
          .replace(/^>\s?/, "")
          .trim();
      } while (item !== previous);
      return item ? [item] : [];
    });
  return lines.join(" ") || null;
}

export function parseReview(
  text: string,
  allowedKeys: ReadonlySet<string>,
  expectedAudience: string | null,
): ParseReviewResult {
  const fail = (reason: string): ParseReviewResult => ({ ok: false, raw: text, reason });
  const match = unwrapReviewEnvelope(text).match(REVIEW_RE);
  if (!match)
    return fail("La revisión debe estar dentro de un único par de marcadores, sin texto exterior.");
  let value: unknown;
  try {
    value = JSON.parse(match[1]);
  } catch {
    return fail("El JSON de la revisión no es válido.");
  }
  if (!isRecord(value)) return fail("El JSON de la revisión debe ser un objeto.");
  const required = ["audience", "blocks", "works", "problems", "suggestions"];
  if (required.some((key) => !(key in value)))
    return fail("La revisión contiene claves obligatorias ausentes.");
  if (value.fitting !== undefined && value.fitting !== null && typeof value.fitting !== "string")
    return fail("fitting debe ser null o un texto no vacío.");
  if (typeof value.fitting === "string" && value.fitting.includes("<<<NRVN_"))
    return fail("fitting no debe contener marcadores <<<NRVN_.");
  const fitting = typeof value.fitting === "string" ? sanitizeFitting(value.fitting) : null;
  if (
    value.audience !== null &&
    (typeof value.audience !== "string" || value.audience.trim() === "")
  )
    return fail("La audiencia de la revisión no es válida.");
  let audience: string | null;
  if (value.audience === null) {
    if (expectedAudience !== null) return fail("La revisión debe indicar el revisor solicitado.");
    audience = null;
  } else {
    const expectedId = reviewerById(expectedAudience)?.id ?? expectedAudience;
    const receivedId = reviewerById((value.audience as string).trim())?.id ?? null;
    if (expectedId === null)
      return fail("La audiencia de la revisión no coincide con la solicitada.");
    if (receivedId !== expectedId)
      return fail("La audiencia de la revisión no coincide con la solicitada.");
    audience = expectedId;
  }
  if (
    !Array.isArray(value.blocks) ||
    value.blocks.length !== allowedKeys.size ||
    !value.blocks.every((key) => typeof key === "string" && allowedKeys.has(key)) ||
    new Set(value.blocks).size !== value.blocks.length
  )
    return fail("Los bloques de la revisión no coinciden con la selección.");
  const stringList = (items: unknown): items is string[] =>
    Array.isArray(items) && items.every((item) => typeof item === "string" && item.trim() !== "");
  if (!stringList(value.works) || !stringList(value.suggestions))
    return fail("works y suggestions deben contener textos no vacíos.");
  if (
    !Array.isArray(value.problems) ||
    value.problems.some(
      (problem) =>
        !isRecord(problem) ||
        typeof problem.severity !== "string" ||
        !["alta", "media", "baja"].includes(problem.severity) ||
        typeof problem.issue !== "string" ||
        !problem.issue.trim() ||
        typeof problem.evidence !== "string" ||
        !problem.evidence.trim(),
    )
  )
    return fail("Los problemas de la revisión no son válidos.");
  const problems = value.problems.map((problem) => {
    const item = problem as Record<string, unknown>;
    return {
      severity: item.severity as ReviewProblem["severity"],
      issue: (item.issue as string).trim(),
      evidence: (item.evidence as string).trim(),
    };
  });
  if (
    value.works.length === 0 &&
    value.problems.length === 0 &&
    value.suggestions.length === 0 &&
    value.fitting !== null
  )
    return fail("La revisión debe incluir al menos un punto.");
  return {
    ok: true,
    review: {
      audience,
      blocks: value.blocks as string[],
      works: value.works.map((item) => item.trim()),
      problems,
      suggestions: value.suggestions.map((item) => item.trim()),
      // Normaliza el párrafo propuesto quitando espacios exteriores.
      fitting,
    },
  };
}
