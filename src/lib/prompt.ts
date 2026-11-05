/**
 * Construcción del prompt del agente (C10).
 *
 * El prompt es determinista y contiene solo la selección que el llamador pasa
 * en `blocks`: nunca se construye aquí el documento completo. Cada bloque se
 * delimita con marcadores estables que el parser de propuestas reconoce.
 */

import type { Reviewer, TargetAudience } from "./audiences";
import type { BlockType } from "./blocks";
import { isFrontmatterBlock } from "./blocks";
import { type ReviewLens, reviewLensGuidance, reviewLensLabel } from "./review-lens";

/**
 * Definición compartida de los dos conceptos de la conversación: el revisor
 * critica con un rol concreto y la audiencia modula el tono del texto. Se usa
 * en el prompt de revisión, en el de edición y en la variante desde revisión.
 */
export const REVIEWER_AUDIENCE_DEFINITION =
  "Revisor y audiencia son conceptos distintos. El revisor es un ayudante con un rol concreto que critica el texto; la audiencia es el destinatario del texto (para quién se escribe), modula el tono y no critica.";

/**
 * Política de fidelidad al autor. Única fuente de las reglas que todos los
 * prompts de generación y la variante desde revisión reutilizan: no se duplica
 * el texto a mano en cada constructor.
 */
export function fidelityRules(): string[] {
  return [
    "Intervención mínima: cambia solo lo que el requerimiento exige.",
    "Conserva la voz y el registro del autor.",
    "Conserva la longitud aproximada y el ritmo.",
    "Conserva la estructura y el formato Markdown del bloque.",
    "No reescribas lo que ya funciona; no modernices el estilo.",
    "No introduzcas vocabulario que el autor no usaría.",
    "Si dudas entre dos opciones, elige la que menos se aleje del original.",
  ];
}

export interface VariantInstructionReview {
  works: readonly string[];
  problems: readonly { severity: string; issue: string; evidence: string }[];
  suggestions: readonly string[];
}

export interface FittingInstructionInput {
  reviewer: { name: string; role: string } | null;
  lens: ReviewLens;
  problems: readonly { severity: string; issue: string; evidence: string }[];
  suggestions: readonly string[];
}

export function buildFittingInstruction(input: FittingInstructionInput): string {
  const focus: Record<ReviewLens, string> = {
    works: "Conserva y refuerza lo que ya funciona; no introduzcas problemas nuevos.",
    problems: "Corrige solo los problemas más críticos listados.",
    questions: "Resuelve en el texto las preguntas más importantes planteadas.",
    missing: "Incorpora la carencia más crítica como dato, ejemplo o contexto concreto.",
    complete: "Atiende solo los puntos más críticos.",
  };
  return [
    "Sugerencia de mejora para el párrafo revisado.",
    input.reviewer === null
      ? "Revisor: sin definir."
      : `Revisor: ${input.reviewer.name} (${input.reviewer.role}).`,
    `Lente: ${reviewLensLabel(input.lens)}. Foco: ${focus[input.lens]}`,
    "Problemas de contexto:",
    ...input.problems.map((item) => `- [${item.severity}] ${item.issue}: ${item.evidence}`),
    "Sugerencias de contexto:",
    ...input.suggestions.map((item) => `- ${item}`),
    "Devuelve SOLO el párrafo completo que mejor encajaría con este revisor y esta lente.",
    "Reglas de fidelidad:",
    ...fidelityRules().map((rule) => `- ${rule}`),
    "No respondas a todos los puntos ni reescribas por gusto; atiende solo los puntos más críticos.",
    "Prohibido explicar, saludar, usar fences, encabezados, listas o texto fuera de los marcadores.",
  ].join("\n");
}

/**
 * Instrucción canónica para crear una variante desde una revisión: exige el
 * cambio mínimo, quirúrgico, y prohíbe reescribir lo que ya funciona.
 */
export function buildVariantInstruction(review: VariantInstructionReview): string {
  return [
    REVIEWER_AUDIENCE_DEFINITION,
    "",
    "Reglas de fidelidad:",
    ...fidelityRules().map((rule) => `- ${rule}`),
    "",
    "Aplica solo los cambios necesarios para resolver los problemas listados. No toques el resto del bloque.",
    "El cambio debe ser mínimo y quirúrgico: preserva estilo, formato y voz. No reescribas bloques que ya funcionan.",
    "",
    "Conserva lo que funciona:",
    ...review.works.map((item) => `- ${item}`),
    "",
    "Corrige lo que no funciona:",
    ...review.problems.map(
      (item) => `- [${item.severity}] ${item.issue}. Evidencia: ${item.evidence}`,
    ),
    "",
    "Aplica estas sugerencias como cambios puntuales:",
    ...review.suggestions.map((item) => `- ${item}`),
  ].join("\n");
}

