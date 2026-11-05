import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentEvent,
  DocumentPayload,
  MenuCommand,
  NrvnBridge,
  Settings,
  TreeNode,
} from "./types";

// Los nombres de canal se duplican a propósito: el preload corre en sandbox y no
// puede importar módulos de Node ni el mapa de canales del proceso principal.
const CHANNELS = {
  openFolder: "nrvn:fs:open-folder",
  getTree: "nrvn:fs:get-tree",
  readDocument: "nrvn:fs:read",
  writeDocument: "nrvn:fs:write",
  saveAs: "nrvn:fs:save-as",
  reveal: "nrvn:fs:reveal",
  copyPath: "nrvn:fs:copy-path",
  openRecent: "nrvn:fs:open-recent",
  openExternal: "nrvn:app:open-external",
  copyText: "nrvn:app:copy-text",
  settingsGet: "nrvn:settings:get",
  settingsPatch: "nrvn:settings:patch",
  agentStatus: "nrvn:agent:status",
  agentGetStatus: "nrvn:agent:get-status",
  agentConnect: "nrvn:agent:connect",
  agentDisconnect: "nrvn:agent:disconnect",
  agentListCatalog: "nrvn:agent:list-catalog",
  agentCreateSession: "nrvn:agent:create-session",
  agentPrompt: "nrvn:agent:prompt",
  agentInterrupt: "nrvn:agent:interrupt",
  agentRegisterSession: "nrvn:agent:register-session",
  agentLoadThread: "nrvn:agent:load-thread",
  agentSaveThread: "nrvn:agent:save-thread",
  agentApplyProposal: "nrvn:agent:apply-proposal",
  agentApplyDocument: "nrvn:agent:apply-document",
  agentRefresh: "nrvn:agent:refresh",
  agentGetAccount: "nrvn:agent:get-account",
  agentOauthStart: "nrvn:agent:oauth-start",
  agentOauthStatus: "nrvn:agent:oauth-status",
  agentOauthCancel: "nrvn:agent:oauth-cancel",
  eventTreeChanged: "nrvn:event:tree-changed",
  eventFileSaved: "nrvn:event:file-saved",
  eventMenu: "nrvn:event:menu",
  eventAgent: "nrvn:event:agent",
  pendingLoad: "nrvn:pending:load",
  pendingSave: "nrvn:pending:save",
  metadataExport: "nrvn:metadata:export",
  metadataPickImport: "nrvn:metadata:pick-import",
  metadataApplyImport: "nrvn:metadata:apply-import",
  languageGet: "nrvn:language:get",
  languageCreate: "nrvn:language:create",
  languageSync: "nrvn:language:sync",
  annotationsLoad: "nrvn:annotations:load",
  annotationsSaveComments: "nrvn:annotations:save-comments",
  annotationsSaveCritiques: "nrvn:annotations:save-critiques",
  annotationsSaveBlockVersions: "nrvn:annotations:save-block-versions",
  annotationsAppendHistory: "nrvn:annotations:append-history",
} as const;

