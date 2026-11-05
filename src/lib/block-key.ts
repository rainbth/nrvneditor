/** Indica si el bloque debe impedir Enter/espacio para selección/edición. */
export function shouldPreventBlockKey(
  event: { key: string; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
  editing: boolean,
): boolean {
  return !editing && (event.key === "Enter" || event.key === " ");
}
