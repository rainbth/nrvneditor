import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { buildMenuTemplate, type MenuActions } from "../../electron/menu";

type Item = MenuItemConstructorOptions;

function createActions(): MenuActions {
  return {
    send: vi.fn(),
    openHelp: vi.fn(),
  };
}

function itemsOf(item: Item): Item[] {
  if (!Array.isArray(item.submenu)) throw new Error(`El menú ${item.label} no tiene submenú`);
  return item.submenu as Item[];
}

function findTopLevel(template: Item[], label: string): Item {
  const found = template.find((item) => item.label === label);
  if (!found) throw new Error(`No existe el menú ${label}`);
  return found;
}

function fileItems(template: Item[]): Item[] {
  return itemsOf(findTopLevel(template, "Archivo"));
}

function click(item: Item): void {
  const handler = item.click as unknown as (() => void) | undefined;
  if (!handler) throw new Error(`El ítem ${item.label} no tiene click`);
  handler();
}

describe("buildMenuTemplate", () => {
  it("en darwin hay 6 menús raíz con los labels esperados", () => {
    const template = buildMenuTemplate(createActions(), "darwin");
    expect(template.map((item) => item.label)).toEqual([
      "nrvn",
      "Archivo",
      "Editar",
      "Ver",
      "Ventana",
      "Ayuda",
    ]);
  });

  it("Archivo contiene los comandos de documento con sus aceleradores", () => {
    const items = fileItems(buildMenuTemplate(createActions(), "darwin"));
    const labels = items.filter((item) => item.type !== "separator").map((item) => item.label);
    expect(labels).toEqual([
      "Nuevo",
      "Abrir carpeta…",
      "Reabrir reciente",
      "Guardar",
      "Guardar como…",
      "Exportar metadatos…",
      "Importar metadatos…",
      "Copiar ruta",
      "Revelar en Finder",
      "Cerrar documento",
    ]);

    const accelerators = new Map(
      items.filter((item) => item.accelerator).map((item) => [item.label, item.accelerator]),
    );
    expect(accelerators.get("Nuevo")).toBe("CmdOrCtrl+N");
    expect(accelerators.get("Abrir carpeta…")).toBe("CmdOrCtrl+O");
    expect(accelerators.get("Guardar")).toBe("CmdOrCtrl+S");
    expect(accelerators.get("Guardar como…")).toBe("Shift+CmdOrCtrl+S");
    expect(accelerators.get("Reabrir reciente")).toBe("Shift+CmdOrCtrl+O");
    expect(accelerators.get("Cerrar documento")).toBe("CmdOrCtrl+W");
  });

  it("exportar e importar metadatos delegan en sus comandos", () => {
    const actions = createActions();
    const items = fileItems(buildMenuTemplate(actions, "darwin"));
    for (const [label, command] of [
      ["Exportar metadatos…", "export-metadata"],
      ["Importar metadatos…", "import-metadata"],
    ] as const) {
      const item = items.find((entry) => entry.label === label);
      if (!item) throw new Error(`Falta ${label}`);
      click(item);
      expect(actions.send).toHaveBeenLastCalledWith(command);
    }
    expect(actions.send).toHaveBeenCalledTimes(2);
  });

  it('"Abrir carpeta…" delega en send("open-folder") exactamente una vez', () => {
    const actions = createActions();
    const items = fileItems(buildMenuTemplate(actions, "darwin"));
    const openFolder = items.find((item) => item.label === "Abrir carpeta…");
    if (!openFolder) throw new Error("Falta Abrir carpeta…");

    click(openFolder);

    expect(actions.send).toHaveBeenCalledTimes(1);
    expect(actions.send).toHaveBeenCalledWith("open-folder");
  });

  it("el menú Editar no delega en role selectAll y usa CmdOrCtrl+A propio", () => {
    const actions = createActions();
    const template = buildMenuTemplate(actions, "darwin");
    const items = itemsOf(findTopLevel(template, "Editar"));
    expect(items.some((item) => item.role === "selectAll")).toBe(false);

    const selectAll = items.find((item) => item.label === "Seleccionar todo");
    if (!selectAll) throw new Error("Falta Seleccionar todo");
    expect(selectAll.accelerator).toBe("CmdOrCtrl+A");
    expect(selectAll.role).toBeUndefined();

    click(selectAll);
    expect(actions.send).toHaveBeenCalledTimes(1);
    expect(actions.send).toHaveBeenCalledWith("select-all-document");
  });

  it("Ver usa comandos propios para el zoom de página y sus aceleradores", () => {
    const actions = createActions();
    const items = itemsOf(findTopLevel(buildMenuTemplate(actions, "darwin"), "Ver"));
    const expected = [
      ["Reducir zoom de página", "CmdOrCtrl+-", "page-zoom-out"],
      ["Restablecer zoom de página", "CmdOrCtrl+0", "page-zoom-reset"],
      ["Ampliar zoom de página", "CmdOrCtrl+=", "page-zoom-in"],
    ] as const;
    for (const [label, accelerator, command] of expected) {
      const item = items.find((entry) => entry.label === label);
      expect(item?.accelerator).toBe(accelerator);
      expect(item?.role).toBeUndefined();
      if (item) click(item);
      expect(actions.send).toHaveBeenLastCalledWith(command);
    }
  });

  it('"Nuevo" delega en send("new-document")', () => {
    const actions = createActions();
    const items = fileItems(buildMenuTemplate(actions, "darwin"));
    const nuevo = items.find((item) => item.label === "Nuevo");
    if (!nuevo) throw new Error("Falta Nuevo");

    click(nuevo);

    expect(actions.send).toHaveBeenCalledTimes(1);
    expect(actions.send).toHaveBeenCalledWith("new-document");
  });

  it("en linux no hay menú nrvn y Archivo termina con Salir", () => {
    const template = buildMenuTemplate(createActions(), "linux");
    expect(template.map((item) => item.label)).not.toContain("nrvn");

    const items = fileItems(template);
    expect(items[items.length - 1].label).toBe("Salir");
  });
});
