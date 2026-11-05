import lensComplete from "../assets/lens-icons/lens-complete.png?url";
import lensMissing from "../assets/lens-icons/lens-missing.png?url";
import lensProblems from "../assets/lens-icons/lens-problems.png?url";
import lensQuestions from "../assets/lens-icons/lens-questions.png?url";
import lensWorks from "../assets/lens-icons/lens-works.png?url";

export type ReviewLens = "complete" | "works" | "problems" | "questions" | "missing";

export const REVIEW_LENSES: readonly {
  id: ReviewLens;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    id: "works",
    label: "Qué ve bien",
    description: "Identifica lo que funciona.",
    icon: lensWorks,
  },
  {
    id: "problems",
    label: "Qué ve mal",
    description: "Busca problemas con evidencia.",
    icon: lensProblems,
  },
  {
    id: "questions",
    label: "Qué preguntaría",
    description: "Formula preguntas que aclaren el texto.",
    icon: lensQuestions,
  },
  {
    id: "missing",
    label: "Qué le faltaría",
    description: "Detecta carencias accionables.",
    icon: lensMissing,
  },
  {
    id: "complete",
    label: "Revisión completa",
    description: "Revisa todos los aspectos.",
    icon: lensComplete,
  },
];

export function reviewLensById(id: string | null | undefined) {
  return REVIEW_LENSES.find((lens) => lens.id === id) ?? null;
}

export function reviewLensLabel(id: string | null | undefined): string {
  return reviewLensById(id)?.label ?? "Revisión completa";
}

export function reviewLensGuidance(lens: ReviewLens | string): {
  focus: string;
  avoid: string;
  coverage: string;
} {
  const guidance: Record<ReviewLens, { focus: string; avoid: string; coverage: string }> = {
    works: {
      focus: "Identifica únicamente los aspectos concretos que funcionan.",
      avoid: "No señales problemas ni sugieras cambios.",
      coverage: 'Incluye hallazgos solo en "works"; deja "problems" y "suggestions" vacíos.',
    },
    problems: {
      focus: "Identifica únicamente problemas verificables con evidencia.",
      avoid: "No incluyas elogios ni soluciones/sugerencias.",
      coverage: 'Incluye hallazgos solo en "problems"; deja "works" y "suggestions" vacíos.',
    },
    questions: {
      focus: "Formula preguntas útiles que el lector haría sobre el texto.",
      avoid: "No conviertas las preguntas en problemas o soluciones.",
      coverage: 'Incluye solo preguntas en "suggestions"; deja "works" y "problems" vacíos.',
    },
    missing: {
      focus: "Señala únicamente información o elementos ausentes que sean accionables.",
      avoid: "No incluyas elogios ni problemas distintos a carencias.",
      coverage:
        'Incluye carencias accionables solo en "suggestions"; deja "works" y "problems" vacíos.',
    },
    complete: {
      focus: "Evalúa lo que funciona, los problemas y sus soluciones.",
      avoid: "No propongas cambios de estilo gratuitos.",
      coverage: 'Usa las tres claves: "works", "problems" y "suggestions".',
    },
  };
  return guidance[lens as ReviewLens] ?? guidance.complete;
}