export interface DocumentPromptContext {
  path: string | null;
  content: string;
  blockCount: number;
  instruction: string;
  behavior?: string;
  previousDocument?: { before: string; after: string };
}

export interface PromptContext {
  /** Ruta relativa del documento, o `null` para un borrador sin título. */
  path: string | null;
  /** Ruta de headings del primer bloque de la selección. */
  headingTrail: string[];
  blocks: { key: string; type: string; raw: string }[];
  /** Propuesta rechazada que el usuario quiere revisar en esta petición. */
  previousProposal?: { blocks: { key: string; before: string; after: string }[] };
  instruction: string;
  behavior?: string;
}

export interface ReviewPromptContext {
  path: string | null;
  headingTrail: string[];
  blocks: { key: string; type: string; raw: string }[];
  /** Revisor que critica el texto. */
  audience: Reviewer | null;
  targetAudience?: TargetAudience | null;
  instruction: string;
  behavior?: string;
  lens?: ReviewLens;
}

export interface AgentBlockPromptContext {
  path: string | null;
  headingTrail: string[];
  target: { key: string; raw: string };
  before?: { raw: string } | null;
  after?: { raw: string } | null;
  instruction: string;
  behavior?: string;
}

function behaviorLines(behavior: string | undefined): string[] {
  const trimmed = behavior?.trim() ?? "";
  return trimmed.length === 0 ? [] : ["", "Comportamiento del preset:", trimmed, ""];
}

export function agentBlockInstruction(before: boolean, after: boolean): string {
  if (before && after)
    return "Escribe un párrafo de transición que conecte el bloque anterior con el siguiente.";
  if (before) return "Escribe un párrafo que continúe el bloque anterior.";
  if (after) return "Escribe un párrafo introductorio para el bloque siguiente.";
  return "Escribe un párrafo nuevo para el documento.";
}

export function buildAgentBlockPrompt(ctx: AgentBlockPromptContext): string {
  const file = ctx.path === null || ctx.path.length === 0 ? "Borrador sin título" : ctx.path;
  const route = ctx.headingTrail.length > 0 ? ctx.headingTrail.join(" › ") : "Documento";
  return [
    "Eres el agente editor de nrvn. Escribes un bloque nuevo usando el contexto inmediato.",
    "",
    `Archivo: ${file}`,
    `Ruta: ${route}`,
    "",
    "Contexto anterior (solo lectura, no lo devuelvas):",
    ctx.before?.raw ?? "(ninguno)",
    "",
    "Contexto siguiente (solo lectura, no lo devuelvas):",
    ctx.after?.raw ?? "(ninguno)",
    "",
    "Bloque a escribir:",
    `<<<NRVN_BLOCK key="${ctx.target.key}">>>`,
    ctx.target.raw,
    "<<<NRVN_END>>>",
    "",
    "Reglas de fidelidad:",
    ...fidelityRules().map((rule) => `- ${rule}`),
    "",
    "Contrato de salida:",
    `- Responde solo con <<<NRVN_BLOCK key="${ctx.target.key}">>>, el Markdown completo del bloque y <<<NRVN_END>>>.`,
    "- No devuelvas los bloques de contexto, no inventes claves y no añadas texto fuera de los bloques.",
    "- No expliques nada, no uses herramientas y no añadas texto fuera de los bloques.",
    ...behaviorLines(ctx.behavior),
    "Instrucción:",
    ctx.instruction,
  ].join("\n");
}

