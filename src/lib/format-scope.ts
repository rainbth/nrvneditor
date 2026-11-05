export type SelectionScope = "selection" | "word" | "line" | "none";

export function selectionScopeLabel(
  scope: SelectionScope,
  activeKind: "paragraph" | "block" | null,
): string {
  if (scope === "none") {
    if (activeKind === "paragraph") return "Párrafo activo";
    if (activeKind === "block") return "Bloque activo";
    return "Sin selección";
  }
  return { selection: "Selección", word: "Palabra", line: "Línea" }[scope];
}

export function shouldShowBubble(input: {
  mode: string;
  critiqueOpen: boolean;
  proposalOpen: boolean;
  hasElement: boolean;
  blocks: number;
  selectionMode: string;
  contentEditable: boolean;
  elementIsActive: boolean;
  dismissed: boolean;
}): boolean {
  return (
    input.mode === "render" &&
    !input.critiqueOpen &&
    !input.proposalOpen &&
    input.hasElement &&
    input.blocks > 0 &&
    (input.selectionMode !== "none" || input.contentEditable || input.elementIsActive) &&
    !input.dismissed
  );
}
