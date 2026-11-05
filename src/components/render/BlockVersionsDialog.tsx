import { X } from "lucide-react";
import { useMemo } from "react";
import { useAgentStore } from "../../store/agent";
import { useAnnotationsStore } from "../../store/annotations";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

const sourceLabels: Record<string, string> = {
  chat: "Chat",
  review: "Revisión",
  narrative: "Narrativa",
  history: "restaurado desde una versión",
  manual: "Edición manual",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("es-ES");
}

export function BlockVersionsDialog({
  blockKey,
  currentRaw,
  onClose,
}: {
  blockKey: string;
  currentRaw: string;
  onClose: () => void;
}) {
  const versions = useAnnotationsStore((state) => state.blockVersions);
  const blockVersions = useMemo(
    () =>
      versions
        .filter((version) => version.blockKey === blockKey)
        .sort((a, b) => b.createdAt - a.createdAt),
    [versions, blockKey],
  );
  const label = (source: string) => sourceLabels[source] ?? source;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="block-versions-dialog">
        <header className="block-versions-header">
          <DialogTitle>Versiones del bloque</DialogTitle>
          <button
            type="button"
            className="block-versions-close"
            aria-label="Cerrar versiones"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        {blockVersions.length === 0 ? (
          <p className="block-versions-empty">Aún no hay versiones de este bloque.</p>
        ) : (
          <div className="block-versions-list">
            <div className="block-versions-current">
              <strong>Versión actual</strong>
              <span className="block-versions-excerpt">
                {currentRaw
                  .split("\n")
                  .map((line) => line.trim())
                  .find(Boolean) ?? "(vacío)"}
              </span>
            </div>
            {blockVersions.map((version) => (
              <div className="block-versions-row" key={version.id}>
                <span>
                  {formatDate(version.createdAt)} · sustituido por {label(version.source)}
                </span>
                <button
                  type="button"
                  className="button"
                  data-testid={`version-compare-${version.id}`}
                  aria-label={`Comparar versión del ${formatDate(version.createdAt)}`}
                  onClick={() => {
                    useAgentStore.getState().previewVersion(blockKey, version.id);
                    onClose();
                  }}
                >
                  Comparar
                </button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
