import type { Block } from "./blocks";
import type { OutlineItem } from "./markdown";

/**
 * Documento inicial de nrvn: un borrador vacío con título «Sin título» listo
 * para escribir. Al arrancar nunca se restaura el workspace anterior.
 */
export interface InitialDocument {
  localId: string;
  path: null;
  content: "";
  original: "";
  blocks: Block[];
  outline: OutlineItem[];
  dirty: false;
  saving: false;
  saveState: "saved";
  saveError: null;
  lastSavedAt: null;
  lastWriteHash: null;
  error: null;
  loadMs: null;
  status: "ready";
}

/** Identificador local nuevo para cada borrador abierto en la aplicación. */
function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `untitled-${crypto.randomUUID()}`;
  }
  return `untitled-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Crea cada vez un objeto nuevo para que Zustand no comparta referencias. */
export function initialDocument(): InitialDocument {
  return {
    localId: newLocalId(),
    path: null,
    content: "",
    original: "",
    blocks: [],
    outline: [],
    dirty: false,
    saving: false,
    saveState: "saved",
    saveError: null,
    lastSavedAt: null,
    lastWriteHash: null,
    error: null,
    loadMs: null,
    status: "ready",
  };
}
