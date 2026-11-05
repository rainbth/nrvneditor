export type AudienceTone = "blue" | "sage" | "lavender" | "butter" | "pearl" | "accent";

export interface Reviewer {
  id: string;
  name: string;
  role: string;
  description: string;
  perspective: string;
  questions: readonly string[];
  defaultInstruction: string;
  avatar: string;
  tone: AudienceTone;
}

export type Audience = Reviewer;

export interface TargetAudience {
  id: string;
  name: string;
  description: string;
  tone: AudienceTone;
}

export interface AudienceFinding {
  severity: "alta" | "media" | "baja";
  issue: string;
  evidence: string;
}

export interface AudienceBlockCritique {
  key: string;
  verdict: "solido" | "aceptable" | "debil";
  summary: string;
  findings: AudienceFinding[];
  suggestions: string[];
}

export interface AudienceCritique {
  audience: string;
  blocks: AudienceBlockCritique[];
}

export interface ReviewProblem {
  severity: "alta" | "media" | "baja";
  issue: string;
  evidence: string;
}

export interface ReviewResult {
  audience: string | null;
  blocks: string[];
  works: string[];
  problems: ReviewProblem[];
  suggestions: string[];
  fitting: string | null;
}

export const REVIEWERS: readonly Reviewer[] = [
  {
    id: "director",
    name: "Director/a",
    role: "Visión y ambición",
    description: "Evalúa la visión global y la ambición del texto.",
    perspective: "la visión global, la ambición del texto y qué debe recordar el lector",
    questions: ["¿Qué idea debe recordar el lector?", "¿El texto está a la altura de su ambición?"],
    defaultInstruction:
      "Revisa este bloque como Director/a y critícalo desde la visión global, la ambición del texto y qué debe recordar el lector.",
    avatar: "🎬",
    tone: "lavender",
  },
  {
    id: "ejecutivo",
    name: "Ejecutivo/a",
    role: "Claridad y decisión",
    description: "Busca claridad ejecutiva y decisiones accionables.",
    perspective: "la claridad ejecutiva, las decisiones accionables y el coste de lectura",
    questions: ["¿Qué decisión concreta permite tomar?", "¿Puede entenderse más rápido?"],
    defaultInstruction:
      "Revisa este bloque como Ejecutivo/a y critícalo desde la claridad ejecutiva, las decisiones accionables y el coste de lectura.",
    avatar: "📊",
    tone: "blue",
  },
  {
    id: "par",
    name: "Par (colega de oficio)",
    role: "Oficio y criterio",
    description: "Aporta criterio de alguien que conoce el oficio.",
    perspective: "el oficio, los atajos honestos y los errores que un colega detecta al instante",
    questions: [
      "¿Qué atajo o supuesto resulta poco honesto?",
      "¿Qué error detectaría al instante un colega?",
    ],
    defaultInstruction:
      "Revisa este bloque como Par (colega de oficio) y critícalo desde el oficio, los atajos honestos y los errores que un colega detecta al instante.",
    avatar: "🤝",
    tone: "sage",
  },
  {
    id: "pm",
    name: "PM (responsable de producto)",
    role: "Valor y alcance",
    description: "Examina el problema del usuario, el alcance y los resultados.",
    perspective: "el problema del usuario, el alcance y los resultados explícitos",
    questions: [
      "¿Qué problema del usuario resuelve?",
      "¿Quedan claros el alcance y los resultados?",
    ],
    defaultInstruction:
      "Revisa este bloque como PM (responsable de producto) y critícalo desde el problema del usuario, el alcance y los resultados explícitos.",
    avatar: "🎯",
    tone: "butter",
  },
  {
    id: "cliente-esceptico",
    name: "Cliente escéptico",
    role: "Pruebas y objeciones",
    description: "Cuestiona la credibilidad y las afirmaciones sin respaldo.",
    perspective: "la credibilidad, la evidencia y las objeciones sin responder",
    questions: [
      "¿Qué afirmaciones necesitan pruebas?",
      "¿Qué objeción importante queda sin responder?",
    ],
    defaultInstruction:
      "Revisa este bloque como Cliente escéptico y critícalo desde la credibilidad, la evidencia y las objeciones sin responder.",
    avatar: "🤨",
    tone: "accent",
  },
  {
    id: "lector-tecnico",
    name: "Lector técnico",
    role: "Exactitud y repro",
    description: "Prioriza la exactitud, los supuestos y la reproducibilidad.",
    perspective: "la exactitud, los supuestos y la reproducibilidad",
    questions: ["¿Se puede reproducir lo descrito?", "¿Qué supuestos o dependencias faltan?"],
    defaultInstruction:
      "Revisa este bloque como Lector técnico y critícalo desde la exactitud, los supuestos y la reproducibilidad.",
    avatar: "💻",
    tone: "pearl",
  },
  {
    id: "editor",
    name: "Editor/a de mesa",
    role: "Estructura y precisión",
    description: "Cuida la estructura, la coherencia y la precisión editorial.",
    perspective: "la estructura, la coherencia y la precisión editorial",
    questions: ["¿La estructura guía bien al lector?", "¿Hay ambigüedades o redundancias?"],
    defaultInstruction:
      "Revisa este bloque como Editor/a de mesa y critícalo desde la estructura, la coherencia y la precisión editorial.",
    avatar: "✏️",
    tone: "sage",
  },
];

