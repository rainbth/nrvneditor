import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { BrowserWindowConstructorOptions } from "electron";
import { app, BrowserWindow, Menu, shell } from "electron";
import { CHANNELS, registerIpc } from "./ipc";
import { logError, logInfo } from "./lib/logger";
import { buildMenuTemplate } from "./menu";
import { shutdownOpenCode } from "./services/opencode";
import { closeAllWatchers } from "./services/workspace";
import type { MenuCommand } from "./types";

declare const __NRVN_COMMIT__: string | undefined;

let commit = "dev";

function resolveCommit(): string {
  if (typeof __NRVN_COMMIT__ === "string" && __NRVN_COMMIT__.trim()) {
    return __NRVN_COMMIT__.trim();
  }
  const envCommit = process.env.NRVN_COMMIT?.trim();
  if (envCommit) return envCommit;
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: app.getAppPath(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "dev";
  }
}

function isAllowedExternalUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
  } catch {
    return false;
  }
}

function openExternalSafe(url: string): void {
  if (!isAllowedExternalUrl(url)) {
    logError("se bloqueó una URL externa no permitida", { url });
    return;
  }
  void shell.openExternal(url).catch((error: unknown) => {
    logError("shell.openExternal falló", {
      url,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function sendMenuCommand(win: BrowserWindow | null, command: MenuCommand): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send(CHANNELS.eventMenu, command);
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate(
    buildMenuTemplate({
      send: (command: MenuCommand) => sendMenuCommand(focusedWindow(), command),
      openHelp: () => openHelp(),
    }),
  );
}

/**
 * Abre el README de nrvn. En producción se copia a `resources/` (ver
 * electron-builder); en desarrollo se usa el del repositorio.
 */
function openHelp(): void {
  const readme = app.isPackaged
    ? join(process.resourcesPath, "README.md")
    : join(process.cwd(), "README.md");
  void shell
    .openPath(readme)
    .then((error) => {
      if (error) logError("no se pudo abrir la documentación", { readme, error });
    })
    .catch((error: unknown) => {
      logError("no se pudo abrir la documentación", {
        readme,
        message: error instanceof Error ? error.message : String(error),
      });
    });
}

function createWindow(): BrowserWindow {
  const options: BrowserWindowConstructorOptions = {
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 15 },
    backgroundColor: process.platform === "darwin" ? "rgba(0, 0, 0, 0)" : "#F2F4F5",
    ...(process.platform === "darwin"
      ? { vibrancy: "under-window" as const, visualEffectState: "followWindow" as const }
      : {}),
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      additionalArguments: [
        `--nrvn-app-version=${app.getVersion()}`,
        `--nrvn-app-commit=${commit}`,
        `--nrvn-electron-version=${process.versions.electron}`,
      ],
    },
  };
  let win: BrowserWindow;
  try {
    win = new BrowserWindow(options);
  } catch (error) {
    if (process.platform !== "darwin") throw error;
    logError("no se pudo aplicar vibrancy; se usa fondo sólido", {
      message: error instanceof Error ? error.message : String(error),
    });
    const { vibrancy: _vibrancy, visualEffectState: _visualEffectState, ...solidOptions } = options;
    win = new BrowserWindow({ ...solidOptions, backgroundColor: "#F2F4F5" });
  }

  // El menú nativo se desactiva en toda la ventana: el menú del renderer cubre documento,
  // composer e inputs para conservar el clic derecho en todas las áreas de la app.
  win.webContents.on("context-menu", (event) => {
    event.preventDefault();
  });

  win.once("ready-to-show", () => win.show());

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const isDevNavigation = devUrl !== undefined && url.startsWith(devUrl);
    if (!isDevNavigation) {
      event.preventDefault();
      openExternalSafe(url);
    }
  });

  win.webContents.on("did-fail-load", (_event, code, description) => {
    logError("el renderer no cargó", { code, description });
  });

  win.on("closed", () => {
    const id = win.id;
    // el watcher se cierra al abrir otra carpeta o al salir; aquí sólo se limpia el estado.
    logInfo("ventana cerrada", { id });
  });

  return win;
}

app.whenReady().then(() => {
  commit = resolveCommit();
  registerIpc();
  // Icono del Dock en desarrollo (en la app empaquetada lo pone el bundle).
  if (!app.isPackaged && process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(join(process.cwd(), "build/icon.png"));
    } catch (error) {
      logError("no se pudo aplicar el icono del Dock", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  Menu.setApplicationMenu(buildMenu());
  createWindow();
  logInfo("nrvn arrancado", { version: app.getVersion(), commit, platform: process.platform });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  closeAllWatchers();
  void shutdownOpenCode();
});

process.on("uncaughtException", (error) => {
  logError("excepción no capturada en main", { message: error.message });
});
