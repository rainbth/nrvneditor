import { ChevronLeft, ChevronRight } from "lucide-react";
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { springSoft } from "../../lib/motion";
import { clampAgentWidth } from "../../lib/panel-width";
import { useUiStore } from "../../store/ui";
import { AgentPanelShell } from "../agent/AgentPanelShell";
import { BlockContextMenu } from "../render/BlockContextMenu";
import { TreePanel } from "../tree/TreePanel";
import { AboutDialog } from "./AboutDialog";
import { HeaderBar } from "./HeaderBar";
import { OnboardingDialog } from "./OnboardingDialog";
import { Rail } from "./Rail";
import { TitleBar } from "./TitleBar";

export interface AppShellProps {
  /** Área central del documento (la monta `App`). */
  documentArea: ReactNode;
}

/** Shell con titlebar full-width y tres paneles colapsables bajo ella. */
export function AppShell({ documentArea }: AppShellProps) {
  const treeOpen = useUiStore((state) => state.treeOpen);
  const treeUserSet = useUiStore((state) => state.treeUserSet);
  const agentOpen = useUiStore((state) => state.agentOpen);
  const treeWidth = useUiStore((state) => state.treeWidth);
  const agentWidth = useUiStore((state) => state.agentWidth);
  const reduceMotion = useReducedMotion();
  const toggleTree = useUiStore((state) => state.toggleTree);
  const toggleAgent = useUiStore((state) => state.toggleAgent);
  const treeColumn = useMotionValue(treeOpen ? treeWidth : 0);
  const agentColumn = useMotionValue(agentOpen ? agentWidth : 0);
  const gridTemplateColumns = useMotionTemplate`var(--rail-w) ${treeColumn}px minmax(0,1fr) ${agentColumn}px`;
  const shellStyle = { "--shell-columns": gridTemplateColumns } as CSSProperties;
  const style = {
    "--tree-width": `${treeWidth}px`,
    "--agent-width": `${agentWidth}px`,
  } as CSSProperties;
  const previousOpen = useRef({ treeOpen, agentOpen });

  useEffect(() => {
    const changedOpen =
      previousOpen.current.treeOpen !== treeOpen || previousOpen.current.agentOpen !== agentOpen;
    if (changedOpen) {
      void animate(
        treeColumn,
        treeOpen ? treeWidth : 0,
        reduceMotion ? { duration: 0 } : springSoft,
      );
      void animate(
        agentColumn,
        agentOpen ? agentWidth : 0,
        reduceMotion ? { duration: 0 } : springSoft,
      );
    } else {
      treeColumn.set(treeOpen ? treeWidth : 0);
      agentColumn.set(agentOpen ? agentWidth : 0);
    }
    previousOpen.current = { treeOpen, agentOpen };
  }, [treeOpen, agentOpen, treeWidth, agentWidth, treeColumn, agentColumn, reduceMotion]);

  // Al cambiar el viewport se reclampa el ancho del agente: si la ventana se
  // estrecha, el panel no puede comerse más de la mitad del ancho disponible.
  useEffect(() => {
    const onResize = () => {
      const current = useUiStore.getState().agentWidth;
      const next = clampAgentWidth(current, window.innerWidth);
      if (next !== current) useUiStore.getState().setAgentWidth(next);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div
      className="app-shell"
      style={style}
      data-testid="app-shell"
      data-tree-open={treeOpen}
      data-tree-user={treeUserSet}
      data-agent-open={agentOpen}
    >
      <TitleBar />
      <AboutDialog />
      <OnboardingDialog />
      <BlockContextMenu>
        <motion.div className="shell-body" style={shellStyle}>
          <div className="shell-warning" role="status">
            nrvn necesita al menos 900 px de ancho para una experiencia completa.
          </div>
          <Rail />
          <TreePanel />
          <div className="center-column">
            <HeaderBar />
            {documentArea}
          </div>
          <AgentPanelShell />
          {treeOpen ? null : (
            <button
              type="button"
              className="panel-handle panel-handle-left"
              aria-label="Abrir árbol"
              title="Abrir árbol"
              onClick={() => {
                toggleTree();
                requestAnimationFrame(() => {
                  document.querySelector<HTMLElement>(".tree-header .menu-trigger")?.focus();
                });
              }}
            >
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          )}
          {agentOpen ? null : (
            <button
              type="button"
              className="panel-handle panel-handle-right"
              aria-label="Abrir agente"
              title="Abrir agente"
              onClick={() => {
                toggleAgent();
                requestAnimationFrame(() => {
                  document
                    .querySelector<HTMLElement>('[aria-controls="agent-panel-body"]')
                    ?.focus();
                });
              }}
            >
              <ChevronLeft size={12} aria-hidden="true" />
            </button>
          )}
        </motion.div>
      </BlockContextMenu>
    </div>
  );
}