function readArgument(name: string, fallback: string): string {
  const prefix = `--nrvn-${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const bridge: NrvnBridge = {
  annotations: {
    load: (docKey) => ipcRenderer.invoke(CHANNELS.annotationsLoad, docKey),
    saveComments: (docKey, comments) =>
      ipcRenderer.invoke(CHANNELS.annotationsSaveComments, { docKey, comments }),
    saveCritiques: (docKey, critiques) =>
      ipcRenderer.invoke(CHANNELS.annotationsSaveCritiques, { docKey, critiques }),
    saveBlockVersions: (docKey, versions) =>
      ipcRenderer.invoke(CHANNELS.annotationsSaveBlockVersions, { docKey, versions }),
    appendHistory: (docKey, event) =>
      ipcRenderer.invoke(CHANNELS.annotationsAppendHistory, { docKey, event }),
  },
  metadata: {
    exportDocument: (input) => ipcRenderer.invoke(CHANNELS.metadataExport, input),
    pickImport: (input) => ipcRenderer.invoke(CHANNELS.metadataPickImport, input),
    applyImport: (input) => ipcRenderer.invoke(CHANNELS.metadataApplyImport, input),
  },
  pending: {
    load: (docKey) => ipcRenderer.invoke(CHANNELS.pendingLoad, docKey),
    save: (docKey, entries) => ipcRenderer.invoke(CHANNELS.pendingSave, { docKey, entries }),
  },
  workspace: {
    getLanguages: (relPath) => ipcRenderer.invoke(CHANNELS.languageGet, { relPath }),
    createLanguage: (relPath, lang) =>
      ipcRenderer.invoke(CHANNELS.languageCreate, { relPath, lang }),
    syncLanguage: (relPath, lang) => ipcRenderer.invoke(CHANNELS.languageSync, { relPath, lang }),
    openFolder: () => ipcRenderer.invoke(CHANNELS.openFolder),
    getTree: () => ipcRenderer.invoke(CHANNELS.getTree),
    readDocument: (relPath: string): Promise<DocumentPayload> =>
      ipcRenderer.invoke(CHANNELS.readDocument, { relPath }),
    writeDocument: (relPath: string, content: string) =>
      ipcRenderer.invoke(CHANNELS.writeDocument, { relPath, content }),
    saveDocumentAs: (content, sourceDocKey, resetMetadata) =>
      ipcRenderer.invoke(CHANNELS.saveAs, { content, sourceDocKey, resetMetadata }),
    revealPath: (relPath: string | null) => ipcRenderer.invoke(CHANNELS.reveal, { relPath }),
    copyPath: (relPath: string | null) => ipcRenderer.invoke(CHANNELS.copyPath, { relPath }),
    openRecent: () => ipcRenderer.invoke(CHANNELS.openRecent),
    onTreeChanged: (cb: (tree: TreeNode[]) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, tree: TreeNode[]) => cb(tree);
      ipcRenderer.on(CHANNELS.eventTreeChanged, listener);
      return () => {
        ipcRenderer.removeListener(CHANNELS.eventTreeChanged, listener);
      };
    },
    onFileSaved: (cb: (event: { path: string; hash: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { path: string; hash: string },
      ) => cb(payload);
      ipcRenderer.on(CHANNELS.eventFileSaved, listener);
      return () => {
        ipcRenderer.removeListener(CHANNELS.eventFileSaved, listener);
      };
    },
  },
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(CHANNELS.settingsGet),
    patch: (partial: Partial<Settings>) => ipcRenderer.invoke(CHANNELS.settingsPatch, partial),
  },
  agent: {
    getStatus: () => ipcRenderer.invoke(CHANNELS.agentGetStatus),
    connect: (mode) => ipcRenderer.invoke(CHANNELS.agentConnect, mode),
    disconnect: () => ipcRenderer.invoke(CHANNELS.agentDisconnect),
    refresh: () => ipcRenderer.invoke(CHANNELS.agentRefresh),
    getAccount: () => ipcRenderer.invoke(CHANNELS.agentGetAccount),
    listCatalog: () => ipcRenderer.invoke(CHANNELS.agentListCatalog),
    createSession: (input) => ipcRenderer.invoke(CHANNELS.agentCreateSession, input),
    prompt: (input) => ipcRenderer.invoke(CHANNELS.agentPrompt, input),
    interrupt: (input) => ipcRenderer.invoke(CHANNELS.agentInterrupt, input),
    registerSession: (input) => ipcRenderer.invoke(CHANNELS.agentRegisterSession, input),
    loadThread: (workspaceRoot, docKey) =>
      ipcRenderer.invoke(CHANNELS.agentLoadThread, { workspaceRoot, docKey }),
    saveThread: (workspaceRoot, docKey, thread) =>
      ipcRenderer.invoke(CHANNELS.agentSaveThread, { workspaceRoot, docKey, thread }),
    applyProposal: (input) => ipcRenderer.invoke(CHANNELS.agentApplyProposal, input),
    applyDocument: (input) => ipcRenderer.invoke(CHANNELS.agentApplyDocument, input),
    oauthStart: () => ipcRenderer.invoke(CHANNELS.agentOauthStart),
    oauthStatus: (input) => ipcRenderer.invoke(CHANNELS.agentOauthStatus, input),
    oauthCancel: (input) => ipcRenderer.invoke(CHANNELS.agentOauthCancel, input),
    onEvent: (cb: (event: AgentEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: AgentEvent) => cb(payload);
      ipcRenderer.on(CHANNELS.eventAgent, listener);
      return () => {
        ipcRenderer.removeListener(CHANNELS.eventAgent, listener);
      };
    },
  },
  app: {
    platform: process.platform,
    version: readArgument("app-version", "0.0.0"),
    commit: readArgument("app-commit", "dev"),
    electronVersion: readArgument("electron-version", process.versions.electron ?? "desconocido"),
    openExternal: (url: string) => ipcRenderer.invoke(CHANNELS.openExternal, url),
    copyText: (text: string) => ipcRenderer.invoke(CHANNELS.copyText, text),
  },
  onMenuCommand: (cb: (cmd: MenuCommand) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, cmd: MenuCommand) => cb(cmd);
    ipcRenderer.on(CHANNELS.eventMenu, listener);
    return () => {
      ipcRenderer.removeListener(CHANNELS.eventMenu, listener);
    };
  },
};

contextBridge.exposeInMainWorld("nrvn", bridge);
