import {
  Copy,
  Download,
  FilePlus,
  FileX,
  FolderSearch,
  ListChecks,
  Minus,
  PanelLeft,
  PanelRight,
  Plus,
  Save,
  SaveAll,
  Upload,
} from "lucide-react";
import type { RenderFont } from "../../../electron/types";
import { runCommand, toggleViewMode } from "../../lib/commands";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";
import { useUiStore, type ViewMode } from "../../store/ui";
import { useWorkspaceStore } from "../../store/workspace";
import { IconButton } from "../common/IconButton";
import { MetadataImportDialog } from "../ui/MetadataImportDialog";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

/** Directorio padre del documento activo; `workspace` cuando está en la raíz. */
function parentLabel(path: string): string {
  const parent = path.split("/").slice(0, -1).join(" / ");
  return parent.length > 0 ? parent : "workspace";
}

function pageSizeLabel(size: "letter" | "a4" | "wide" | "web"): string {
  return { letter: "Carta", a4: "A4", wide: "Ancha", web: "Web" }[size];
}

/** Barra superior del panel central: archivo, menús, toggle de modo y selección. */
export function HeaderBar() {
  const path = useDocumentStore((state) => state.path);
  const documentStatus = useDocumentStore((state) => state.status);
  const blocks = useDocumentStore((state) => state.blocks);
  const anchor = useSelectionStore((state) => state.anchor);
  const focus = useSelectionStore((state) => state.focus);
  const selectionMode = useSelectionStore((state) => state.mode);
  const mode = useUiStore((state) => state.mode);
  const treeOpen = useUiStore((state) => state.treeOpen);
  const agentOpen = useUiStore((state) => state.agentOpen);
  const renderFont = useUiStore((state) => state.renderFont);
  const lineNumbers = useUiStore((state) => state.lineNumbers);
  const pageSize = useUiStore((state) => state.pageSize);
  const pageZoom = useUiStore((state) => state.pageZoom);
  const setPageZoom = useUiStore((state) => state.setPageZoom);
  const toggleTree = useUiStore((state) => state.toggleTree);
  const toggleAgent = useUiStore((state) => state.toggleAgent);
  const setRenderFont = useUiStore((state) => state.setRenderFont);
  const setLineNumbers = useUiStore((state) => state.setLineNumbers);
  const setPageSize = useUiStore((state) => state.setPageSize);
  const setAboutOpen = useUiStore((state) => state.setAboutOpen);
  const openOnboarding = useUiStore((state) => state.openOnboarding);

  const revealPath = useWorkspaceStore((state) => state.revealPath);
  const copyPath = useWorkspaceStore((state) => state.copyPath);

  const selectMode = (next: ViewMode) => {
    if (next === mode) return;
    if (documentStatus === "loading" || documentStatus === "error") {
      useUiStore
        .getState()
        .setToast(
          documentStatus === "loading"
            ? "Espera a que el documento termine de cargar para cambiar de modo."
            : "No se puede cambiar de modo mientras el documento tiene un error.",
        );
      return;
    }
    toggleViewMode(next);
  };

  const selectionCount = selectedIndexes({ anchor, focus, mode: selectionMode }, blocks).length;
  const selectionSummary =
    selectionCount > 0
      ? `Área de edición · ${selectionCount} ${selectionCount === 1 ? "bloque" : "bloques"}`
      : "";

  return (
    <header className="header-bar">
      <div className="header-identity">
        <span className="header-title" data-testid="doc-title">
          {path ? baseName(path) : "Sin título"}
        </span>
        <span className="header-path" title={path ?? undefined}>
          {path ? parentLabel(path) : "Borrador sin guardar"}
        </span>
      </div>
      <div className="header-actions">
        <span className="sr-only" aria-live="polite">
          {selectionSummary}
        </span>

        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="menu-trigger" data-testid="menu-file-trigger">
              Archivo
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<FilePlus />} shortcut="⌘N" onSelect={() => runCommand("new-document")}>
              Nuevo
            </MenuItem>
            <MenuItem icon={<Save />} shortcut="⌘S" onSelect={() => runCommand("save")}>
              Guardar
            </MenuItem>
            <MenuItem icon={<SaveAll />} shortcut="⇧⌘S" onSelect={() => runCommand("save-as")}>
              Guardar como…
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Upload />} onSelect={() => runCommand("export-metadata")}>
              Exportar metadatos…
            </MenuItem>
            <MenuItem icon={<Download />} onSelect={() => runCommand("import-metadata")}>
              Importar metadatos…
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Copy />}
              disabled={path === null}
              onSelect={() => path && void copyPath(path)}
            >
              Copiar ruta
            </MenuItem>
            <MenuItem
              icon={<FolderSearch />}
              disabled={path === null}
              onSelect={() => path && void revealPath(path)}
            >
              Revelar en Finder
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<FileX />} onSelect={() => runCommand("close-document")}>
              Cerrar documento
            </MenuItem>
          </MenuContent>
        </Menu>

        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="menu-trigger" data-testid="menu-document-trigger">
              Documento
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuRadioGroup value={mode} onValueChange={(value) => selectMode(value as ViewMode)}>
              <MenuRadioItem value="render" shortcut="⌘E">
                Render
              </MenuRadioItem>
              <MenuRadioItem value="markdown" shortcut="⌘E">
                Markdown
              </MenuRadioItem>
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuItem icon={<ListChecks />} onSelect={() => runCommand("select-all-document")}>
              Seleccionar documento completo
            </MenuItem>
            <MenuItem icon={<Copy />} onSelect={() => runCommand("copy-markdown")}>
              Copiar Markdown
            </MenuItem>
          </MenuContent>
        </Menu>

        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="menu-trigger"
              data-testid="menu-view-trigger"
              title={`Tamaño de página: ${pageSizeLabel(pageSize)}`}
            >
              Ver
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuLabel>Tamaño de página</MenuLabel>
            <MenuRadioGroup
              value={pageSize}
              onValueChange={(value) => setPageSize(value as "letter" | "a4" | "wide" | "web")}
            >
              <MenuRadioItem value="letter">Carta</MenuRadioItem>
              <MenuRadioItem value="a4">A4</MenuRadioItem>
              <MenuRadioItem value="wide">Ancha</MenuRadioItem>
              <MenuRadioItem value="web">Web</MenuRadioItem>
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuItem shortcut="⌘+" onSelect={() => runCommand("page-zoom-in")}>
              Ampliar zoom de página
            </MenuItem>
            <MenuItem shortcut="⌘−" onSelect={() => runCommand("page-zoom-out")}>
              Reducir zoom de página
            </MenuItem>
            <MenuItem shortcut="⌘0" onSelect={() => runCommand("page-zoom-reset")}>
              Restablecer zoom
            </MenuItem>
            <MenuSeparator />
            <MenuCheckboxItem
              checked={lineNumbers}
              onCheckedChange={(checked) => setLineNumbers(checked)}
            >
              Números de línea en render
            </MenuCheckboxItem>
            <MenuSeparator />
            <MenuLabel>Fuente de render</MenuLabel>
            <MenuRadioGroup
              value={renderFont}
              onValueChange={(value) => setRenderFont(value as RenderFont)}
            >
              <MenuRadioItem value="lato">Lato</MenuRadioItem>
              <MenuRadioItem value="newsreader">Newsreader</MenuRadioItem>
              <MenuRadioItem value="system">Sistema</MenuRadioItem>
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuCheckboxItem checked={treeOpen} onCheckedChange={() => toggleTree()}>
              Mostrar árbol
            </MenuCheckboxItem>
            <MenuCheckboxItem checked={agentOpen} onCheckedChange={() => toggleAgent()}>
              Mostrar agente
            </MenuCheckboxItem>
            <MenuSeparator />
            <MenuItem onSelect={openOnboarding}>Guía rápida</MenuItem>
            <MenuItem onSelect={() => setAboutOpen(true)}>Acerca de nrvn</MenuItem>
          </MenuContent>
        </Menu>

        <fieldset
          className="zoom-controls"
          data-selection-retain="true"
          aria-label="Zoom de la página"
        >
          <IconButton
            label="Reducir zoom de página (⌘−)"
            title="Reducir zoom de página (⌘−)"
            size="sm"
            data-testid="page-zoom-out"
            disabled={pageZoom <= 50}
            onClick={() => setPageZoom(pageZoom - 10)}
          >
            <Minus size={15} aria-hidden="true" />
          </IconButton>
          <button
            type="button"
            className="zoom-level"
            data-testid="page-zoom-reset"
            aria-label={`Zoom ${pageZoom}%. Restablecer zoom de la página (⌘0)`}
            title="Restablecer zoom de la página (⌘0)"
            onClick={() => setPageZoom(100)}
          >
            {pageZoom}%
          </button>
          <IconButton
            label="Ampliar zoom de página (⌘+)"
            title="Ampliar zoom de página (⌘+)"
            size="sm"
            data-testid="page-zoom-in"
            disabled={pageZoom >= 200}
            onClick={() => setPageZoom(pageZoom + 10)}
          >
            <Plus size={15} aria-hidden="true" />
          </IconButton>
        </fieldset>

        <IconButton
          label="Mostrar u ocultar árbol (⌘\\)"
          size="sm"
          active={treeOpen}
          aria-pressed={treeOpen}
          onClick={toggleTree}
        >
          <PanelLeft size={16} aria-hidden="true" />
        </IconButton>
        <IconButton
          label="Mostrar u ocultar agente"
          size="sm"
          active={agentOpen}
          aria-pressed={agentOpen}
          onClick={toggleAgent}
        >
          <PanelRight size={16} aria-hidden="true" />
        </IconButton>

        <section className="mode-toggle" aria-label="Modo de vista">
          {documentStatus === "loading" || documentStatus === "error" ? (
            <span className="sr-only" id="mode-toggle-blocked">
              {documentStatus === "loading"
                ? "Espera a que el documento termine de cargar para cambiar de modo."
                : "No se puede cambiar de modo mientras el documento tiene un error."}
            </span>
          ) : null}
          <button
            type="button"
            className="mode-option"
            data-testid="mode-toggle-render"
            aria-pressed={mode === "render"}
            aria-describedby={
              documentStatus === "loading" || documentStatus === "error"
                ? "mode-toggle-blocked"
                : undefined
            }
            onClick={() => selectMode("render")}
          >
            Render
          </button>
          <button
            type="button"
            className="mode-option"
            data-testid="mode-toggle-markdown"
            aria-pressed={mode === "markdown"}
            aria-describedby={
              documentStatus === "loading" || documentStatus === "error"
                ? "mode-toggle-blocked"
                : undefined
            }
            onClick={() => selectMode("markdown")}
          >
            Markdown
          </button>
        </section>
      </div>
      <MetadataImportDialog />
    </header>
  );
}
