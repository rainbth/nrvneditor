import { useEffect, useState } from "react";
import { applyMetadataImport, useMetadataImport } from "../../lib/metadata";
import { useDocumentStore } from "../../store/document";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

function basename(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

export function MetadataImportDialog() {
  const preview = useMetadataImport((state) => state.preview);
  const close = useMetadataImport((state) => state.close);
  const destination = useDocumentStore((state) => state.path);
  const [resolution, setResolution] = useState<"local" | "imported">("local");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState(preview);
  useEffect(() => {
    if (preview) setView(preview);
  }, [preview]);
  const shown = preview ?? view;
  useEffect(() => {
    if (preview) {
      setResolution("local");
      setError(null);
    }
  }, [preview]);

  async function confirm() {
    setBusy(true);
    try {
      const result = await applyMetadataImport(resolution);
      setError(result.ok ? null : (result.error ?? "No se pudieron importar los metadatos."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={preview !== null}
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent data-testid="metadata-import-dialog" aria-busy={busy}>
        {shown ? (
          <>
            <DialogTitle>Importar metadatos</DialogTitle>
            <DialogDescription>Archivo de origen: {basename(shown.sourcePath)}</DialogDescription>
            <p>Documento de origen: {shown.bundle.document.path ?? "sin ruta"}</p>
            <p>Se importará en: {destination ?? "borrador sin guardar"}</p>
            {shown.bundle.document.path === null ? (
              <p data-testid="metadata-import-provenance">
                El archivo no indica a qué documento pertenece; se importará en{" "}
                {destination ?? "este borrador"}.
              </p>
            ) : shown.bundle.document.path !== destination ? (
              <p data-testid="metadata-import-provenance">
                Este archivo de metadatos pertenece a otro documento. El contenido del .md no se
                modifica.
              </p>
            ) : null}
            <p>
              Hilos: {shown.summary.threads} · Mensajes: {shown.summary.messages} · Pendientes:{" "}
              {shown.summary.pending} · Sesiones: {shown.summary.history} · Comentarios:{" "}
              {shown.summary.comments} · Críticas: {shown.summary.critiques} · Guardado:{" "}
              {new Date(shown.bundle.document.savedAt).toLocaleString()}
            </p>
            {shown.hasExisting && (
              <p>Este documento ya tiene metadatos. Se combinarán sin duplicar identificadores.</p>
            )}
            {shown.hashConflict && (
              <fieldset>
                <legend>El documento importado no coincide con la versión actual</legend>
                <label>
                  <input
                    type="radio"
                    name="metadata-conflict"
                    data-testid="metadata-conflict-local"
                    checked={resolution === "local"}
                    onChange={() => {
                      setResolution("local");
                      setError(null);
                    }}
                  />
                  Conservar los metadatos locales
                </label>
                <label>
                  <input
                    type="radio"
                    name="metadata-conflict"
                    data-testid="metadata-conflict-imported"
                    checked={resolution === "imported"}
                    onChange={() => {
                      setResolution("imported");
                      setError(null);
                    }}
                  />
                  Sustituir con los metadatos importados
                </label>
              </fieldset>
            )}
            {shown.hashConflict && shown.summary.pending > 0 && (
              <p data-testid="metadata-import-anchors">
                Los bloques pendientes importados pueden no anclar al contenido actual del .md.
              </p>
            )}
            {shown.hashConflict && (
              <p>
                En ambos casos el contenido del .md no se modifica; la opción decide qué historial
                prevalece en los IDs duplicados.
              </p>
            )}
            <p role="note">
              El archivo .nrvn puede contener texto de tus conversaciones. Revísalo antes de
              compartirlo.
            </p>
            {error && (
              <p role="alert" data-testid="metadata-import-error">
                {error}
              </p>
            )}
            <div className="about-actions" style={{ gap: 8 }}>
              <button
                type="button"
                className="button button-primary"
                disabled={busy}
                onClick={() => void confirm()}
                data-testid="metadata-import-confirm"
              >
                {busy ? "Importando…" : shown.hasExisting ? "Combinar metadatos" : "Importar"}
              </button>
              <button type="button" className="button" disabled={busy} onClick={close}>
                Cancelar
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
