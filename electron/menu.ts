import type { MenuItemConstructorOptions } from "electron";
import type { MenuCommand } from "./types";

/** Acciones del proceso principal que el menú nativo necesita invocar. */
export interface MenuActions {
  send: (command: MenuCommand) => void;
  openHelp: () => void;
}

/**
 * Plantilla del menú nativo de nrvn. Función pura (sin `Menu` ni `app`) para
 * poder testearla: `platform` es inyectable y por defecto usa el actual.
 *
 * En macOS el menú de aplicación se llama «nrvn» y contiene About/Hide/Quit;
 * en el resto de plataformas «Salir» cierra el submenú Archivo.
 */
export function buildMenuTemplate(
  actions: MenuActions,
  platform: NodeJS.Platform = process.platform,
): MenuItemConstructorOptions[] {
  const isMac = platform === "darwin";
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: "nrvn",
      role: "appMenu",
      submenu: [
        { label: "Acerca de nrvn", click: () => actions.send("about") },
        { type: "separator" },
        { role: "hide", label: "Ocultar nrvn" },
        { role: "hideOthers", label: "Ocultar otros" },
        { role: "unhide", label: "Mostrar todo" },
        { type: "separator" },
        { role: "quit", label: "Salir de nrvn" },
      ],
    });
  }

  template.push({
    label: "Archivo",
    submenu: [
      {
        label: "Nuevo",
        accelerator: "CmdOrCtrl+N",
        click: () => actions.send("new-document"),
      },
      {
        label: "Abrir carpeta…",
        accelerator: "CmdOrCtrl+O",
        click: () => actions.send("open-folder"),
      },
      {
        label: "Reabrir reciente",
        accelerator: "Shift+CmdOrCtrl+O",
        click: () => actions.send("reopen-workspace"),
      },
      { type: "separator" },
      {
        label: "Guardar",
        accelerator: "CmdOrCtrl+S",
        click: () => actions.send("save"),
      },
      {
        label: "Guardar como…",
        accelerator: "Shift+CmdOrCtrl+S",
        click: () => actions.send("save-as"),
      },
      { type: "separator" },
      {
        label: "Exportar metadatos…",
        click: () => actions.send("export-metadata"),
      },
      {
        label: "Importar metadatos…",
        click: () => actions.send("import-metadata"),
      },
      { type: "separator" },
      {
        label: "Copiar ruta",
        click: () => actions.send("copy-path"),
      },
      {
        label: "Revelar en Finder",
        click: () => actions.send("reveal-path"),
      },
      { type: "separator" },
      {
        label: "Cerrar documento",
        accelerator: "CmdOrCtrl+W",
        click: () => actions.send("close-document"),
      },
      ...(isMac
        ? []
        : ([
            { type: "separator" },
            { role: "quit", label: "Salir" },
          ] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: "Editar",
    submenu: [
      { role: "undo", label: "Deshacer" },
      { role: "redo", label: "Rehacer" },
      { type: "separator" },
      { role: "cut", label: "Cortar" },
      { role: "copy", label: "Copiar" },
      { role: "paste", label: "Pegar" },
      {
        label: "Seleccionar todo",
        accelerator: "CmdOrCtrl+A",
        click: () => actions.send("select-all-document"),
      },
      { type: "separator" },
      {
        label: "Seleccionar documento completo",
        accelerator: "Shift+CmdOrCtrl+A",
        click: () => actions.send("select-all-document"),
      },
      {
        label: "Copiar Markdown",
        accelerator: "Shift+CmdOrCtrl+C",
        click: () => actions.send("copy-markdown"),
      },
    ],
  });

  template.push({
    label: "Ver",
    submenu: [
      {
        label: "Alternar Render/Markdown",
        accelerator: "CmdOrCtrl+E",
        click: () => actions.send("toggle-mode"),
      },
      {
        label: "Números de línea en render",
        click: () => actions.send("toggle-line-numbers"),
      },
      {
        label: "Fuente de render",
        submenu: [
          {
            label: "Lato",
            click: () => actions.send("render-font-lato"),
          },
          {
            label: "Newsreader",
            click: () => actions.send("render-font-newsreader"),
          },
          {
            label: "Sistema",
            click: () => actions.send("render-font-system"),
          },
        ],
      },
      {
        label: "Mostrar árbol",
        accelerator: "CmdOrCtrl+\\",
        click: () => actions.send("toggle-tree"),
      },
      {
        label: "Mostrar agente",
        click: () => actions.send("toggle-agent"),
      },
      { type: "separator" },
      { role: "reload", label: "Recargar" },
      { role: "forceReload", label: "Forzar recarga" },
      { role: "toggleDevTools", label: "Herramientas de desarrollo" },
      { type: "separator" },
      {
        label: "Reducir zoom de página",
        accelerator: "CmdOrCtrl+-",
        click: () => actions.send("page-zoom-out"),
      },
      {
        label: "Restablecer zoom de página",
        accelerator: "CmdOrCtrl+0",
        click: () => actions.send("page-zoom-reset"),
      },
      {
        label: "Ampliar zoom de página",
        accelerator: "CmdOrCtrl+=",
        click: () => actions.send("page-zoom-in"),
      },
      { type: "separator" },
      { role: "togglefullscreen", label: "Pantalla completa" },
    ],
  });

  template.push({
    label: "Ventana",
    submenu: [
      { role: "minimize", label: "Minimizar" },
      { role: "zoom", label: "Zoom" },
      { role: "front", label: "Traer al frente" },
    ],
  });

  template.push({
    label: "Ayuda",
    submenu: [
      {
        label: "Documentación de nrvn",
        click: () => actions.openHelp(),
      },
      { type: "separator" },
      { label: "Guía rápida", click: () => actions.send("show-onboarding") },
      { label: "Acerca de nrvn", click: () => actions.send("about") },
    ],
  });

  return template;
}
