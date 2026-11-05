import type { NrvnBridge } from "../../electron/types";
import pkg from "../../package.json";

const useMock = import.meta.env.VITE_MOCK_BRIDGE === "1";
const realBridge: NrvnBridge | undefined = useMock ? undefined : window.nrvn;

if (!useMock && !realBridge) {
  throw new Error(
    "El bridge de nrvn no está disponible: abre la app con Electron o usa VITE_MOCK_BRIDGE=1.",
  );
}

let resolved: NrvnBridge | null = realBridge ?? null;
let pending: Promise<NrvnBridge> | null = null;

/**
 * Devuelve el bridge una sola vez. En modo real (`window.nrvn`) resuelve de
 * inmediato; en modo mock carga `./mock-bridge` de forma perezosa para que los
 * fixtures no entren en el bundle de producción.
 */
export function getBridge(): Promise<NrvnBridge> {
  if (resolved !== null) return Promise.resolve(resolved);
  if (pending === null) {
    if (import.meta.env.VITE_MOCK_BRIDGE === "1") {
      pending = import("./mock-bridge").then((module) => {
        resolved = module.mockBridge;
        return module.mockBridge;
      });
    } else {
      pending = Promise.reject(
        new Error(
          "El bridge de nrvn no está disponible: abre la app con Electron o usa VITE_MOCK_BRIDGE=1.",
        ),
      );
    }
  }
  return pending;
}

/** Encadena una llamada asíncrona del bridge tras la inicialización única. */
function deferred<T>(call: (bridge: NrvnBridge) => Promise<T>): Promise<T> {
  return getBridge().then(call);
}

/**
 * Suscripción síncrona a eventos del bridge. El callback se registra cuando el
 * bridge termina de inicializarse; la función devuelta cancela antes o después.
 */
function subscribe(register: (bridge: NrvnBridge) => () => void): () => void {
  let active = true;
  let unsubscribe: (() => void) | null = null;
  void getBridge().then((bridge) => {
    if (!active) return;
    unsubscribe = register(bridge);
  });
  return () => {
    active = false;
    unsubscribe?.();
    unsubscribe = null;
  };
}

/**
 * Bridge tipado único usado por toda la UI. Mantiene la interfaz `NrvnBridge`
 * intacta y difiere la carga del mock hasta el primer uso.
 */
export const nrvn: NrvnBridge = {
  annotations: {
    load: (docKey) => deferred((bridge) => bridge.annotations.load(docKey)),
    saveComments: (docKey, comments) =>
      deferred((bridge) => bridge.annotations.saveComments(docKey, comments)),
    saveCritiques: (docKey, critiques) =>
      deferred((bridge) => bridge.annotations.saveCritiques(docKey, critiques)),
    saveBlockVersions: (docKey, versions) =>
      deferred((bridge) => bridge.annotations.saveBlockVersions(docKey, versions)),
    appendHistory: (docKey, event) =>
      deferred((bridge) => bridge.annotations.appendHistory(docKey, event)),
  },
  metadata: {
    exportDocument: (input) => deferred((bridge) => bridge.metadata.exportDocument(input)),
    pickImport: (input) => deferred((bridge) => bridge.metadata.pickImport(input)),
    applyImport: (input) => deferred((bridge) => bridge.metadata.applyImport(input)),
  },
  pending: {
    load: (docKey) => deferred((bridge) => bridge.pending.load(docKey)),
    save: (docKey, entries) => deferred((bridge) => bridge.pending.save(docKey, entries)),
  },
  workspace: {
    getLanguages: (relPath) => deferred((bridge) => bridge.workspace.getLanguages(relPath)),
    createLanguage: (relPath, lang) =>
      deferred((bridge) => bridge.workspace.createLanguage(relPath, lang)),
    syncLanguage: (relPath, lang) =>
      deferred((bridge) => bridge.workspace.syncLanguage(relPath, lang)),
    openFolder: () => deferred((bridge) => bridge.workspace.openFolder()),
    getTree: () => deferred((bridge) => bridge.workspace.getTree()),
    readDocument: (relPath) => deferred((bridge) => bridge.workspace.readDocument(relPath)),
    writeDocument: (relPath, content) =>
      deferred((bridge) => bridge.workspace.writeDocument(relPath, content)),
    saveDocumentAs: (content, sourceDocKey, resetMetadata) =>
      deferred((bridge) => bridge.workspace.saveDocumentAs(content, sourceDocKey, resetMetadata)),
    revealPath: (relPath) => deferred((bridge) => bridge.workspace.revealPath(relPath)),
    copyPath: (relPath) => deferred((bridge) => bridge.workspace.copyPath(relPath)),
    openRecent: () => deferred((bridge) => bridge.workspace.openRecent()),
    onTreeChanged: (cb) => subscribe((bridge) => bridge.workspace.onTreeChanged(cb)),
    onFileSaved: (cb) => subscribe((bridge) => bridge.workspace.onFileSaved(cb)),
  },

  settings: {
    get: () => deferred((bridge) => bridge.settings.get()),
    patch: (partial) => deferred((bridge) => bridge.settings.patch(partial)),
  },

  agent: {
    getStatus: () => deferred((bridge) => bridge.agent.getStatus()),
    connect: (mode) => deferred((bridge) => bridge.agent.connect(mode)),
    disconnect: () => deferred((bridge) => bridge.agent.disconnect()),
    refresh: () => deferred((bridge) => bridge.agent.refresh()),
    getAccount: () => deferred((bridge) => bridge.agent.getAccount()),
    listCatalog: () => deferred((bridge) => bridge.agent.listCatalog()),
    createSession: (input) => deferred((bridge) => bridge.agent.createSession(input)),
    prompt: (input) => deferred((bridge) => bridge.agent.prompt(input)),
    interrupt: (input) => deferred((bridge) => bridge.agent.interrupt(input)),
    registerSession: (input) => deferred((bridge) => bridge.agent.registerSession(input)),
    loadThread: (workspaceRoot, docKey) =>
      deferred((bridge) => bridge.agent.loadThread(workspaceRoot, docKey)),
    saveThread: (workspaceRoot, docKey, thread) =>
      deferred((bridge) => bridge.agent.saveThread(workspaceRoot, docKey, thread)),
    applyProposal: (input) => deferred((bridge) => bridge.agent.applyProposal(input)),
    applyDocument: (input) => deferred((bridge) => bridge.agent.applyDocument(input)),
    oauthStart: () => deferred((bridge) => bridge.agent.oauthStart()),
    oauthStatus: (input) => deferred((bridge) => bridge.agent.oauthStatus(input)),
    oauthCancel: (input) => deferred((bridge) => bridge.agent.oauthCancel(input)),
    onEvent: (cb) => subscribe((bridge) => bridge.agent.onEvent(cb)),
  },

  app: {
    platform: realBridge?.app.platform ?? "darwin",
    version: realBridge?.app.version ?? pkg.version,
    electronVersion: realBridge?.app.electronVersion ?? "0.0.0-mock",
    commit: realBridge?.app.commit ?? "dev",
    openExternal: (url) => deferred((bridge) => bridge.app.openExternal(url)),
    copyText: (text) => deferred((bridge) => bridge.app.copyText(text)),
  },

  onMenuCommand: (cb) => subscribe((bridge) => bridge.onMenuCommand(cb)),
};