/** @deprecated Legacy reviewer alias; UI "audience" means TARGET_AUDIENCES. */
export const AUDIENCES = REVIEWERS;
export const TARGET_AUDIENCES: readonly TargetAudience[] = [
  {
    id: "general",
    name: "Lector general",
    description: "Para quién escribo: cualquier persona",
    tone: "blue",
  },
  {
    id: "tecnico",
    name: "Perfil técnico",
    description: "Para quién escribo: lectores técnicos",
    tone: "pearl",
  },
  {
    id: "decisor",
    name: "Decisor ejecutivo",
    description: "Para quién escribo: responsables de decisión",
    tone: "lavender",
  },
  {
    id: "academico",
    name: "Lector académico",
    description: "Para quién escribo: lectores académicos",
    tone: "sage",
  },
  {
    id: "cliente",
    name: "Cliente",
    description: "Para quién escribo: clientes y posibles compradores",
    tone: "accent",
  },
];
export const TARGET_AUDIENCE_ALIASES: Readonly<Record<string, string>> = { ejecutivo: "decisor" };
export const LEGACY_REVIEWER_ALIASES: Readonly<Record<string, string>> = {
  "publico-general": "par",
  docente: "par",
  desarrollador: "lector-tecnico",
  producto: "pm",
};
export const VERDICT_LABELS: Record<AudienceBlockCritique["verdict"], string> = {
  solido: "Sólido",
  aceptable: "Aceptable",
  debil: "Débil",
};

export function reviewerById(id: string | null | undefined): Reviewer | null {
  if (id == null) return null;
  const resolved = LEGACY_REVIEWER_ALIASES[id] ?? id;
  return REVIEWERS.find((reviewer) => reviewer.id === resolved) ?? null;
}
export const audienceById = reviewerById;
export function audienceName(id: string | null | undefined): string {
  return reviewerById(id)?.name ?? "Sin revisor";
}
export function audienceAvatar(id: string | null | undefined): string {
  return reviewerById(id)?.avatar ?? "👤";
}
export function audienceTone(id: string | null | undefined): AudienceTone {
  return reviewerById(id)?.tone ?? "blue";
}
export function targetAudienceById(id: string | null | undefined): TargetAudience | null {
  if (id == null) return null;
  const resolved = TARGET_AUDIENCE_ALIASES[id] ?? id;
  return TARGET_AUDIENCES.find((audience) => audience.id === resolved) ?? null;
}
export function targetAudienceName(id: string | null | undefined): string {
  return targetAudienceById(id)?.name ?? "General";
}
export function primaryCritiqueBlockKey(critique: AudienceCritique | null): string | null {
  return critique?.blocks[0]?.key ?? null;
}
export function primaryReviewBlockKey(review: { blocks: string[] } | null): string | null {
  return review?.blocks[0] ?? null;
}