export function buildReviewPrompt(ctx: ReviewPromptContext): string {
  const lens = ctx.lens ?? "complete";
  const guidance = reviewLensGuidance(lens);
  const file = ctx.path === null || ctx.path.length === 0 ? "Borrador sin título" : ctx.path;
  const route = ctx.headingTrail.length > 0 ? ctx.headingTrail.join(" › ") : "Documento";
  const blockSections = ctx.blocks.map(
    (block) => `<<<NRVN_BLOCK key="${block.key}">>>\n${block.raw}\n<<<NRVN_END>>>`,
  );
  const reviewerLines =
    ctx.audience === null
      ? ["Revisor: sin definir"]
      : [
          `Revisor: ${ctx.audience.name} (${ctx.audience.role})`,
          `Id del revisor: ${ctx.audience.id}`,
          `Perspectiva del revisor: ${ctx.audience.perspective}`,
          "Preguntas clave:",
          ...ctx.audience.questions.map((question) => `- ${question}`),
        ];
  const lensContract =
    lens === "complete"
      ? [
          '- "works": lo que funciona. "problems": lo que no funciona, con evidencia. "suggestions": cómo arreglar cada punto.',
          '- Las "suggestions" son quirúrgicas y ejecutables: di qué cambiar puntualmente (qué frase, qué palabra, qué dato), no reescribas el bloque.',
          "- Prohibido proponer cambios de estilo gratuitos: si algo funciona, se respeta.",
        ]
      : lens === "questions"
        ? [
            '- "works" y "problems" deben ser arrays vacíos; "suggestions" contiene preguntas formuladas como preguntas al autor, sobre el texto, sin veredictos ni reescrituras.',
          ]
        : lens === "missing"
          ? [
              '- "works" y "problems" deben ser arrays vacíos; "suggestions" contiene carencias accionables (datos, ejemplos, contexto o límites), sin reescribir el bloque.',
            ]
          : [
              `- "${lens}" es la única sección con hallazgos; las otras secciones, incluida "suggestions", deben ser arrays vacíos.`,
            ];
  return [
    "Eres el revisor de nrvn. Analizas el texto y devuelves un análisis estructurado.",
    REVIEWER_AUDIENCE_DEFINITION,
    "",
    `Archivo: ${file}`,
    `Ruta: ${route}`,
    ...reviewerLines,
    `Lente de revisión: ${reviewLensLabel(lens)} (id: ${lens})`,
    `Foco: ${guidance.focus}`,
    `Prohibición: ${guidance.avoid}`,
    `Cobertura: ${guidance.coverage}`,
    `Audiencia objetivo: ${ctx.targetAudience?.name ?? "sin definir (texto general)"}`,
    `Bloques: ${ctx.blocks.length}`,
    "",
    blockSections.join("\n\n"),
    "",
    'Reglas de fidelidad (para las sugerencias y el párrafo de "fitting"):',
    ...fidelityRules().map((rule) => `- ${rule}`),
    "",
    "Contrato de salida (revisión estructurada):",
    "- Responde solo con un objeto JSON entre <<<NRVN_REVIEW>>> y <<<NRVN_END>>>.",
    '- Forma: {"audience":"<id>" o null,"blocks":["<clave>"],"works":["..."],"problems":[{"severity":"alta|media|baja","issue":"...","evidence":"..."}],"suggestions":["..."],"fitting":"..." o null}',
    '- "fitting" es la versión del bloque revisado que MEJOR encajaría con ese revisor y esa lente, en un único párrafo breve (Markdown plano: sin fences, sin encabezados, sin listas, sin comillas), conservando voz, registro, longitud aproximada y estructura (aplican las reglas de fidelidad).',
    '- "fitting" debe centrarse SOLO en los puntos más críticos, sin responder a todos los puntos ni forzar todas las recomendaciones; usa null si no aporta una versión mejor. No debe contener marcadores <<<NRVN_.',
    "- Cada lista contiene como máximo 4 elementos; no rellenes las listas para alcanzar ese máximo.",
    "- Cada punto debe ser real y verificable, con cita o evidencia del texto; está prohibido señalar como problema algo que no lo es.",
    '- Si el bloque es demasiado breve o simple para evaluar, devuelve "works":[],"problems":[],"suggestions":[] y "fitting":null, sin inventar hallazgos.',
    ...(lens === "works" || lens === "questions" || lens === "missing"
      ? ['- En esta lente "fitting" debe ser null: la lente no propone reescrituras.']
      : []),
    ...(ctx.blocks.length > 1 ? ['- Con más de un bloque, "fitting" debe ser null.'] : []),
    ctx.audience === null
      ? '- "audience" debe ser null: no hay revisor solicitado.'
      : `- "audience" debe contener exactamente el id del revisor solicitado: "${ctx.audience.id}".`,
    '- La "Audiencia objetivo" es solo contexto para adaptar la crítica: NO copies su id ni su nombre en "audience".',
    ...lensContract,
    "- Usa exactamente las claves de los bloques proporcionados, sin duplicados.",
    '- Esta respuesta es solo una revisión: no devuelvas el bloque reescrito completo salvo en "fitting", que debe ser el párrafo completo y autónomo.',
    "- No uses herramientas y no añadas texto fuera de los marcadores.",
    "",
    ...behaviorLines(ctx.behavior),
    "Instrucción:",
    ctx.instruction,
  ].join("\n");
}

/**
 * Genera el prompt completo de una petición. El formato es parte del contrato
 * con `parseProposal` y con el agente `nrvn-editor`.
 */
