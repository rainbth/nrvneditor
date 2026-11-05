/**
 * Esqueleto de prosa mientras el documento activo se lee de disco. El arranque
 * con documento vacío lo cubre `EmptyDocument`.
 */
export function DocumentPlaceholder() {
  return (
    <div className="document-placeholder" data-testid="document-placeholder">
      <div
        className="prose-skeleton"
        role="status"
        aria-busy="true"
        aria-label="Cargando documento"
      >
        <span className="skeleton-line skeleton-title" />
        <span className="skeleton-line" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-short" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-short" />
      </div>
    </div>
  );
}
