import { useCallback, useEffect, useState } from "react";
import { useDocumentStore } from "../../store/document";

const DISMISS_PREFIX = "nrvn.agent-note.dismissed.";

function isDismissed(docKey: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(`${DISMISS_PREFIX}${docKey}`) === "1";
  } catch {
    return false;
  }
}

function persistDismissed(docKey: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(`${DISMISS_PREFIX}${docKey}`, "1");
  } catch {
    // Sin almacenamiento: la nota se oculta solo en esta sesión.
  }
}

/**
 * Post-it de bienvenida sobre un documento vacío. Se descarta por documento
 * (`path ?? localId`) y no roba el foco: escribir o seleccionar sigue
 * funcionando por debajo. Aparece de nuevo al crear un documento nuevo.
 */
export function EditorAgentNote() {
  const path = useDocumentStore((state) => state.path);
  const localId = useDocumentStore((state) => state.localId);
  const blocks = useDocumentStore((state) => state.blocks);

  const docKey = path ?? localId;
  const [dismissed, setDismissed] = useState(() => isDismissed(docKey));

  // Cambiar de documento recalcula el descarte (nuevo localId → reaparece).
  useEffect(() => {
    setDismissed(isDismissed(docKey));
  }, [docKey]);

  const dismiss = useCallback(() => {
    persistDismissed(docKey);
    setDismissed(true);
  }, [docKey]);

  const visible = blocks.length === 0 && !dismissed;

  // Escape también cierra la nota, salvo que el foco esté en un campo de texto.
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        // CodeMirror usa contenteditable: Escape ahí pertenece al editor.
        if (target.isContentEditable) return;
      }
      event.preventDefault();
      dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <aside
      className="editor-agent-note"
      role="note"
      aria-label="Editor Agentico"
      data-testid="editor-agent-note"
      data-doc-key={docKey}
    >
      <h2 className="editor-agent-note-title">Editor Agentico</h2>
      <p className="editor-agent-note-copy">
        Pide a tu agente que edite el archivo, escribe, o selecciona secciones para trabajar con tu
        agente
      </p>
      <button
        type="button"
        className="editor-agent-note-ok"
        title="Cerrar la nota del editor"
        onClick={dismiss}
      >
        OK
      </button>
    </aside>
  );
}