export function buildPrompt(ctx: PromptContext): string {
  const file = ctx.path === null || ctx.path.length === 0 ? "Borrador sin título" : ctx.path;
  const route = ctx.headingTrail.length > 0 ? ctx.headingTrail.join(" › ") : "Documento";
  const count = ctx.blocks.length;

  const blockSections = ctx.blocks.map(
    (block) => `<<<NRVN_BLOCK key="${block.key}">>>\n${block.raw}\n<<<NRVN_END>>>`,
  );

  const previousProposal =
    ctx.previousProposal !== undefined && ctx.previousProposal.blocks.length > 0
      ? [
          "Propuesta anterior (rechazada):",
          ...ctx.previousProposal.blocks.flatMap((block) => [
            `- key: ${block.key}`,
            "  antes:",
            ...block.before.split("\n").map((line) => `  ${line}`),
            "  después:",
            ...block.after.split("\n").map((line) => `  ${line}`),
          ]),
        ]
      : [];

  return [
    "Eres el agente editor de nrvn. Propones cambios sobre bloques Markdown concretos.",
    REVIEWER_AUDIENCE_DEFINITION,
    "",
    `Archivo: ${file}`,
    `Ruta: ${route}`,
    `Bloques: ${count}`,
    "",
    blockSections.join("\n\n"),
    "",
    "Reglas de fidelidad:",
    ...fidelityRules().map((rule) => `- ${rule}`),
    "",
    "Contrato de salida:",
    '- Responde solo con bloques usando <<<NRVN_BLOCK key="...">>>, el Markdown completo del bloque y <<<NRVN_END>>>.',
    "- Usa exactamente las claves proporcionadas; no inventes bloques.",
    "- Preserva el Markdown: títulos, listas, tablas, fences y sangría.",
    "- No expliques nada, no uses herramientas y no añadas texto fuera de los bloques.",
    "- Si no propones cambios, responde solo <<<NRVN_NO_CHANGE>>>.",
    ...(previousProposal.length > 0 ? ["", ...previousProposal] : []),
    "",
    ...behaviorLines(ctx.behavior),
    "Instrucción:",
    ctx.instruction,
  ].join("\n");
}

/**
 * Genera el prompt de una petición sobre el documento Markdown completo. El
 * formato es el contrato con `parseDocumentProposal`.
 */
export function buildDocumentPrompt(ctx: DocumentPromptContext): string {
  const file = ctx.path === null || ctx.path.length === 0 ? "Borrador sin título" : ctx.path;
  const empty = ctx.content === "";
  const documentSection = empty
    ? ["Documento vacío (0 caracteres)"]
    : ["<<<NRVN_DOCUMENT>>>", ctx.content, "<<<NRVN_END>>>"];

  const previousDocument =
    ctx.previousDocument === undefined
      ? []
      : [
          "Documento anterior (rechazado):",
          "antes:",
          ctx.previousDocument.before,
          "después:",
          ctx.previousDocument.after,
          "",
        ];

  return [
    "Eres el agente editor de nrvn. Trabajas sobre el documento Markdown completo.",
    REVIEWER_AUDIENCE_DEFINITION,
    `Archivo: ${file}`,
    "Modo: documento completo",
    `Bloques: ${ctx.blockCount}`,
    `Caracteres: ${ctx.content.length}`,
    "",
    ...documentSection,
    "",
    "Reglas de fidelidad:",
    ...fidelityRules().map((rule) => `- ${rule}`),
    "",
    "Contrato de salida:",
    "- Responde solo con el documento completo entre <<<NRVN_DOCUMENT>>> y <<<NRVN_END>>>.",
    "- Incluye el Markdown completo (títulos, listas, tablas, fences y sangría), no un fragmento.",
    "- No expliques nada, no uses herramientas y no añadas texto fuera de los marcadores.",
    "- Si no propones cambios, responde solo <<<NRVN_NO_CHANGE>>>.",
    "",
    ...previousDocument,
    ...behaviorLines(ctx.behavior),
    "Instrucción:",
    ctx.instruction,
  ].join("\n");
}

