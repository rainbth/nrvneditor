import { create } from "zustand";
import type { MetadataPickResult } from "../../electron/types";
import { useAgentStore } from "../store/agent";
import { useAnnotationsStore } from "../store/annotations";
import { useDocumentStore } from "../store/document";
import { useUiStore } from "../store/ui";
import { docKeyForDocument } from "./agent-session";
import { nrvn } from "./ipc";

type ImportPreview = MetadataPickResult & { canceled: false };
interface MetadataImportState {
  preview: ImportPreview | null;
  setPreview: (preview: ImportPreview | null) => void;
  close: () => void;
}

export const useMetadataImport = create<MetadataImportState>((set) => ({
  preview: null,
  setPreview: (preview) => set({ preview }),
  close: () => set({ preview: null }),
}));

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

function currentDocument() {
  const { path, localId } = useDocumentStore.getState();
  return { relPath: path, docKey: docKeyForDocument(path, localId) };
}

export async function exportMetadataForCurrentDocument(): Promise<void> {
  try {
    const result = await nrvn.metadata.exportDocument(currentDocument());
    if (!result.canceled)
      useUiStore
        .getState()
        .setToast(
          `Metadatos exportados: ${result.path.split(/[\\/]/).at(-1)}. Mueve el .nrvn junto al .md.`,
        );
  } catch (reason: unknown) {
    useUiStore.getState().setToast(messageOf(reason, "No se pudieron exportar los metadatos"));
  }
}

export async function beginMetadataImport(): Promise<void> {
  try {
    const result = await nrvn.metadata.pickImport(currentDocument());
    if (!result.canceled) useMetadataImport.getState().setPreview(result);
  } catch (reason: unknown) {
    useUiStore.getState().setToast(messageOf(reason, "No se pudieron leer los metadatos"));
  }
}

export async function applyMetadataImport(
  resolution: "local" | "imported",
): Promise<{ ok: boolean; error?: string }> {
  const preview = useMetadataImport.getState().preview;
  if (!preview) return { ok: false, error: "No hay metadatos para importar." };
  const { relPath, docKey } = currentDocument();
  try {
    const result = await nrvn.metadata.applyImport({
      relPath,
      docKey,
      bundle: preview.bundle,
      confirmed: true,
      resolution,
    });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    await useAnnotationsStore.getState().loadForDocument(docKey);
    useMetadataImport.getState().close();
    await useDocumentStore.getState().loadPendingForDocument();
    void useAgentStore.getState().loadForDocument(docKey);
    useUiStore
      .getState()
      .setToast(
        `Metadatos importados (${result.summary.messages} mensajes, ` +
          `${result.summary.pending} pendientes)`,
      );
    return { ok: true };
  } catch (reason: unknown) {
    const error = messageOf(reason, "No se pudieron importar los metadatos");
    return { ok: false, error };
  }
}
