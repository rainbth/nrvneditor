import {
  ChevronDown,
  FolderOpen,
  FolderSearch,
  FolderTree,
  History,
  RefreshCw,
} from "lucide-react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TreeNode } from "../../../electron/types";
import { clampTreeOutlineRatio, treeSplitBounds } from "../../lib/panel-heights";
import { useDocumentStore } from "../../store/document";
import { MAX_TREE_WIDTH, MIN_TREE_WIDTH, useUiStore } from "../../store/ui";
import { useWorkspaceStore } from "../../store/workspace";
import { EmptyState } from "../common/EmptyState";
import { IconButton } from "../common/IconButton";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/menu";
import { OutlinePanel } from "./OutlinePanel";
import { TreeRow } from "./TreeRow";

interface FlatRow {
  node: TreeNode;
  depth: number;
}

function flatten(nodes: TreeNode[], expanded: Record<string, boolean>, depth = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.type === "dir" && expanded[node.path] === true && node.children) {
      rows.push(...flatten(node.children, expanded, depth + 1));
    }
  }
  return rows;
}

function countFiles(nodes: TreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (node.type === "file") total += 1;
    else if (node.children) total += countFiles(node.children);
  }
  return total;
}

/** Panel del árbol de archivos Markdown + outline del documento activo. */
export function TreePanel() {
  const tree = useWorkspaceStore((state) => state.tree);
  const status = useWorkspaceStore((state) => state.status);
  const error = useWorkspaceStore((state) => state.error);
  const rootName = useWorkspaceStore((state) => state.rootName);
  const expanded = useWorkspaceStore((state) => state.expanded);
  const toggleExpanded = useWorkspaceStore((state) => state.toggleExpanded);
  const openFolder = useWorkspaceStore((state) => state.openFolder);
  const refreshTree = useWorkspaceStore((state) => state.refreshTree);
  const recent = useWorkspaceStore((state) => state.recent);
  const reopenRecent = useWorkspaceStore((state) => state.reopenRecent);
  const revealWorkspace = useWorkspaceStore((state) => state.revealWorkspace);
  const openDocument = useDocumentStore((state) => state.openDocument);
  const activeDocument = useDocumentStore((state) => state.path);
  const treeOpen = useUiStore((state) => state.treeOpen);
  const treeWidth = useUiStore((state) => state.treeWidth);
  const setTreeWidth = useUiStore((state) => state.setTreeWidth);
  const treeOutline = useUiStore((state) => state.treeOutline);
  const setTreeOutlineRatio = useUiStore((state) => state.setTreeOutlineRatio);
  const splitRef = useRef<HTMLElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const availableHeight = useCallback(() => {
    const panel = splitRef.current;
    if (!panel) return 0;
    const headerHeight = panel.querySelector(".tree-header")?.getBoundingClientRect().height ?? 44;
    return panel.getBoundingClientRect().height - headerHeight - 6;
  }, []);
  useEffect(() => {
    const panel = splitRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(([entry]) => setPanelHeight(entry.contentRect.height));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const panel = splitRef.current;
    if (!panel) return;
    const headerHeight = panel.querySelector(".tree-header")?.getBoundingClientRect().height ?? 44;
    const ratio = clampTreeOutlineRatio(treeOutline, panelHeight - headerHeight - 6);
    if (Math.abs(ratio - treeOutline) > 0.001) setTreeOutlineRatio(ratio);
  }, [panelHeight, setTreeOutlineRatio, treeOutline]);
  const splitAt = useCallback(
    (clientY: number) => {
      const panel = splitRef.current;
      if (!panel || panelHeight <= 0) return;
      const bounds = panel.getBoundingClientRect();
      const headerHeight =
        panel.querySelector(".tree-header")?.getBoundingClientRect().height ?? 44;
      const available = bounds.height - headerHeight - 6;
      const ratio = (clientY - (bounds.top + headerHeight)) / available;
      setTreeOutlineRatio(clampTreeOutlineRatio(ratio, available));
    },
    [panelHeight, setTreeOutlineRatio],
  );

  const rows = useMemo(() => flatten(tree, expanded), [tree, expanded]);
  const fileCount = useMemo(() => countFiles(tree), [tree]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const registerRef = useCallback((path: string, element: HTMLDivElement | null) => {
    if (element) rowRefs.current.set(path, element);
    else rowRefs.current.delete(path);
  }, []);

  const activeIndex = useMemo(() => {
    const index = rows.findIndex((row) => row.node.path === activePath);
    return index === -1 ? 0 : index;
  }, [rows, activePath]);

  useEffect(() => {
    if (activePath === null) return;
    const element = rowRefs.current.get(activePath);
    if (element && document.activeElement !== element) element.focus();
  }, [activePath]);

  const focusIndex = useCallback(
    (index: number) => {
      if (rows.length === 0) return;
      const clamped = Math.min(Math.max(index, 0), rows.length - 1);
      setActivePath(rows[clamped].node.path);
    },
    [rows],
  );

  const openNode = useCallback(
    (node: TreeNode) => {
      if (node.type === "dir") toggleExpanded(node.path);
      else void openDocument(node.path);
    },
    [openDocument, toggleExpanded],
  );

  const onRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, node: TreeNode) => {
      const index = rows.findIndex((row) => row.node.path === node.path);
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          focusIndex(index + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          focusIndex(index - 1);
          break;
        case "Home":
          event.preventDefault();
          focusIndex(0);
          break;
        case "End":
          event.preventDefault();
          focusIndex(rows.length - 1);
          break;
        case "ArrowRight":
          event.preventDefault();
          if (node.type === "dir") {
            if (expanded[node.path] !== true) toggleExpanded(node.path);
            else if (rows[index + 1] && rows[index + 1].depth === rows[index].depth + 1) {
              focusIndex(index + 1);
            }
          }
          break;
        case "ArrowLeft": {
          event.preventDefault();
          if (node.type === "dir" && expanded[node.path] === true) {
            toggleExpanded(node.path);
            break;
          }
          for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
            if (rows[cursor].depth < rows[index].depth) {
              focusIndex(cursor);
              break;
            }
          }
          break;
        }
        case "Enter":
        case " ":
          event.preventDefault();
          openNode(node);
          break;
        default:
          break;
      }
    },
    [expanded, focusIndex, openNode, rows, toggleExpanded],
  );

  const onSeparatorPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLHRElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = treeWidth;
      const onMove = (moveEvent: PointerEvent) => {
        setTreeWidth(startWidth + (moveEvent.clientX - startX));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setTreeWidth, treeWidth],
  );

  const showSkeleton = status === "loading" && tree.length === 0;
  const showError = status === "error";
  const showEmpty = !showSkeleton && !showError && rows.length === 0;
  const headerHeight =
    splitRef.current?.querySelector(".tree-header")?.getBoundingClientRect().height ?? 44;
  const splitBounds = treeSplitBounds(panelHeight - headerHeight - 6);

  // `hr` expone implícitamente role="separator" (HTML-AAM); se omite el atributo
  // redundante para no duplicar semántica (biome/a11y/noRedundantRoles).
  const resizer = (
    <hr
      className="tree-resizer"
      aria-orientation="vertical"
      aria-label="Redimensionar panel de archivos"
      aria-valuenow={treeWidth}
      aria-valuemin={MIN_TREE_WIDTH}
      aria-valuemax={MAX_TREE_WIDTH}
      aria-valuetext={`${treeWidth} píxeles`}
      tabIndex={0}
      onPointerDown={onSeparatorPointerDown}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setTreeWidth(treeWidth - 8);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          setTreeWidth(treeWidth + 8);
        }
      }}
    />
  );

  return (
    <aside
      className="tree-panel"
      aria-label="Archivos"
      ref={splitRef}
      inert={!treeOpen || undefined}
    >
      <div className="tree-header">
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="menu-trigger"
              data-testid="menu-workspace-trigger"
              title={rootName ?? "Sin carpeta"}
              aria-label={`Workspace: ${rootName ?? "sin carpeta"}`}
            >
              <FolderTree size={14} aria-hidden="true" />
              <span className="tree-root-name">{rootName ?? "Workspace"}</span>
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon={<FolderOpen />} shortcut="⌘O" onSelect={() => void openFolder()}>
              Abrir carpeta…
            </MenuItem>
            <MenuItem
              icon={<History />}
              shortcut="⇧⌘O"
              disabled={recent === null}
              onSelect={() => void reopenRecent()}
            >
              Reabrir reciente
            </MenuItem>
            <MenuItem icon={<RefreshCw />} onSelect={() => void refreshTree()}>
              Recargar árbol
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<FolderSearch />} onSelect={() => void revealWorkspace()}>
              Revelar en Finder
            </MenuItem>
          </MenuContent>
        </Menu>
        <span className="tree-count" title={`${fileCount} archivos`}>
          {fileCount}
        </span>
        <IconButton
          label="Refrescar árbol"
          size="sm"
          onClick={() => void refreshTree()}
          disabled={status === "loading"}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="tree-scroll" style={{ flex: `${treeOutline} 1 0` }}>
        {showSkeleton ? (
          <div
            className="tree-skeleton"
            role="status"
            aria-busy="true"
            aria-label="Cargando archivos"
          >
            {[68, 84, 56, 76, 62, 82].map((width) => (
              <span key={width} className="skeleton-row" style={{ width: `${width}%` }} />
            ))}
          </div>
        ) : null}

        {showError ? (
          <EmptyState
            icon={<FolderOpen size={22} />}
            title="No se pudo leer la carpeta"
            description={error ?? undefined}
            action={
              <button
                type="button"
                className="button"
                onClick={() => (rootName ? void refreshTree() : void openFolder())}
              >
                {rootName ? "Reintentar lectura" : "Elegir carpeta"}
              </button>
            }
          />
        ) : null}

        {showEmpty ? (
          <EmptyState
            icon={<FolderOpen size={22} />}
            title="Abre una carpeta para empezar"
            description="nrvn mostrará aquí solo archivos .md y .mdx."
            action={
              <button
                type="button"
                className="button button-primary"
                onClick={() => void openFolder()}
              >
                Abrir carpeta (⌘O)
              </button>
            }
          />
        ) : null}

        {rows.length > 0 ? (
          <div
            className="tree"
            role="tree"
            aria-label="Archivos Markdown"
            aria-busy={status === "loading"}
          >
            {rows.map((row, index) => (
              <TreeRow
                key={row.node.path}
                node={row.node}
                depth={row.depth}
                index={index}
                expanded={expanded[row.node.path] === true}
                selected={activeDocument === row.node.path}
                tabIndex={index === activeIndex ? 0 : -1}
                onToggle={toggleExpanded}
                onOpen={(path) => void openDocument(path)}
                onFocus={setActivePath}
                onKeyDown={onRowKeyDown}
                registerRef={registerRef}
              />
            ))}
          </div>
        ) : null}
      </div>

      <hr
        className="tree-splitter"
        aria-orientation="horizontal"
        aria-label="Redimensionar árbol y outline"
        aria-valuenow={Math.round(treeOutline * 100)}
        aria-valuemin={Math.round(splitBounds.min * 100)}
        aria-valuemax={Math.round(splitBounds.max * 100)}
        aria-valuetext={`${Math.round(treeOutline * 100)} % (${Math.round(splitBounds.min * 100)}–${Math.round(splitBounds.max * 100)} %, mínimo 120 px por zona)`}
        title="Arrastra para redimensionar · Doble clic: 50/50 · ↑↓: ajustar"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          const move = (e: PointerEvent) => splitAt(e.clientY);
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
        onKeyDown={(event) => {
          if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const available = availableHeight();
            const bounds = treeSplitBounds(available);
            if (event.key === "Home") {
              setTreeOutlineRatio(bounds.min);
              return;
            }
            if (event.key === "End") {
              setTreeOutlineRatio(bounds.max);
              return;
            }
            const direction = event.key === "ArrowUp" ? -1 : 1;
            const pixels = event.shiftKey ? 40 : 8;
            setTreeOutlineRatio(
              clampTreeOutlineRatio(
                treeOutline + (direction * pixels) / Math.max(1, available),
                available,
              ),
            );
          }
        }}
        onDoubleClick={() => setTreeOutlineRatio(clampTreeOutlineRatio(0.5, availableHeight()))}
      />

      <div className="outline-slot" style={{ flex: `${1 - treeOutline} 1 0` }}>
        <OutlinePanel />
      </div>

      {resizer}
    </aside>
  );
}