export type NarrativeRewriteKind = "extend" | "reduce";
export const NARRATIVE_REWRITE_LABELS: Record<NarrativeRewriteKind, string> = {
  extend: "Extender narrativa",
  reduce: "Reducir narrativa",
};
const NARRATIVE_MIN_WORDS: Record<NarrativeRewriteKind, number> = { extend: 6, reduce: 8 };
const NARRATIVE_TYPE_REASONS: Partial<Record<BlockType, string>> = {
  heading: "No aplicable a encabezados",
  code: "No aplicable a bloques de código",
  table: "No aplicable a tablas",
  hr: "No aplicable a separadores",
  html: "No aplicable a bloques HTML",
};
export interface NarrativeEligibility {
  ok: boolean;
  reason: string | null;
}
export function narrativeEligibility(
  type: BlockType,
  raw: string,
  kind: NarrativeRewriteKind,
): NarrativeEligibility {
  const textual = type === "paragraph" || type === "quote" || type === "list";
  if (type === "paragraph" && isFrontmatterBlock(raw))
    return { ok: false, reason: "No se reescribe el frontmatter" };
  if (!textual)
    return { ok: false, reason: NARRATIVE_TYPE_REASONS[type] ?? "No disponible en este bloque" };
  const words = raw.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return { ok: false, reason: "El bloque está vacío" };
  if (words < NARRATIVE_MIN_WORDS[kind])
    return {
      ok: false,
      reason:
        kind === "reduce"
          ? "El bloque es demasiado corto para reducir"
          : "El bloque es demasiado corto para extender",
    };
  return { ok: true, reason: null };
}
export interface NarrativePromptContext {
  path: string | null;
  headingTrail: string[];
  kind: NarrativeRewriteKind;
  target: { key: string; raw: string };
  before?: { raw: string } | null;
  after?: { raw: string } | null;
  behavior?: string;
}
export function buildNarrativePrompt(ctx: NarrativePromptContext): string {
  const file = ctx.path === null || ctx.path.length === 0 ? "Borrador sin título" : ctx.path;
  const route = ctx.headingTrail.length > 0 ? ctx.headingTrail.join(" › ") : "Documento";
  const extend = ctx.kind === "extend";
  return [
    "Eres el agente editor de nrvn. Reescribes un bloque existente sin cambiar su intención.",
    "",
    `Archivo: ${file}`,
    `Ruta: ${route}`,
    `Tarea de reescritura narrativa: ${extend ? "extender" : "reducir"}`,
    "",
    "Contexto anterior (solo lectura, no lo devuelvas):",
    ctx.before?.raw ?? "(ninguno)",
    "",
    "Contexto siguiente (solo lectura, no lo devuelvas):",
    ctx.after?.raw ?? "(ninguno)",
    "",
    "Bloque original:",
    `<<<NRVN_BLOCK key="${ctx.target.key}">>>`,
    ctx.target.raw,
    "<<<NRVN_END>>>",
    "",
    "Reglas de fidelidad (prioriza la fidelidad sobre la longitud objetivo):",
    "- Si el objetivo de longitud entra en conflicto con la fidelidad al original, prioriza la fidelidad y acércate al rango sin inventar.",
    ...fidelityRules().map((rule) => `- ${rule}`),
    "",
    "Reglas de la tarea:",
    "- Conserva la persona gramatical, el tiempo verbal, el registro y el nivel de tecnicismo del original.",
    "- Conserva las muletillas y los rasgos de voz del autor si los hay.",
    "- Preserva el formato Markdown del bloque: no añadas encabezados, listas, tablas, fences ni citas si el original no los tenía.",
    "- Prohibido inventar datos, cifras, nombres o citas que no estén en el bloque o en el contexto inmediato.",
    ...(extend
      ? [
          "- Conserva todas las ideas del original y añade desarrollo: contexto, matices y ejemplos que ya estén implícitos.",
          "- Longitud objetivo: entre 1,6 y 2,2 veces la longitud del original.",
          "- No repitas lo que ya dicen el bloque anterior o el siguiente; usa el contexto para no duplicarlo.",
        ]
      : [
          "- Conserva la tesis y los matices esenciales, incluida la conclusión del bloque y el compromiso que expresa.",
          "- Longitud objetivo: entre el 40 % y el 60 % del original.",
          "- No elimines la conclusión ni cambies el compromiso del bloque.",
          "- No reduzcas por debajo de 6 palabras ni elimines el matiz que distingue la idea.",
        ]),
    "",
    "Contrato de salida:",
    `- Responde solo con <<<NRVN_BLOCK key="${ctx.target.key}">>>, el Markdown completo del bloque reescrito y <<<NRVN_END>>>.`,
    "- Usa exactamente la clave proporcionada; no devuelvas los bloques de contexto.",
    "- No expliques nada, no uses herramientas y no añadas texto fuera de los bloques.",
    "- Si el bloque no admite la operación, responde solo <<<NRVN_NO_CHANGE>>>.",
    ...behaviorLines(ctx.behavior),
    "Instrucción:",
    extend
      ? "Extiende el bloque manteniendo su intención, tono, voz y significado."
      : "Reduce el bloque manteniendo su intención, tono, voz y significado.",
  ].join("\n");
}
