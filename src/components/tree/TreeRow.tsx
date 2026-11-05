import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  FolderSearch,
  Languages,
  RefreshCw,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { KeyboardEvent } from "react";
import type { TreeNode } from "../../../electron/types";
import { languageLabel } from "../../lib/languages";
import { tweenQuick } from "../../lib/motion";
import { useDocumentStore } from "../../store/document";
import { useUiStore } from "../../store/ui";
import { useWorkspaceStore } from "../../store/workspace";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";

export interface TreeRowProps {
  node: TreeNode;
  depth: number;
  /** Flattened row index used only for the mount stagger. */
  index: number;
  expanded: boolean;
  selected: boolean;
  tabIndex: number;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onFocus: (path: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, node: TreeNode) => void;
  registerRef: (path: string, element: HTMLDivElement | null) => void;
}

/** Fila del árbol con semántica `treeitem` y roving tabindex. */
export function TreeRow({
  node,
  depth,
  index,
  expanded,
  selected,
  tabIndex,
  onToggle,
  onOpen,
  onFocus,
  onKeyDown,
  registerRef,
}: TreeRowProps) {
  const reduceMotion = useReducedMotion();
  const isDir = node.type === "dir";
  const paddingLeft = 8 + depth * 14;
  const revealPath = useWorkspaceStore((state) => state.revealPath);
  const copyPath = useWorkspaceStore((state) => state.copyPath);
  const createLanguage = useWorkspaceStore((state) => state.createLanguage);
  const syncLanguage = useWorkspaceStore((state) => state.syncLanguage);
  const setToast = useUiStore((state) => state.setToast);
  const openDocumentPath = useDocumentStore((state) => state.path);
  const canonicalPath = node.canonicalPath;
  const language = node.language;

  const handleClick = () => {
    if (isDir) onToggle(node.path);
    else onOpen(node.path);
  };

  return (
    <ContextMenuRoot>
      <ContextMenuTrigger asChild>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={
            reduceMotion ? { duration: 0 } : { ...tweenQuick, delay: Math.min(index, 12) * 0.012 }
          }
          ref={(element) => registerRef(node.path, element)}
          role="treeitem"
          aria-label={
            language
              ? `${node.name}, versión ${languageLabel(language)}${node.languageStale ? " · desactualizado" : ""}`
              : undefined
          }
          aria-level={depth + 1}
          aria-selected={selected}
          aria-expanded={isDir ? expanded : undefined}
          data-type={node.type}
          data-path={node.path}
          className="tree-row"
          data-selected={selected || undefined}
          tabIndex={tabIndex}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={handleClick}
          onFocus={() => onFocus(node.path)}
          onKeyDown={(event) => onKeyDown(event, node)}
        >
          <span className="tree-chevron" aria-hidden="true">
            {isDir ? expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}
          </span>
          <span className="tree-icon" aria-hidden="true">
            {isDir ? (
              expanded ? (
                <FolderOpen size={15} />
              ) : (
                <Folder size={15} />
              )
            ) : (
              <FileText size={15} />
            )}
          </span>
          <span className="tree-name">{node.name}</span>
          {language ? (
            <span
              className="tree-language-badge"
              title={`Idioma: ${languageLabel(language)}${node.languageStale ? " · desactualizado" : ""}`}
            >
              {languageLabel(language)}
              {node.languageStale ? " ·" : ""}
            </span>
          ) : null}
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem icon={<Eye />} onSelect={handleClick}>
          Abrir
        </ContextMenuItem>
        {language && canonicalPath ? (
          <ContextMenuItem icon={<FileText />} onSelect={() => onOpen(canonicalPath)}>
            Abrir original
          </ContextMenuItem>
        ) : null}
        {language && canonicalPath ? (
          <ContextMenuItem
            icon={<RefreshCw />}
            onSelect={async () => {
              if (openDocumentPath === node.path || openDocumentPath === canonicalPath) {
                if (!window.confirm("Hay cambios sin guardar. ¿Guardar y sincronizar?")) return;
                const saved = await useDocumentStore.getState().save();
                if (!saved) {
                  setToast("No se pudo guardar antes de sincronizar");
                  return;
                }
              }
              if (
                !window.confirm(
                  `Se actualizarán los bloques cambiados de ${node.name}. Los bloques editados a mano se conservarán. ¿Continuar?`,
                )
              )
                return;
              void syncLanguage(node.path, language).then((result) =>
                setToast(
                  result.ok
                    ? `Sincronizado: ${result.changedBlocks} actualizados, ${result.protectedBlocks} protegidos`
                    : `No se pudo sincronizar: ${result.error}`,
                ),
              );
            }}
          >
            Sincronizar desde el original
          </ContextMenuItem>
        ) : null}
        {!language && node.type === "file" && /\.mdx?$/i.test(node.path)
          ? ["en", "es"].map((lang) => {
              const sibling = node.siblings?.find((item) => item.lang === lang);
              return (
                <ContextMenuItem
                  key={lang}
                  icon={<Languages />}
                  onSelect={() => {
                    if (sibling) onOpen(sibling.path);
                    else
                      void createLanguage(node.path, lang).then((result) => {
                        if (!result.ok) setToast(`No se pudo crear la copia: ${result.error}`);
                        else if (result.created) {
                          setToast(`Creado ${result.path} como copia sin traducir del original`);
                          onOpen(result.path);
                        } else setToast("La versión ya existe");
                      });
                  }}
                >
                  {sibling
                    ? `Abrir versión en ${lang === "en" ? "inglés" : "español"}`
                    : `Crear copia en ${lang === "en" ? "inglés" : "español"} (sin traducir)`}
                </ContextMenuItem>
              );
            })
          : null}
        <ContextMenuItem icon={<FolderSearch />} onSelect={() => void revealPath(node.path)}>
          Revelar en Finder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem icon={<Copy />} onSelect={() => void copyPath(node.path)}>
          Copiar ruta
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuRoot>
  );
}
