/**
 * True si un evento de fin de turno pertenece a un turno anterior al prompt
 * en curso, es decir, si su marca `created` es estrictamente anterior al
 * instante en que se lanzó el prompt actual. Sin datos, no se puede afirmar
 * que sea obsoleto.
 */
export function isStaleTurnEvent(
  eventCreated: number | undefined,
  promptStartedAt: number | undefined,
): boolean {
  if (typeof eventCreated !== "number") return false;
  if (typeof promptStartedAt !== "number") return false;
  return eventCreated < promptStartedAt;
}
