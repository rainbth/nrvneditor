import type { MenuCommand } from "../../electron/types";
import { useDocumentStore } from "../store/document";
import { useSelectionStore } from "../store/selection";
import { useUiStore, type ViewMode } from "../store/ui";
import { useWorkspaceStore } from "../store/workspace";
import { nrvn } from "./ipc";
import { beginMetadataImport, exportMetadataForCurrentDocument } from "./metadata";
import { captureScrollAnchor } from "./view-anchor";

/** Pide resolver un conflicto externo. Devuelve false si se pospone. */
export async function resolveExternalConflict(): Promise<boolean> {
  const state = useDocumentStore.getState();
  if (state.externalChange === null) return true;
  const reload = window.confirm(
    "El archivo cambió en disco y tienes cambios sin guardar. " +
      "Aceptar = recargar desde disco y descartar tus cambios.",
  );
  if (reload) {
    await state.resolveExternalChange("reload");
    return true;
  }
  const overwrite = window.confirm(
    "¿Sobrescribir el archivo en disco con tus cambios locales? " +
      "Aceptar = sobrescribir. Cancelar = mantener el conflicto sin guardar.",
  );
  if (overwrite) {
    await state.resolveExternalChange("overwrite");
    return true;
  }
  useUiStore
    .getState()
    .setToast("Conflicto pendiente: vuelve a guardar o a cambiar de documento para resolverlo.");
  return false;
}

/**
 * Cambia entre Render y Markdown conservando el ancla de scroll. Se bloquea
 * mientras hay una carga o un error; con un documento vacío (idle) sí permite
 * saltar al editor desde `EmptyDocument`.
 */
export function toggleViewMode(next?: ViewMode): void {
  const ui = useUiStore.getState();
  const status = useDocumentStore.getState().status;
  if (status === "loading" || status === "error") return;
  const target = next ?? (ui.mode === "render" ? "markdown" : "render");
  if (target === ui.mode) return;
  ui.setScrollAnchor(captureScrollAnchor(ui.mode));
  ui.setMode(target);
}

/**
 * Selecciona todos los bloques del documento como un rango continuo. Si el
 * foco está en un campo de texto (composer, inputs), delega en la selección
 * nativa del texto para que Cmd+A no robe el atajo al usuario.
 */
export function selectWholeDocument(): void {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    active.select();
    return;
  }
  const blocks = useDocumentStore.getState().blocks;
  if (blocks.length === 0) return;
  const selection = useSelectionStore.getState();
  selection.selectBlock(0);
  if (blocks.length > 1) selection.extendTo(blocks.length - 1);
}

/** Copia el Markdown fuente del documento al portapapeles con aviso efímero. */
export async function copyMarkdown(): Promise<void> {
  const { content } = useDocumentStore.getState();
  try {
    const ok = await nrvn.app.copyText(content);
    useUiStore.getState().setToast(ok ? "Markdown copiado" : "No se pudo copiar");
  } catch {
    useUiStore.getState().setToast("No se pudo copiar");
  }
}

/** Crea un documento vacío sin workspace de forma explícita para el usuario. */
export async function newDocumentForUser(): Promise<void> {
  if (!(await resolveExternalConflict())) return;
  const store = useDocumentStore.getState();
  if (!(await store.closeDocument())) {
    useUiStore
      .getState()
      .setToast(
        useDocumentStore.getState().saveError ??
          "No se pudo guardar; se conserva el documento actual",
      );
    return;
  }
  useSelectionStore.getState().clear();
  useUiStore.getState().setMode("render");
  useUiStore.getState().setToast("Documento nuevo");
}

/** Punto único de entrada para los comandos del menú nativo y los menús in-app. */
export function runCommand(command: MenuCommand): void {
  switch (command) {
    case "open-folder":
      void useWorkspaceStore.getState().openFolder();
      break;
    case "new-document":
      void newDocumentForUser();
      break;
    case "save":
      void resolveExternalConflict().then((resolved) => {
        if (resolved) void useDocumentStore.getState().save();
      });
      break;
    case "save-as":
      void resolveExternalConflict().then((resolved) => {
        if (resolved) void useDocumentStore.getState().saveAs();
      });
      break;
    case "export-metadata":
      void exportMetadataForCurrentDocument();
      break;
    case "import-metadata":
      void beginMetadataImport();
      break;
    case "toggle-mode":
      toggleViewMode();
      break;
    case "select-all-document":
      selectWholeDocument();
      break;
    case "copy-markdown":
      void copyMarkdown();
      break;
    case "reopen-workspace":
      void useWorkspaceStore.getState().reopenRecent();
      break;
    case "refresh-tree":
      void useWorkspaceStore.getState().refreshTree();
      break;
    case "reveal-workspace":
      void useWorkspaceStore.getState().revealWorkspace();
      break;
    case "close-document":
      void newDocumentForUser();
      break;
    case "copy-path": {
      const path = useDocumentStore.getState().path;
      void useWorkspaceStore.getState().copyPath(path);
      break;
    }
    case "reveal-path": {
      const path = useDocumentStore.getState().path;
      const workspace = useWorkspaceStore.getState();
      if (path === null) void workspace.revealWorkspace();
      else void workspace.revealPath(path);
      break;
    }
    case "toggle-line-numbers":
      useUiStore.getState().toggleLineNumbers();
      break;
    case "render-font-lato":
      useUiStore.getState().setRenderFont("lato");
      break;
    case "render-font-newsreader":
      useUiStore.getState().setRenderFont("newsreader");
      break;
    case "render-font-system":
      useUiStore.getState().setRenderFont("system");
      break;
    case "page-zoom-in":
      useUiStore.getState().zoomPageIn();
      break;
    case "page-zoom-out":
      useUiStore.getState().zoomPageOut();
      break;
    case "page-zoom-reset":
      useUiStore.getState().zoomPageReset();
      break;
    case "toggle-tree":
      useUiStore.getState().toggleTree();
      break;
    case "toggle-agent":
      useUiStore.getState().toggleAgent();
      break;
    case "about":
      useUiStore.getState().setAboutOpen(true);
      break;
    case "show-onboarding":
      useUiStore.getState().openOnboarding();
      break;
    default:
      break;
  }
}
