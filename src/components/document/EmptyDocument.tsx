import { toggleViewMode } from "../../lib/commands";

/**
 * Lienzo mínimo para un documento vacío (sin workspace o sin contenido).
 * Invita a empezar a escribir y a saltar al editor Markdown.
 */
export function EmptyDocument() {
  return (
    <div className="empty-document" data-testid="empty-document">
      <h1 className="empty-document-title">Empieza a escribir…</h1>
      <button
        type="button"
        className="button button-primary"
        onClick={() => toggleViewMode("markdown")}
      >
        Editar en Markdown
      </button>
    </div>
  );
}
