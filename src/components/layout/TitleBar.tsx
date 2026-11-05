import { nrvn } from "../../lib/ipc";
import { type SaveState, useDocumentStore } from "../../store/document";

const LABELS: Record<SaveState, string> = {
  saved: "Guardado",
  saving: "Guardando…",
  dirty: "Sin guardar",
  error: "Error al guardar",
};

/**
 * Franja superior de la ventana (full-width). Contiene el nombre de la app tras
 * los semáforos de macOS y el estado de guardado. La franja es arrastrable; el
 * estado es lo único no interactivo pero excluido del drag para poder
 * seleccionarlo.
 */
export function TitleBar() {
  const path = useDocumentStore((state) => state.path);
  const saveState = useDocumentStore((state) => state.saveState);

  const label = path === null && saveState === "saved" ? "Borrador" : LABELS[saveState];

  return (
    <header className="titlebar" data-testid="titlebar">
      <span className="titlebar-name">
        nrvn{" "}
        <span
          className="titlebar-version"
          data-testid="titlebar-version"
          title={`Versión ${nrvn.app.version}`}
        >
          {nrvn.app.version}
        </span>
      </span>
      <span className="titlebar-spacer" />
      <span
        className="save-state"
        data-testid="save-state"
        data-state={saveState}
        data-draft={path === null ? "true" : undefined}
        role="status"
        aria-live={saveState === "error" ? "assertive" : "polite"}
      >
        {label}
      </span>
    </header>
  );
}
