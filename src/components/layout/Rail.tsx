import { FolderOpen, Moon, PanelLeft, PanelRight, Sun } from "lucide-react";
import { useUiStore } from "../../store/ui";
import { useWorkspaceStore } from "../../store/workspace";
import { IconButton } from "../common/IconButton";

/** Rail vertical de 56 px con acciones globales. */
export function Rail() {
  const treeOpen = useUiStore((state) => state.treeOpen);
  const agentOpen = useUiStore((state) => state.agentOpen);
  const theme = useUiStore((state) => state.theme);
  const toggleTree = useUiStore((state) => state.toggleTree);
  const toggleAgent = useUiStore((state) => state.toggleAgent);
  const setTheme = useUiStore((state) => state.setTheme);
  const openFolder = useWorkspaceStore((state) => state.openFolder);

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <nav className="rail" aria-label="Acciones principales">
      <IconButton label="Abrir carpeta (Cmd+O)" onClick={() => void openFolder()}>
        <FolderOpen size={18} aria-hidden="true" />
      </IconButton>

      <div className="rail-group">
        <IconButton
          label="Mostrar u ocultar el árbol"
          active={treeOpen}
          aria-pressed={treeOpen}
          onClick={toggleTree}
        >
          <PanelLeft size={18} aria-hidden="true" />
        </IconButton>
        <IconButton
          label="Mostrar u ocultar el agente"
          active={agentOpen}
          aria-pressed={agentOpen}
          onClick={toggleAgent}
        >
          <PanelRight size={18} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="rail-spacer" />

      <IconButton
        label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      </IconButton>
    </nav>
  );
}
