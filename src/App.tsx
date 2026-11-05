import { useEffect } from "react";
import { DocumentView } from "./components/document/DocumentView";
import { AppShell } from "./components/layout/AppShell";
import { runCommand } from "./lib/commands";
import { nrvn } from "./lib/ipc";
import { clampAgentWidth } from "./lib/panel-width";
import { clampPageZoom, MAX_TREE_WIDTH, MIN_TREE_WIDTH, useUiStore } from "./store/ui";
import { useWorkspaceStore } from "./store/workspace";

/**
 * Arranque: aplica tema y preferencias de layout. Nunca restaura la carpeta
 * reciente como workspace ni carga el árbol; el documento inicial es un
 * borrador vacío («Sin título») creado por el store.
 */
function hydrateUi(): void {
  void nrvn.settings
    .get()
    .then((settings) => {
      useUiStore.setState({
        theme: settings.theme,
        onboardingOpen: !settings.onboarding.done,
        onboardingDone: settings.onboarding.done,
        treeOpen: window.innerWidth < 1024 ? false : settings.panels.tree,
        treeWidth: Math.min(
          MAX_TREE_WIDTH,
          Math.max(MIN_TREE_WIDTH, Math.round(settings.panelWidths.tree)),
        ),
        agentWidth: clampAgentWidth(settings.panelWidths.agent, window.innerWidth),
        agentOpen: settings.panels.agent,
        renderFont: settings.render.font,
        lineNumbers: settings.render.lineNumbers,
        pageSize: settings.render.pageSize,
        pageZoom: clampPageZoom(settings.render.zoom),
        treeOutline: settings.panelHeights.treeOutline,
      });
      useUiStore.getState().applyTheme();
      useUiStore.getState().applyRenderFont();
      useWorkspaceStore.getState().setRecent(settings.recentWorkspace);
    })
    .catch(() => {
      useUiStore.getState().applyTheme();
      useUiStore.getState().applyRenderFont();
    });
}

export function App() {
  useEffect(() => {
    hydrateUi();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = () => {
      if (useUiStore.getState().theme === "system") useUiStore.getState().applyTheme();
    };
    media.addEventListener("change", onSchemeChange);

    const offTree = nrvn.workspace.onTreeChanged((tree) => {
      useWorkspaceStore.getState().setTree(tree);
    });

    const offMenu = nrvn.onMenuCommand((command) => {
      runCommand(command);
    });

    return () => {
      media.removeEventListener("change", onSchemeChange);
      offTree();
      offMenu();
    };
  }, []);

  return <AppShell documentArea={<DocumentView />} />;
}
