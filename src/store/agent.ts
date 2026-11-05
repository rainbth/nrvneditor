import { create } from "zustand";
import type {
  AgentAccount,
  AgentCatalog,
  AgentEvent,
  AgentMode,
  AgentPreset,
  AgentProposal,
  AgentSessionScope,
  AgentStatus,
  AgentThread,
  AgentThreadMessage,
  Settings,
} from "../../electron/types";
import type { ContextMode } from "../lib/agent-context";
import { contextModeFor } from "../lib/agent-context";
import {
  consumeThreadMigration,
  docKeyForDocument,
  docKeyForPath,
  ensureAgentSession,
  reconcileAgentSelection,
  threadKeyForScope,
  workspaceRootFor,
} from "../lib/agent-session";
import type { ReviewResult } from "../lib/audiences";
import { primaryReviewBlockKey, reviewerById, targetAudienceById } from "../lib/audiences";
import type { Block } from "../lib/blocks";
import { splitBlocks } from "../lib/blocks";
import { hashBlock, sha256Hex } from "../lib/hash";
import { nrvn } from "../lib/ipc";
import {
  activePreset,
  newPresetId,
  presetBehavior,
  removePreset,
  upsertPreset,
} from "../lib/presets";
import {
  agentBlockInstruction,
  buildAgentBlockPrompt,
  buildDocumentPrompt,
  buildFittingInstruction,
  buildNarrativePrompt,
  buildPrompt,
  buildReviewPrompt,
  buildVariantInstruction,
  NARRATIVE_REWRITE_LABELS,
  type NarrativeRewriteKind,
  narrativeEligibility,
} from "../lib/prompt";
import {
  buildDocumentReplacement,
  buildReplacement,
  parseDocumentProposal,
  parseProposal,
  parseReview,
  sanitizeFitting,
} from "../lib/proposal";
import { type ReviewLens, reviewLensLabel } from "../lib/review-lens";
import { headingTrailForSelection } from "../lib/sections";
import { useAnnotationsStore } from "./annotations";
import { useDocumentStore } from "./document";
import { selectedIndexes, useSelectionStore } from "./selection";
import { useUiStore } from "./ui";
import { useWorkspaceStore } from "./workspace";

export interface AgentSelection {
  blocks: Block[];
  headingTrail: string[];
  path: string | null;
  /** Por defecto se deriva: bloques>0 ? selection : document. */
  mode?: ContextMode;
  documentContent?: string;
  documentBlockCount?: number;
  instruction?: string;
  autoApplyKey?: string;
  agentBlockContext?: { before: Block | null; after: Block | null };
  review?: { audienceId: string | null; targetAudienceId?: string | null; lens?: ReviewLens };
  variantFromReview?: boolean;
  fittingFromReview?: boolean;
  narrative?: NarrativeRewriteKind;
}

export interface AgentOAuthUi {
  status: "idle" | "starting" | "pending" | "complete" | "error";
  attemptID: string | null;
  url: string | null;
  instructions: string | null;
  error: string | null;
}

export interface BlockPreview {
  blockKey: string;
  original: string;
  proposed: string;
  source: "chat" | "review" | "narrative" | "history";
  proposalId: string | null;
  versionDate?: number;
}

const IDLE_OAUTH: AgentOAuthUi = {
  status: "idle",
  attemptID: null,
  url: null,
  instructions: null,
  error: null,
};

const OAUTH_POLL_MS = 2000;
const OAUTH_MAX_MS = 300_000;

export interface AgentState {
  status: AgentStatus;
  catalog: AgentCatalog | null;
  mode: AgentMode;
  model: { providerID: string; id: string } | null;
  agent: string;
  presets: AgentPreset[];
  presetId: string | null;
  sessionScope: AgentSessionScope;
  /** Contexto activo del composer: selección de bloques o documento completo. */
  contextMode: ContextMode;
  /** Cuenta de OpenCode Console (sin credenciales). */
  account: AgentAccount | null;
  oauth: AgentOAuthUi;
  thread: AgentThread;
  /** Propuesta rechazada que se adjunta al siguiente prompt. */
  revision: AgentProposal | null;
  /** El usuario pidió cambios: la propuesta sigue visible mientras escribe. */
  revisionRequested: boolean;
  /** Última propuesta descartada, disponible para deshacer. */
  lastRejected: AgentProposal | null;
  sessionID: string | null;
  docKey: string;
  streamingText: string;
  busy: boolean;
  narrativeBusy: { kind: NarrativeRewriteKind; blockKey: string } | null;
  narrativeRewrite: (kind: NarrativeRewriteKind, index: number | null) => Promise<void>;
  /** Hay una aplicación de propuesta en curso: evita el doble apply. */
  applying: boolean;
  error: string | null;
  proposalError: { raw: string; reason: string } | null;
  promptError: string | null;
  audience: string | null;
  targetAudience: string | null;
  reviewerPickerOpen: boolean;
  review: ReviewResult | null;
  fittingReview: ReviewResult | null;
  blockPreview: BlockPreview | null;
  fittingBusy: boolean;
  fittingError: string | null;
  reviewLens: ReviewLens | null;
  reviewLensUsed: ReviewLens | null;
  pendingReview: { audience: string | null; blockKey: string } | null;
  variantFromReview: boolean;
  instruction: string;
  composerFocusToken: number;
  focusComposer: () => void;
  /** Incrementa al enviar: el panel reancla la conversación al fondo. */
  scrollRequest: number;
  hydrate: () => Promise<void>;
  connect: (mode?: AgentMode) => Promise<void>;
  disconnect: () => Promise<void>;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
  syncContextMode: () => void;
  startOAuth: () => Promise<void>;
  cancelOAuth: () => Promise<void>;
  setMode: (mode: AgentMode) => void;
  setModel: (model: { providerID: string; id: string } | null) => void;
  setAgent: (id: string) => void;
  setSessionScope: (scope: AgentSessionScope) => void;
  setPreset: (id: string | null) => void;
  savePreset: (input: {
    id?: string;
    name: string;
    agent: string | null;
    model: { providerID: string; id: string } | null;
    instruction: string;
  }) => string;
  deletePreset: (id: string) => void;
  loadForDocument: (docKey: string) => Promise<void>;
  send: (selection: AgentSelection) => Promise<void>;
  reviewWithAudience: (audienceId: string, lens?: ReviewLens) => Promise<void>;
  createVariantFromReview: () => Promise<void>;
  requestFitting: () => Promise<void>;
  previewFitting: () => void;
  acceptFittingPreview: () => void;
  discardFittingPreview: () => void;
  dismissFittingPreview: () => void;
  acceptBlockPreview: () => Promise<void>;
  rejectBlockPreview: () => void;
  requestChangesBlockPreview: () => void;
  closeBlockPreview: () => void;
  showBlockPreviewForProposal: () => void;
  previewVersion: (blockKey: string, versionId: string) => void;
  cancel: () => Promise<void>;
  acceptProposal: () => Promise<void>;
  rejectProposal: () => void;
  undoReject: () => void;
  requestChanges: () => void;
  /** Sale de «Pedir cambios» sin enviar: la propuesta vuelve a su estado normal. */
  cancelRevision: () => void;
  clearThread: () => Promise<void>;
  setInstruction: (text: string) => void;
  setAudience: (id: string | null) => void;
  openReviewerPicker: () => void;
  closeReviewerPicker: () => void;
  setTargetAudience: (id: string | null) => void;
  clearReview: () => void;
  clearProposalError: () => void;
  /** Limpia el error de operación visible (no toca el estado de conexión). */
  clearError: () => void;
  saveThreadBestEffort: () => Promise<void>;
  lastAgentBlock: { key: string } | null;
  addAgentBlock: (index: number | null) => Promise<void>;
  regenerateAgentBlock: () => Promise<void>;
}

const EMPTY_STATUS: AgentStatus = { state: "disconnected", mode: "embedded" };

interface PendingRequest {
  sessionID: string;
  mode: ContextMode;
  keys: Set<string>;
  before: Map<string, string>;
  prompt: string;
  documentBefore: string | null;
  review: { audience: string | null; lens: ReviewLens } | null;
  variantFromReview: boolean;
  reviewSnapshot: ReviewResult | null;
  fittingFromReview: boolean;
  fittingSnapshot: ReviewResult | null;
  autoApplyKey: string | null;
  narrative: NarrativeRewriteKind | null;
}

let pending: PendingRequest | null = null;
let eventUnsubscribe: (() => void) | null = null;
let hydrated = false;
let hydrating = false;
let oauthTimer: ReturnType<typeof setInterval> | null = null;
/** Identificador de la ejecución OAuth vigente: invalida polls/carreras. */
let oauthRun = 0;
/**
 * Época del hilo visible: cada `loadForDocument` la incrementa. Un turno o una
 * carga que termine después de un cambio de documento no puede publicar su
 * resultado sobre el hilo nuevo (carreras A→B→A incluidas).
 */
let threadEpoch = 0;
let sendEpoch = 0;

function clearOAuthTimer(): void {
  if (oauthTimer !== null) {
    clearInterval(oauthTimer);
    oauthTimer = null;
  }
}

function emptyThread(): AgentThread {
  return { sessionID: null, messages: [], proposal: null };
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function statusPatch(
  status: AgentStatus,
  catalog: AgentCatalog | null,
  model: { providerID: string; id: string } | null,
  account: AgentAccount | null,
): Pick<AgentState, "status" | "catalog" | "model" | "account"> {
  // En `ready` manda el catálogo/cuenta que reporta el host; en `connecting`
  // se conserva lo último bueno y en error/desconectado se limpia.
  const nextCatalog = status.catalog ?? (status.state === "ready" ? catalog : null);
  // `model: null` es una elección válida (predeterminado del catálogo): no se
  // sustituye por un valor guardado ni por el default.
  const nextModel = model;
  const nextAccount =
    status.state === "ready"
      ? (status.account ?? null)
      : status.state === "connecting"
        ? account
        : null;
  return {
    status,
    catalog: nextCatalog,
    model: nextModel,
    account: nextAccount,
  };
}

function updateLastAssistant(
  messages: AgentThreadMessage[],
  update: (message: AgentThreadMessage) => AgentThreadMessage,
): AgentThreadMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "assistant") {
      return messages.map((message, cursor) => (cursor === index ? update(message) : message));
    }
  }
  return messages;
}

/** Resume el turno de documento tras un accept real (borrador o archivo). */
function withDocumentApplied(messages: AgentThreadMessage[]): AgentThreadMessage[] {
  return updateLastAssistant(messages, (message) => ({
    ...message,
    status: "done",
    text: "Documento completo aplicado.",
  }));
}

function withLastAssistantError(
  messages: AgentThreadMessage[],
  error: string,
): AgentThreadMessage[] {
  return updateLastAssistant(messages, (message) => ({ ...message, status: "error", error }));
}

function matchesSession(event: AgentEvent, sessionID: string | null): boolean {
  if (event.sessionID === undefined) return false;
  return sessionID !== null && event.sessionID === sessionID;
}

/**
 * Un delta/error solo pertenece al turno visible si sigue activo: hay `busy`,
 * el `pending` es de esa misma sesión y el último mensaje sigue en streaming.
 * Los eventos tardíos de un turno cancelado o de un hilo ya reemplazado se
 * ignoran para no contaminar la conversación actual.
 */
function isActiveTurn(event: AgentEvent, state: AgentState): boolean {
  if (state.busy !== true || pending === null) return false;
  if (event.sessionID === undefined || pending.sessionID !== event.sessionID) return false;
  const last = state.thread.messages[state.thread.messages.length - 1];
  return last !== undefined && last.role === "assistant" && last.status === "streaming";
}

/**
 * Cierra cualquier mensaje del asistente que quedó en streaming. Evita el
 * estado eterno «Escribiendo…» cuando se desconecta, cambia de hilo o se
 * reconfigura el agente a mitad de turno.
 */
function settleStreaming(messages: AgentThreadMessage[]): AgentThreadMessage[] {
  return messages.map((message) =>
    message.role === "assistant" && message.status === "streaming"
      ? { ...message, status: "cancelled" }
      : message,
  );
}

function persistSettings(partial: Partial<Settings["agent"]>): void {
  const state = useAgentStore.getState();
  const agent = {
    mode: state.mode,
    model: state.model,
    agent: state.agent,
    presets: state.presets,
    preset: state.presetId,
    sessionScope: state.sessionScope,
    ...partial,
  };
  void nrvn.settings.patch({ agent }).catch(() => {
    // Best-effort: la preferencia sigue activa en esta sesión.
  });
}

function resolveAppliedAgentBlockKey(
  preferredKey: string,
  afterRaw: string,
  anchorKey: string | null,
): string | null {
  const doc = useDocumentStore.getState();
  const direct = doc.blocks.find((block) => block.key === preferredKey && !block.pending);
  if (direct) return direct.key;
  const anchorIndex =
    anchorKey === null ? -1 : doc.blocks.findIndex((block) => block.key === anchorKey);
  const candidates = doc.blocks.filter((block) => !block.pending && block.raw === afterRaw);
  if (candidates.length === 0) return null;
  if (anchorIndex < 0) return candidates[0].key;
  const anchorOffset = doc.blocks[anchorIndex]?.startOffset ?? -1;
  return (candidates.find((block) => block.startOffset > anchorOffset) ?? candidates[0]).key;
}

function handleAgentEvent(event: AgentEvent): void {
  const state = useAgentStore.getState();

  if (event.type === "status") {
    if (event.status === undefined) return;
    useAgentStore.setState(statusPatch(event.status, state.catalog, state.model, state.account));
    if (event.status.state === "error") {
      useAgentStore.setState({ error: event.status.reason ?? "Error de conexión con OpenCode." });
    }
    return;
  }

  if (!matchesSession(event, state.sessionID)) return;

  if (event.type === "delta") {
    if (!isActiveTurn(event, state)) return;
    const delta = event.delta ?? "";
    if (delta.length === 0) return;
    const streamingText = state.streamingText + delta;
    useAgentStore.setState({
      streamingText,
      thread: {
        ...state.thread,
        messages: updateLastAssistant(state.thread.messages, (message) => ({
          ...message,
          text: streamingText,
        })),
      },
    });
    return;
  }

  if (event.type === "done") {
    // Sin turno activo no hay nada que cerrar: un `done` tardío no toca el hilo.
    if (pending === null && !state.busy) return;
    const text = state.streamingText;
    const last = state.thread.messages[state.thread.messages.length - 1];
    if (last === undefined || last.role !== "assistant" || last.status !== "streaming") {
      pending = null;
      useAgentStore.setState({ busy: false, streamingText: "" });
      return;
    }

    let proposal: AgentProposal | null = null;
    let proposalError: { raw: string; reason: string } | null = null;
    let review: ReviewResult | null = null;
    // Texto que queda persistido en el hilo: el documento completo nunca se
    // vuelca en el chat, solo un resumen de una línea.
    let messageText: string | null = null;

    if (pending?.fittingFromReview === true) {
      const snapshot = pending.fittingSnapshot;
      const parsed = parseProposal(text, pending.keys);
      const fittingRaw = parsed.ok && parsed.blocks.length === 1 ? parsed.blocks[0]?.after : "";
      const fitting = sanitizeFitting(fittingRaw ?? "") ?? "";
      const valid = snapshot !== null && fitting.length > 0 && !fitting.includes("<<<NRVN_");
      const messages = updateLastAssistant(state.thread.messages, (message) => ({
        ...message,
        status: "done",
        text: valid ? "Sugerencia lista." : "No se pudo obtener la sugerencia.",
      }));
      pending = null;
      useAgentStore.setState({
        thread: { ...state.thread, sessionID: state.sessionID, messages, proposal: null },
        streamingText: "",
        busy: false,
        pendingReview: null,
        fittingBusy: false,
        fittingError: valid
          ? null
          : "No se pudo obtener una sugerencia válida. Inténtalo de nuevo.",
        review: valid ? { ...snapshot, fitting } : snapshot,
        reviewLensUsed: state.reviewLensUsed,
        proposalError: null,
        error: null,
      });
      void useAgentStore.getState().saveThreadBestEffort();
      if (valid) useAgentStore.getState().previewFitting();
      return;
    } else if (pending?.review != null) {
      const parsed = parseReview(text, pending.keys, pending.review.audience);
      if (parsed.ok) {
        review = parsed.review;
        messageText = "Revisión lista.";
      } else {
        proposalError = { raw: parsed.raw, reason: parsed.reason };
        messageText = "La revisión no sigue el contrato.";
      }
    } else if (pending?.mode === "document") {
      const documentBefore = pending.documentBefore ?? "";
      const parsed = parseDocumentProposal(text);
      if (!parsed.ok) {
        proposalError = { raw: parsed.raw, reason: parsed.reason };
        messageText = "La propuesta no sigue el contrato.";
      } else if (parsed.content !== null && parsed.content !== documentBefore) {
        proposal = {
          id: newId("proposal"),
          createdAt: Date.now(),
          prompt: pending?.prompt ?? "",
          kind: "document",
          blocks: [],
          document: { before: documentBefore, after: parsed.content },
          source: "chat",
        };
        messageText = "Propuesta de documento completo lista. Revísala en la tarjeta.";
      } else {
        messageText = "Sin cambios propuestos.";
      }
    } else {
      const allowed = pending?.keys ?? new Set<string>();
      const before = pending?.before ?? new Map<string, string>();
      const parsed = parseProposal(text, allowed);
      if (parsed.ok) {
        if (parsed.blocks.length === 0 && pending?.narrative != null)
          messageText =
            "El agente no propuso cambios para este bloque; ajusta la instrucción o edítalo a mano.";
        if (parsed.blocks.length > 0) {
          proposal = {
            id: newId("proposal"),
            createdAt: Date.now(),
            prompt: pending?.prompt ?? "",
            kind: "blocks",
            blocks: parsed.blocks.map((block) => ({
              key: block.key,
              before: before.get(block.key) ?? "",
              after: block.after,
            })),
            document: null,
            source: pending?.variantFromReview
              ? "review"
              : pending?.narrative
                ? "narrative"
                : "chat",
          };
        }
      } else {
        proposalError = { raw: parsed.raw, reason: parsed.reason };
      }
    }

    const messages = updateLastAssistant(state.thread.messages, (message) => ({
      ...message,
      status: "done",
      text: messageText ?? text,
    }));

    const autoApplyKey = pending?.autoApplyKey ?? null;
    const reviewLens = pending?.review?.lens ?? null;
    const singleBlock =
      proposal?.kind === "blocks" && proposal.blocks.length === 1 ? proposal.blocks[0] : null;
    const previewBlock = singleBlock
      ? useDocumentStore
          .getState()
          .blocks.find((block) => block.key === singleBlock.key && !block.pending)
      : undefined;
    const blockPreview =
      previewBlock && singleBlock
        ? {
            blockKey: singleBlock.key,
            original: singleBlock.before,
            proposed: singleBlock.after,
            source: pending?.variantFromReview
              ? ("review" as const)
              : pending?.narrative
                ? ("narrative" as const)
                : ("chat" as const),
            proposalId: proposal?.id ?? null,
          }
        : null;
    const variantFailed =
      pending?.variantFromReview === true && (proposalError !== null || proposal === null);
    const reviewSnapshot = pending?.reviewSnapshot ?? null;
    pending = null;
    useAgentStore.setState({
      thread: { ...state.thread, sessionID: state.sessionID, messages, proposal },
      blockPreview,
      streamingText: "",
      busy: false,
      narrativeBusy: null,
      pendingReview: null,
      proposalError,
      review: variantFailed ? reviewSnapshot : review,
      reviewLensUsed: variantFailed ? state.reviewLensUsed : review !== null ? reviewLens : null,
      fittingError: null,
      ...(variantFailed ? { variantFromReview: false } : {}),
      error: null,
    });
    if (variantFailed) {
      useUiStore.getState().setToast("No se pudo crear la variante; la revisión sigue disponible.");
    }
    void useAgentStore.getState().saveThreadBestEffort();
    if (
      autoApplyKey !== null &&
      proposal?.kind === "blocks" &&
      proposal.blocks.some((block) => block.key === autoApplyKey)
    ) {
      void (async () => {
        const afterRaw = proposal.blocks.find((block) => block.key === autoApplyKey)?.after ?? "";
        const anchorKey =
          useDocumentStore.getState().pending.find((entry) => entry.key === autoApplyKey)
            ?.anchorKey ?? null;
        await useAgentStore.getState().acceptProposal();
        const agent = useAgentStore.getState();
        if (agent.thread.proposal !== null || agent.error !== null) return;
        const key = resolveAppliedAgentBlockKey(autoApplyKey, afterRaw, anchorKey);
        if (key === null) return;
        useAgentStore.setState({ lastAgentBlock: { key } });
        useUiStore.getState().setToast("Bloque de agente insertado · edítalo o pide cambios");
      })();
    } else if (autoApplyKey !== null) {
      useDocumentStore.getState().requestInlineEdit(autoApplyKey, "start");
      useUiStore
        .getState()
        .setToast("El agente no insertó contenido; escribe el párrafo o reinténtalo");
    }
    return;
  }

  if (event.type === "error") {
    if (!isActiveTurn(event, state)) return;
    const message = event.message ?? "El agente devolvió un error.";
    const autoApplyKey = pending?.autoApplyKey ?? null;
    const fittingSnapshot = pending?.fittingFromReview ? pending.fittingSnapshot : null;
    pending = null;
    useAgentStore.setState({
      busy: false,
      fittingBusy: false,
      ...(fittingSnapshot !== null
        ? {
            review: fittingSnapshot,
            fittingError: "No se pudo obtener una sugerencia válida. Inténtalo de nuevo.",
            error: null,
          }
        : {}),
      streamingText: "",
      pendingReview: null,
      narrativeBusy: null,
      error: message,
      thread: {
        ...state.thread,
        messages: withLastAssistantError(state.thread.messages, message),
      },
    });
    if (autoApplyKey !== null) {
      const doc = useDocumentStore.getState();
      const isRealBlock = splitBlocks(doc.content).some((block) => block.key === autoApplyKey);
      if (isRealBlock) doc.setPendingBlock(autoApplyKey, false);
      else doc.requestInlineEdit(autoApplyKey, "start");
      useUiStore
        .getState()
        .setToast("El agente falló al generar el bloque; escribe el párrafo o reinténtalo");
    }
    void useAgentStore.getState().saveThreadBestEffort();
    if (fittingSnapshot !== null)
      useUiStore.getState().setToast("No se pudo obtener la sugerencia.");
  }
}

export const useAgentStore = create<AgentState>((set, get) => {
  const saveThreadBestEffort = async (): Promise<void> => {
    const state = get();
    const root = workspaceRootFor(useWorkspaceStore.getState().root);
    try {
      await nrvn.agent.saveThread(
        root,
        threadKeyForScope(state.sessionScope, state.docKey),
        state.thread,
      );
    } catch (reason: unknown) {
      set({ error: messageOf(reason, "No se pudo guardar la conversación.") });
    }
  };

  /** Aplica un status del bridge y reconcilia el agente con su catálogo. */
  const applyStatus = (status: AgentStatus): void => {
    const state = get();
    const patch = statusPatch(status, state.catalog, state.model, state.account);
    set(patch);
    if (status.state !== "ready") return;
    if (state.sessionID !== null) {
      void nrvn.agent.registerSession({ sessionID: state.sessionID }).catch(() => {
        // El registro de la sesión restaurada es best-effort.
      });
    }
    const runtime = status.runtime ?? "embedded";
    const agents = patch.catalog?.agents ?? [];
    const agent = reconcileAgentSelection(runtime, agents, state.agent);
    if (agent !== state.agent) {
      set({ agent });
      persistSettings({ agent });
    }

    // El modelo guardado puede no existir en el catálogo recién cargado (p. ej.
    // tras cambiar de runtime): se reconcilia al predeterminado del catálogo.
    const activeCatalog = patch.catalog;
    if (activeCatalog === null) return;
    const currentModel = patch.model;
    // Sin modelo explícito se usa el predeterminado del catálogo en runtime;
    // no se persiste una elección que el usuario no hizo.
    if (currentModel === null) return;
    const valid = activeCatalog.models.some(
      (item) => item.providerID === currentModel.providerID && item.id === currentModel.id,
    );
    if (valid) return;
    const fallback = activeCatalog.defaultModel;
    set({ model: fallback });
    persistSettings({ model: fallback });
  };

  return {
    status: EMPTY_STATUS,
    catalog: null,
    mode: "embedded",
    model: null,
    agent: "nrvn-editor",
    presets: [],
    presetId: null,
    sessionScope: "document",
    contextMode: "document",
    account: null,
    oauth: IDLE_OAUTH,
    thread: emptyThread(),
    revision: null,
    revisionRequested: false,
    lastRejected: null,
    sessionID: null,
    docKey: docKeyForPath(null),
    streamingText: "",
    busy: false,
    narrativeBusy: null,
    applying: false,
    error: null,
    proposalError: null,
    promptError: null,
    audience: null,
    targetAudience: null,
    reviewerPickerOpen: false,
    review: null,
    fittingReview: null,
    blockPreview: null,
    fittingBusy: false,
    fittingError: null,
    reviewLens: null,
    reviewLensUsed: null,
    pendingReview: null,
    variantFromReview: false,
    instruction: "",
    lastAgentBlock: null,
    composerFocusToken: 0,
    focusComposer: () => set((state) => ({ composerFocusToken: state.composerFocusToken + 1 })),
    scrollRequest: 0,
    saveThreadBestEffort,

    hydrate: async () => {
      if (eventUnsubscribe === null) {
        eventUnsubscribe = nrvn.agent.onEvent(handleAgentEvent);
      }
      if (hydrating) return;
      if (hydrated) {
        const state = get();
        if (useUiStore.getState().agentOpen && state.status.state === "disconnected") {
          await get().connect(state.mode);
        }
        return;
      }
      hydrating = true;
      hydrated = true;

      try {
        const settings = await nrvn.settings.get();
        const agentSettings = settings.agent;
        const presets = agentSettings.presets ?? [];
        const presetId =
          agentSettings.preset !== null &&
          agentSettings.preset !== undefined &&
          presets.some((preset) => preset.id === agentSettings.preset)
            ? agentSettings.preset
            : null;
        set({
          mode: agentSettings.mode,
          model: agentSettings.model,
          agent: agentSettings.agent,
          presets,
          presetId,
          sessionScope: agentSettings.sessionScope ?? "document",
        });

        if (settings.panels.agent) {
          await get().connect(agentSettings.mode);
        } else {
          const status = await nrvn.agent.getStatus();
          applyStatus(status);
        }
      } catch (reason: unknown) {
        const message = messageOf(reason, "No se pudo inicializar el agente.");
        set({
          error: message,
          status: { state: "error", mode: get().mode, reason: message },
        });
      } finally {
        hydrating = false;
      }
    },

    connect: async (modeArg) => {
      const mode = modeArg ?? get().mode;
      set({ mode, error: null, status: { state: "connecting", mode } });
      try {
        const status = await nrvn.agent.connect(mode);
        applyStatus(status);
        set({
          error: status.state === "error" ? (status.reason ?? "Sin conexión con OpenCode.") : null,
        });
      } catch (reason: unknown) {
        const message = messageOf(reason, "No se pudo conectar con OpenCode.");
        set((state) => ({
          error: message,
          status: { state: "error", mode, reason: message },
          busy: false,
          narrativeBusy: null,
          sessionID: null,
          streamingText: "",
          thread: {
            ...state.thread,
            messages: settleStreaming(state.thread.messages),
            sessionID: null,
          },
        }));
      }
    },

    disconnect: async () => {
      const mode = get().mode;
      sendEpoch += 1;
      try {
        await nrvn.agent.disconnect();
      } catch (reason: unknown) {
        set({ error: messageOf(reason, "No se pudo desconectar el agente.") });
      }
      pending = null;
      set((state) => ({
        status: { state: "disconnected", mode },
        account: null,
        sessionID: null,
        busy: false,
        narrativeBusy: null,
        streamingText: "",
        thread: {
          ...state.thread,
          messages: settleStreaming(state.thread.messages),
          sessionID: null,
        },
        review: null,
        fittingReview: null,
        blockPreview: null,
        fittingBusy: false,
        fittingError: null,
        reviewLensUsed: null,
        pendingReview: null,
        reviewerPickerOpen: false,
        variantFromReview: false,
      }));
      void saveThreadBestEffort();
    },

    retry: async () => {
      await get().connect(get().mode);
    },

    refresh: async () => {
      try {
        const status = await nrvn.agent.refresh();
        applyStatus(status);
      } catch (reason: unknown) {
        set({ error: messageOf(reason, "No se pudo actualizar el estado del agente.") });
      }
    },

    syncContextMode: () => {
      const blocks = useDocumentStore.getState().blocks;
      const indexes = selectedIndexes(useSelectionStore.getState(), blocks);
      set({ contextMode: contextModeFor(blocks, indexes) });
    },

    startOAuth: async () => {
      const run = ++oauthRun;
      clearOAuthTimer();
      set({
        oauth: { status: "starting", attemptID: null, url: null, instructions: null, error: null },
        error: null,
      });
      try {
        const start = await nrvn.agent.oauthStart();
        // El usuario canceló (o reinició) mientras el host arrancaba el device
        // flow: se descarta el intento y se cancela en el host best-effort.
        if (run !== oauthRun) {
          void nrvn.agent.oauthCancel({ attemptID: start.attemptID }).catch(() => {
            // Best-effort: la UI ya está en idle.
          });
          return;
        }
        set({
          oauth: {
            status: "pending",
            attemptID: start.attemptID,
            url: start.url,
            instructions: start.instructions,
            error: null,
          },
        });
        const deadline = Date.now() + OAUTH_MAX_MS;
        const cancelAttempt = (): void => {
          void nrvn.agent.oauthCancel({ attemptID: start.attemptID }).catch(() => {
            // Best-effort: la UI ya está en idle.
          });
        };
        const fail = (message: string): void => {
          if (run !== oauthRun) return;
          clearOAuthTimer();
          set((state) => ({
            oauth: { ...state.oauth, status: "error", error: message },
          }));
        };
        const poll = async (): Promise<void> => {
          if (run !== oauthRun) return;
          if (Date.now() > deadline) {
            fail("La autorización ha caducado. Inténtalo de nuevo.");
            return;
          }
          try {
            const result = await nrvn.agent.oauthStatus({ attemptID: start.attemptID });
            if (run !== oauthRun) {
              cancelAttempt();
              return;
            }
            if (result.status === "pending") {
              set((state) => ({ oauth: { ...state.oauth, status: "pending", error: null } }));
              return;
            }
            if (result.status === "complete") {
              clearOAuthTimer();
              const [status, account] = await Promise.all([
                nrvn.agent.refresh(),
                nrvn.agent.getAccount(),
              ]);
              if (run !== oauthRun) {
                cancelAttempt();
                return;
              }
              applyStatus(status);
              set((state) => ({
                account,
                oauth: { ...state.oauth, status: "complete", error: null },
              }));
              return;
            }
            fail(result.message ?? "No se pudo completar la autorización.");
          } catch (reason: unknown) {
            fail(messageOf(reason, "No se pudo comprobar la autorización."));
          }
        };
        oauthTimer = setInterval(() => {
          void poll();
        }, OAUTH_POLL_MS);
      } catch (reason: unknown) {
        if (run !== oauthRun) return;
        const message = messageOf(reason, "No se pudo iniciar la autorización.");
        set({
          error: message,
          oauth: {
            status: "error",
            attemptID: null,
            url: null,
            instructions: null,
            error: message,
          },
        });
      }
    },

    cancelOAuth: async () => {
      // Invalida cualquier startOAuth/poll en vuelo antes de limpiar el estado.
      oauthRun += 1;
      clearOAuthTimer();
      const attemptID = get().oauth.attemptID;
      if (attemptID !== null) {
        try {
          await nrvn.agent.oauthCancel({ attemptID });
        } catch {
          // Best-effort: la UI vuelve a idle aunque el host no responda.
        }
      }
      set({ oauth: IDLE_OAUTH });
    },

    setMode: (mode) => {
      // Un cambio de modo mientras se conecta dejaría dos conexiones en vuelo.
      if (get().status.state === "connecting") return;
      set((state) => ({
        mode,
        busy: false,
        streamingText: "",
        thread: { ...state.thread, messages: settleStreaming(state.thread.messages) },
      }));
      persistSettings({ mode });
      void (async () => {
        await get().disconnect();
        await get().connect(mode);
      })();
    },

    setModel: (model) => {
      set((state) => ({
        model,
        review: null,
        fittingReview: null,
        blockPreview: null,
        fittingBusy: false,
        fittingError: null,
        reviewLensUsed: null,
        pendingReview: null,
        variantFromReview: false,
        sessionID: null,
        revision: null,
        busy: false,
        narrativeBusy: null,
        streamingText: "",
        thread: {
          ...state.thread,
          messages: settleStreaming(state.thread.messages),
          sessionID: null,
        },
      }));
      persistSettings({ model });
      void saveThreadBestEffort();
    },

    setAgent: (agent) => {
      set((state) => ({
        agent,
        review: null,
        fittingReview: null,
        blockPreview: null,
        fittingBusy: false,
        fittingError: null,
        reviewLensUsed: null,
        pendingReview: null,
        variantFromReview: false,
        sessionID: null,
        revision: null,
        busy: false,
        narrativeBusy: null,
        streamingText: "",
        thread: {
          ...state.thread,
          messages: settleStreaming(state.thread.messages),
          sessionID: null,
        },
      }));
      persistSettings({ agent });
      void saveThreadBestEffort();
    },

    setSessionScope: (sessionScope) => {
      set({ sessionScope });
      persistSettings({ sessionScope });
      void get().loadForDocument(get().docKey);
    },

    setPreset: (id) => {
      const preset = activePreset(get().presets, id);
      set({ presetId: id });
      persistSettings({ preset: id });
      if (preset?.agent !== null && preset?.agent !== undefined && preset.agent !== get().agent)
        get().setAgent(preset.agent);
      const currentModel = get().model;
      const presetModel = preset?.model ?? null;
      const modelDiffers =
        preset !== null &&
        (presetModel === null
          ? currentModel !== null
          : currentModel === null ||
            currentModel.providerID !== presetModel.providerID ||
            currentModel.id !== presetModel.id);
      if (modelDiffers) get().setModel(presetModel);
    },

    savePreset: (input) => {
      const id = input.id ?? newPresetId();
      const preset: AgentPreset = {
        id,
        name: input.name,
        agent: input.agent,
        model: input.model,
        instruction: input.instruction,
      };
      const presets = upsertPreset(get().presets, preset);
      set({ presets, presetId: id });
      persistSettings({ presets, preset: id });
      return id;
    },

    deletePreset: (id) => {
      const presets = removePreset(get().presets, id);
      const preset = get().presetId === id ? null : get().presetId;
      set({ presets, presetId: preset });
      persistSettings({ presets, preset });
    },

    loadForDocument: async (docKey) => {
      const epoch = ++threadEpoch;
      sendEpoch += 1;
      const root = workspaceRootFor(useWorkspaceStore.getState().root);
      const previous = get();
      const previousDocKey = previous.docKey;
      const previousThread = previous.thread;
      const previousSessionID = previous.sessionID;
      const wasBusy = previous.busy;

      // «Guardar como»: solo la señal explícita migra el hilo del borrador al
      // archivo nuevo. Abrir un archivo cualquiera carga su propio hilo.
      // Un documento nuevo (Cmd+N) estrena otro localId `untitled-*` y no migra.
      const migrateThread =
        get().sessionScope === "document" &&
        consumeThreadMigration(previousDocKey, docKey) &&
        (previousThread.messages.length > 0 || previousThread.proposal !== null);
      if (migrateThread) {
        if (wasBusy && previousSessionID !== null) {
          void nrvn.agent.interrupt({ sessionID: previousSessionID }).catch(() => {
            // Best-effort: el turno viejo se cierra igualmente al migrar el hilo.
          });
        }
        const migrated: AgentThread = {
          ...previousThread,
          messages: settleStreaming(previousThread.messages),
        };
        try {
          await nrvn.agent.saveThread(
            root,
            threadKeyForScope(get().sessionScope, docKey),
            migrated,
          );
        } catch (reason: unknown) {
          // Best-effort: si el host no puede persistir, el hilo migra en memoria.
          if (epoch === threadEpoch) {
            set({ error: messageOf(reason, "No se pudo guardar la conversación del documento.") });
          }
        }
        // Otra carga (p. ej. el usuario abrió / creó otro documento) invalidó
        // esta migración: no se publica sobre el hilo vigente.
        if (epoch !== threadEpoch) return;
        pending = null;
        set({
          docKey,
          pendingReview: null,
          reviewerPickerOpen: false,
          contextMode: "document",
          thread: migrated,
          sessionID: migrated.sessionID,
          busy: false,
          narrativeBusy: null,
          streamingText: "",
          revision: null,
          review: null,
          fittingReview: null,
          blockPreview: null,
          fittingBusy: false,
          fittingError: null,
          reviewLensUsed: null,
          variantFromReview: false,
          revisionRequested: false,
          lastRejected: null,
          instruction: "",
          lastAgentBlock: null,
          proposalError: null,
          promptError: null,
        });
        if (migrated.sessionID !== null) {
          void nrvn.agent.registerSession({ sessionID: migrated.sessionID }).catch(() => {
            // Restaurar la sesión en el host es best-effort.
          });
        }
        return;
      }

      // Interrumpe el turno del documento anterior antes de cambiar de hilo:
      // sus deltas ya no pertenecen al hilo visible.
      if (wasBusy && previousSessionID !== null) {
        void nrvn.agent.interrupt({ sessionID: previousSessionID }).catch(() => {
          // Best-effort: el turno viejo se cierra igualmente al cambiar de hilo.
        });
      }
      set((state) => ({
        docKey,
        pendingReview: null,
        reviewerPickerOpen: false,
        contextMode: "document",
        streamingText: "",
        busy: false,
        narrativeBusy: null,
        revision: null,
        review: null,
        fittingReview: null,
        blockPreview: null,
        fittingBusy: false,
        fittingError: null,
        reviewLensUsed: null,
        variantFromReview: false,
        revisionRequested: false,
        lastRejected: null,
        instruction: "",
        lastAgentBlock: null,
        proposalError: null,
        promptError: null,
        thread: { ...state.thread, messages: settleStreaming(state.thread.messages) },
      }));
      // Antes de esperar el hilo nuevo se desliga el anterior: un `done` tardío
      // no puede escribir sobre la sesión recién cargada. Los mensajes se
      // conservan temporalmente hasta que llega el hilo persistido.
      pending = null;
      set({ sessionID: null, busy: false, streamingText: "" });
      try {
        const threadKey = threadKeyForScope(get().sessionScope, docKey);
        const loaded = await nrvn.agent.loadThread(root, threadKey);
        // Otra carga (o un cambio A→B→A) invalidó esta: no se publica un hilo
        // que ya no es el visible.
        if (epoch !== threadEpoch) return;
        if (get().docKey !== docKey) return;
        // Un mensaje persistido en `streaming` no debe quedar «Escribiendo…»
        // para siempre: el turno que lo generó ya no existe.
        const thread: AgentThread = { ...loaded, messages: settleStreaming(loaded.messages) };
        set({ thread, sessionID: thread.sessionID });
        if (thread.sessionID !== null) {
          void nrvn.agent.registerSession({ sessionID: thread.sessionID }).catch(() => {
            // Restaurar la sesión en el host es best-effort.
          });
        }
      } catch (reason: unknown) {
        // Otra carga posterior ya es la vigente: su error no debe ensuciarla.
        if (epoch !== threadEpoch) return;
        set({ error: messageOf(reason, "No se pudo cargar la conversación del documento.") });
      }
    },

    addAgentBlock: async (index) => {
      if (get().status.state === "disconnected") await get().hydrate();
      if (get().status.state !== "ready" && get().status.state !== "connecting") {
        await get().connect(get().mode);
      }
      const docStore = useDocumentStore.getState();
      if (get().status.state !== "ready" || get().busy) {
        docStore.insertPendingParagraph(index);
        set({
          promptError:
            get().status.state !== "ready"
              ? "El agente no está listo; se insertó un párrafo editable."
              : "El agente está respondiendo; se insertó un párrafo editable.",
        });
        setTimeout(() => get().focusComposer(), 30);
        return;
      }
      const key = docStore.insertPendingParagraph(index);
      if (!key) return;
      setTimeout(() => get().focusComposer(), 30);
      useUiStore.getState().setToast("Generando bloque de agente…");
      const blocks = useDocumentStore.getState().blocks;
      const targetIndex = blocks.findIndex((block) => block.key === key);
      const target = blocks[targetIndex];
      if (!target) return;
      const before =
        [...blocks.slice(0, targetIndex)].reverse().find((block) => !block.pending) ?? null;
      const after = blocks.slice(targetIndex + 1).find((block) => !block.pending) ?? null;
      await get().send({
        blocks: [target],
        headingTrail: target.headingPath,
        path: useDocumentStore.getState().path,
        mode: "selection",
        instruction: agentBlockInstruction(!!before, !!after),
        autoApplyKey: key,
        agentBlockContext: { before, after },
        documentContent: useDocumentStore.getState().content,
        documentBlockCount: blocks.length,
      });
    },

    regenerateAgentBlock: async () => {
      const current = get().lastAgentBlock;
      if (current === null || get().busy) {
        set({ promptError: "No se puede regenerar el bloque en este momento." });
        return;
      }
      if (get().status.state !== "ready") {
        set({ promptError: "El agente no está conectado." });
        return;
      }
      let doc = useDocumentStore.getState();
      let index = doc.blocks.findIndex((block) => block.key === current.key);
      if (index < 0) {
        set({ lastAgentBlock: null });
        useUiStore.getState().setToast("El bloque ya no existe; no se puede regenerar.");
        return;
      }
      doc.setPendingBlock(current.key, true);
      doc = useDocumentStore.getState();
      index = doc.blocks.findIndex((block) => block.key === current.key);
      const target = doc.blocks[index];
      if (!target) return;
      const before =
        [...doc.blocks.slice(0, index)].reverse().find((block) => !block.pending) ?? null;
      const after = doc.blocks.slice(index + 1).find((block) => !block.pending) ?? null;
      useUiStore.getState().setToast("Regenerando bloque de agente…");
      await get().send({
        blocks: [target],
        headingTrail: target.headingPath,
        path: doc.path,
        mode: "selection",
        instruction: agentBlockInstruction(!!before, !!after),
        autoApplyKey: target.key,
        agentBlockContext: { before, after },
        documentContent: doc.content,
        documentBlockCount: doc.blocks.length,
      });
      if (!get().busy && (get().error !== null || get().promptError !== null)) {
        useDocumentStore.getState().setPendingBlock(current.key, false);
        set({ promptError: "No se pudo regenerar el bloque." });
      }
    },

    send: async (selection) => {
      const state = get();
      const epoch = threadEpoch;
      const currentBlocks = useDocumentStore.getState().blocks;
      const selectionIndexes = selectedIndexes(useSelectionStore.getState(), currentBlocks);
      const mode: ContextMode =
        selection.mode ??
        (currentBlocks.length === 0 && selection.blocks.length > 0
          ? "selection"
          : contextModeFor(currentBlocks, selectionIndexes));

      if (mode === "selection" && selection.blocks.length === 0) {
        set({ promptError: "Selecciona al menos un bloque para trabajar." });
        return;
      }
      if (state.status.state !== "ready") {
        set({ promptError: "El agente no está conectado." });
        return;
      }
      if (state.busy) return;

      const instruction = (selection.instruction ?? state.instruction).trim();
      const narrative = selection.narrative ?? null;
      const reviewCtx = selection.review;
      const fittingFromReview = selection.fittingFromReview === true;
      const fittingSnapshot = fittingFromReview ? state.review : null;
      if (reviewCtx !== undefined && selection.blocks.length === 0) {
        set({ promptError: "Selecciona al menos un bloque para revisarlo." });
        return;
      }
      if (instruction.length === 0 && reviewCtx === undefined) {
        set({ promptError: "Escribe una instrucción para el agente." });
        return;
      }

      const docKey = docKeyForDocument(selection.path, useDocumentStore.getState().localId);
      const root = workspaceRootFor(useWorkspaceStore.getState().root);
      const before = new Map(selection.blocks.map((block) => [block.key, block.raw]));
      const allowed = new Set(selection.blocks.map((block) => block.key));
      const documentContent = selection.documentContent ?? useDocumentStore.getState().content;
      let revision: AgentProposal | null = null;
      let promptText: string;
      if (reviewCtx !== undefined) {
        promptText = buildReviewPrompt({
          path: selection.path,
          headingTrail: selection.headingTrail,
          blocks: selection.blocks.map((block) => ({
            key: block.key,
            type: block.type,
            raw: block.raw,
          })),
          audience: reviewerById(reviewCtx.audienceId),
          lens: reviewCtx.lens ?? "complete",
          targetAudience: targetAudienceById(reviewCtx.targetAudienceId ?? null),
          instruction:
            instruction ||
            (reviewCtx.lens === undefined || reviewCtx.lens === "complete"
              ? "Analiza el texto y devuelve los tres bloques."
              : `Aplica la lente «${reviewLensLabel(reviewCtx.lens)}» al texto y respeta su cobertura.`),
          behavior: presetBehavior(activePreset(state.presets, state.presetId)),
        });
      } else if (selection.autoApplyKey !== undefined) {
        const target = selection.blocks[0];
        if (!target) return;
        promptText = buildAgentBlockPrompt({
          path: selection.path,
          headingTrail: selection.headingTrail,
          target: { key: target.key, raw: target.raw },
          before: selection.agentBlockContext?.before ?? null,
          after: selection.agentBlockContext?.after ?? null,
          instruction,
          behavior: presetBehavior(activePreset(state.presets, state.presetId)),
        });
      } else if (narrative !== null) {
        const target = selection.blocks[0];
        if (!target) return;
        promptText = buildNarrativePrompt({
          path: selection.path,
          headingTrail: selection.headingTrail,
          kind: narrative,
          target: { key: target.key, raw: target.raw },
          before: selection.agentBlockContext?.before ?? null,
          after: selection.agentBlockContext?.after ?? null,
          behavior: presetBehavior(activePreset(state.presets, state.presetId)),
        });
      } else if (mode === "document") {
        revision =
          state.revision?.kind === "document" && state.revision.document !== null
            ? state.revision
            : null;
        promptText = buildDocumentPrompt({
          path: selection.path,
          content: documentContent,
          blockCount: selection.documentBlockCount ?? splitBlocks(documentContent).length,
          instruction,
          behavior: presetBehavior(activePreset(state.presets, state.presetId)),
          previousDocument: revision?.document ?? undefined,
        });
      } else {
        revision =
          state.revision?.kind !== "document" &&
          state.revision?.blocks.every((block) => allowed.has(block.key))
            ? state.revision
            : null;
        promptText = buildPrompt({
          path: selection.path,
          headingTrail: selection.headingTrail,
          blocks: selection.blocks.map((block) => ({
            key: block.key,
            type: block.type,
            raw: block.raw,
          })),
          previousProposal: revision ?? undefined,
          instruction,
          behavior: presetBehavior(activePreset(state.presets, state.presetId)),
        });
      }

      const now = Date.now();
      const userMessage: AgentThreadMessage = {
        id: newId("message"),
        role: "user",
        text:
          narrative !== null
            ? NARRATIVE_REWRITE_LABELS[narrative]
            : fittingFromReview
              ? "Sugerencia de mejora"
              : reviewCtx !== undefined
                ? "Revisión del texto"
                : instruction || "",
        createdAt: now,
        status: "done",
      };
      const assistantMessage: AgentThreadMessage = {
        id: newId("message"),
        role: "assistant",
        text: "",
        createdAt: now,
        status: "streaming",
      };

      const turn = ++sendEpoch;
      const reviewSnapshot = selection.variantFromReview === true ? state.review : null;
      set({
        docKey,
        busy: true,
        narrativeBusy:
          narrative !== null && selection.blocks[0]
            ? { kind: narrative, blockKey: selection.blocks[0].key }
            : null,
        streamingText: "",
        error: null,
        promptError: null,
        ...(fittingFromReview ? {} : { review: null }),
        fittingReview: null,
        blockPreview: null,
        ...(fittingFromReview ? {} : { reviewLensUsed: null }),
        fittingBusy: fittingFromReview,
        fittingError: null,
        pendingReview:
          reviewCtx !== undefined && selection.blocks[0]
            ? { audience: reviewCtx.audienceId, blockKey: selection.blocks[0].key }
            : null,
        variantFromReview: selection.variantFromReview ?? false,
        proposalError: null,
        instruction: "",
        revision: null,
        revisionRequested: false,
        lastRejected: null,
        scrollRequest: state.scrollRequest + 1,
        thread: {
          ...state.thread,
          messages: [...state.thread.messages, userMessage, assistantMessage],
          proposal: null,
        },
      });

      // Se conserva el objeto para limpiar `pending` sólo si sigue siendo este
      // turno: un envío posterior no debe quedar huérfano por un fallo viejo.
      let request: PendingRequest | null = null;
      try {
        const sessionID = await ensureAgentSession({
          sessionID: state.sessionID ?? state.thread.sessionID,
          directory: root,
          agent: state.agent,
          model: state.model,
          title: selection.path ?? "Borrador sin título",
        });
        request = {
          sessionID,
          mode,
          keys: new Set(before.keys()),
          before,
          prompt: promptText,
          documentBefore: mode === "document" ? documentContent : null,
          review:
            reviewCtx === undefined
              ? null
              : { audience: reviewCtx.audienceId, lens: reviewCtx.lens ?? "complete" },
          variantFromReview: selection.variantFromReview === true,
          reviewSnapshot:
            reviewSnapshot ?? (selection.variantFromReview === true ? state.review : null),
          fittingFromReview,
          fittingSnapshot,
          autoApplyKey: selection.autoApplyKey ?? null,
          narrative,
        };
        // El usuario cambió de documento (o volvió al mismo tras pasar por
        // otro) mientras se creaba la sesión: el turno ya no pertenece al hilo
        // visible. Se interrumpe y no se contamina el documento nuevo.
        if (epoch !== threadEpoch || get().docKey !== docKey || turn !== sendEpoch || !get().busy) {
          void nrvn.agent.interrupt({ sessionID }).catch(() => {
            // Best-effort: la sesión huérfana se descarta igualmente.
          });
          if (pending === request) pending = null;
          return;
        }
        set((current) => ({
          sessionID,
          thread: { ...current.thread, sessionID },
        }));
        pending = request;
        await nrvn.agent.prompt({ sessionID, text: promptText });
        void saveThreadBestEffort();
      } catch (reason: unknown) {
        // Turno caducado: su error pertenece a un hilo que ya no está visible.
        if (epoch !== threadEpoch || get().docKey !== docKey || turn !== sendEpoch || !get().busy) {
          if (request !== null && pending === request) pending = null;
          return;
        }
        const message = messageOf(reason, "No se pudo enviar la petición al agente.");
        pending = null;
        set((current) => ({
          busy: false,
          narrativeBusy: null,
          pendingReview: null,
          error: message,
          ...(fittingFromReview
            ? {
                review: fittingSnapshot,
                fittingBusy: false,
                fittingError: "No se pudo obtener una sugerencia válida. Inténtalo de nuevo.",
                error: null,
              }
            : {}),
          streamingText: "",
          ...(reviewSnapshot !== null ? { review: reviewSnapshot } : {}),
          ...(reviewSnapshot !== null ? { variantFromReview: false } : {}),
          thread: {
            ...current.thread,
            messages: withLastAssistantError(current.thread.messages, message),
          },
        }));
        if (reviewCtx !== undefined)
          useUiStore.getState().setToast("No se pudo obtener la revisión.");
        if (fittingFromReview) useUiStore.getState().setToast("No se pudo obtener la sugerencia.");
        if (reviewSnapshot !== null) {
          useUiStore
            .getState()
            .setToast("No se pudo crear la variante; la revisión sigue disponible.");
        }
        void saveThreadBestEffort();
      }
    },

    narrativeRewrite: async (kind, index) => {
      const targetIndex = index ?? -1;
      const doc = useDocumentStore.getState();
      const block = targetIndex >= 0 ? doc.blocks[targetIndex] : undefined;
      if (!block) {
        set({ promptError: "Selecciona un bloque de texto para reescribir." });
        return;
      }
      const eligibility = narrativeEligibility(block.type, block.raw, kind);
      if (!eligibility.ok) {
        set({ promptError: eligibility.reason ?? "No aplicable a este bloque." });
        return;
      }
      if (block.pending) {
        set({ promptError: "El bloque está pendiente; espera a aplicarlo." });
        return;
      }
      if (get().status.state !== "ready") {
        set({ promptError: "El agente no está conectado." });
        return;
      }
      if (get().busy) {
        set({ promptError: "El agente está respondiendo; espera a que termine." });
        return;
      }
      if (!selectedIndexes(useSelectionStore.getState(), doc.blocks).includes(targetIndex))
        useSelectionStore.getState().selectBlock(targetIndex);
      const before =
        [...doc.blocks.slice(0, targetIndex)].reverse().find((item) => !item.pending) ?? null;
      const after = doc.blocks.slice(targetIndex + 1).find((item) => !item.pending) ?? null;
      await get().send({
        blocks: [block],
        headingTrail: block.headingPath,
        path: doc.path,
        mode: "selection",
        instruction: NARRATIVE_REWRITE_LABELS[kind],
        narrative: kind,
        agentBlockContext: { before, after },
        documentContent: doc.content,
        documentBlockCount: doc.blocks.length,
      });
    },

    reviewWithAudience: async (audienceId, lens = "complete") => {
      const reviewer = reviewerById(audienceId);
      if (reviewer === null) {
        set({ promptError: "Selecciona un revisor válido." });
        return;
      }
      if (get().status.state !== "ready") {
        set({ promptError: "El agente no está conectado." });
        return;
      }
      if (get().busy) {
        set({ promptError: "El agente está respondiendo; espera a que termine." });
        return;
      }
      const blocks = useDocumentStore.getState().blocks;
      const indexes = selectedIndexes(useSelectionStore.getState(), blocks);
      if (indexes.length === 0) {
        set({ promptError: "Selecciona al menos un bloque para revisarlo." });
        return;
      }
      // El selector se cierra solo cuando la revisión va a lanzarse: cerrarlo
      // antes de validar lo hacía desaparecer sin explicar por qué.
      set({ reviewerPickerOpen: false });
      const document = useDocumentStore.getState();
      set({ audience: reviewer.id, reviewLens: lens });
      await get().send({
        blocks: indexes
          .map((index) => blocks[index])
          .filter((block): block is Block => block !== undefined),
        headingTrail: headingTrailForSelection(blocks, indexes),
        path: document.path,
        mode: "selection",
        documentContent: document.content,
        documentBlockCount: blocks.length,
        review: { audienceId: reviewer.id, targetAudienceId: get().targetAudience, lens },
      });
    },

    createVariantFromReview: async () => {
      const review = get().review;
      if (get().status.state !== "ready") {
        set({ promptError: "El agente no está conectado." });
        return;
      }
      if (get().busy) {
        set({ promptError: "El agente está respondiendo; espera a que termine." });
        return;
      }
      if (review === null) {
        set({ promptError: "No hay una revisión disponible para crear una variante." });
        return;
      }
      const doc = useDocumentStore.getState();
      const blocks = doc.blocks.filter((block) => review.blocks.includes(block.key));
      const indexes = blocks
        .map((block) => doc.blocks.findIndex((item) => item.key === block.key))
        .filter((index) => index >= 0);
      if (blocks.length === 0) {
        set({
          promptError: "Los bloques revisados ya no existen en el documento; repite la revisión.",
        });
        return;
      }
      const instruction = buildVariantInstruction(review);
      await get().send({
        blocks,
        headingTrail: headingTrailForSelection(doc.blocks, indexes),
        path: doc.path,
        mode: "selection",
        documentContent: doc.content,
        documentBlockCount: doc.blocks.length,
        instruction,
        variantFromReview: true,
      });
    },

    requestFitting: async () => {
      const state = get();
      const review = state.review;
      if (review === null) return set({ fittingError: "No hay una revisión disponible." });
      if (review.fitting !== null) return;
      if (review.blocks.length !== 1)
        return set({ fittingError: "La sugerencia requiere un solo bloque." });
      const doc = useDocumentStore.getState();
      const key = review.blocks[0];
      const block = doc.blocks.find((item) => item.key === key);
      if (!block) return set({ fittingError: "El bloque revisado ya no existe." });
      if (block.type !== "paragraph" && block.type !== "quote")
        return set({ fittingError: "La sugerencia solo está disponible para párrafos y citas." });
      if (state.status.state !== "ready")
        return set({ fittingError: "El agente no está conectado." });
      if (state.busy || state.fittingBusy) {
        set({ fittingError: "El agente está respondiendo; espera a que termine." });
        return;
      }
      const indexes = [doc.blocks.findIndex((item) => item.key === key)];
      const reviewer = reviewerById(review.audience);
      await get().send({
        blocks: [block],
        headingTrail: headingTrailForSelection(doc.blocks, indexes),
        path: doc.path,
        mode: "selection",
        documentContent: doc.content,
        documentBlockCount: doc.blocks.length,
        instruction: buildFittingInstruction({
          reviewer,
          lens: get().reviewLensUsed ?? "complete",
          problems: review.problems,
          suggestions: review.suggestions,
        }),
        fittingFromReview: true,
      });
    },

    previewFitting: () => {
      const state = get();
      const review = state.review;
      if (review === null || review.fitting === null) {
        set({
          promptError: "No hay un párrafo propuesto para este cambio.",
          fittingError: "No hay un párrafo propuesto para este cambio.",
        });
        return;
      }
      if (review.blocks.length !== 1) {
        set({
          promptError:
            "El encaje se aplica a un solo bloque. Selecciona un único párrafo y repite la revisión.",
          fittingError:
            "El encaje se aplica a un solo bloque. Selecciona un único párrafo y repite la revisión.",
        });
        return;
      }
      const key = primaryReviewBlockKey(review);
      const block = useDocumentStore.getState().blocks.find((item) => item.key === key);
      if (key === null || block === undefined) {
        set({
          promptError: "El bloque revisado ya no existe; repite la revisión.",
          fittingError: "El bloque revisado ya no existe; repite la revisión.",
        });
        return;
      }
      if (block.type !== "paragraph" && block.type !== "quote") {
        set({
          promptError:
            "El ajuste propuesto solo se aplica a párrafos y citas; selecciona un párrafo para proponerlo.",
          fittingError:
            "El ajuste propuesto solo se aplica a párrafos y citas; selecciona un párrafo para proponerlo.",
        });
        return;
      }
      set({
        blockPreview: {
          blockKey: key,
          original: block.raw,
          proposed:
            block.type === "quote"
              ? review.fitting
                  .split("\n")
                  .filter((line) => line.trim() !== "")
                  .map((line) => `> ${line}`)
                  .join("\n")
              : review.fitting,
          source: "review",
          proposalId: null,
        },
        fittingError: null,
        proposalError: null,
        error: null,
        variantFromReview: false,
        review: null,
        fittingReview: review,
      });
    },

    acceptFittingPreview: () => {
      const preview = get().blockPreview;
      const fittingReview = get().fittingReview;
      if (!preview) return;
      const doc = useDocumentStore.getState();
      const index = doc.blocks.findIndex((item) => item.key === preview.blockKey);
      if (index < 0) {
        set({
          blockPreview: null,
          fittingReview: null,
          error: "El bloque revisado ya no existe; repite la revisión.",
        });
        return;
      }
      const block = doc.blocks[index];
      if (block.raw !== preview.original) {
        set({
          blockPreview: null,
          fittingReview: null,
          error: "El bloque cambió desde la vista previa; repite la revisión.",
        });
        return;
      }
      doc.confirmInlineEdit(index, preview.proposed, "review");
      set({ blockPreview: null, review: fittingReview, fittingReview: null, error: null });
      useUiStore.getState().setToast("Cambio aplicado");
    },

    discardFittingPreview: () => {
      const { fittingReview } = get();
      set({ blockPreview: null, review: fittingReview, fittingReview: null });
    },

    dismissFittingPreview: () => set({ blockPreview: null, fittingReview: null }),

    closeBlockPreview: () => {
      const { blockPreview, fittingReview } = get();
      set({
        blockPreview: null,
        review: blockPreview?.source === "review" && fittingReview ? fittingReview : get().review,
        fittingReview: null,
      });
    },
    showBlockPreviewForProposal: () => {
      const proposal = get().thread.proposal;
      if (proposal?.kind !== "blocks" || proposal.blocks.length !== 1) return;
      const block = proposal.blocks[0];
      const target = useDocumentStore
        .getState()
        .blocks.find((item) => item.key === block.key && !item.pending);
      if (!target) return;
      set({
        blockPreview: {
          blockKey: block.key,
          original: block.before,
          proposed: block.after,
          source: "chat",
          proposalId: proposal.id,
        },
      });
    },
    acceptBlockPreview: async () => {
      const preview = get().blockPreview;
      if (!preview) return;
      const doc = useDocumentStore.getState();
      const index = doc.blocks.findIndex(
        (block) => block.key === preview.blockKey && !block.pending,
      );
      if (index < 0 || doc.blocks[index]?.raw !== preview.original) {
        set({
          blockPreview: null,
          error: "El bloque cambió desde la vista previa; repite la propuesta.",
        });
        return;
      }
      if (preview.proposalId !== null) {
        await get().acceptProposal();
        if (get().thread.proposal === null && get().error === null) {
          set({ blockPreview: null });
        } else {
          useUiStore
            .getState()
            .setToast("No se pudo aplicar la propuesta; la vista previa sigue disponible.");
        }
        return;
      }
      doc.confirmInlineEdit(index, preview.proposed, preview.source);
      if (preview.source === "review") set({ review: get().fittingReview });
      set({ blockPreview: null, fittingReview: null });
      useUiStore.getState().setToast("Cambio aplicado");
    },
    rejectBlockPreview: () => {
      const preview = get().blockPreview;
      if (!preview) return;
      const fittingReview = get().fittingReview;
      if (preview.proposalId !== null && get().thread.proposal?.id === preview.proposalId)
        get().rejectProposal();
      if (preview.source === "review") set({ review: fittingReview, fittingReview: null });
      set({ blockPreview: null });
    },
    requestChangesBlockPreview: () => {
      const preview = get().blockPreview;
      if (!preview) return;
      const blocks = useDocumentStore.getState().blocks;
      const index = blocks.findIndex((block) => block.key === preview.blockKey);
      if (index >= 0) useSelectionStore.getState().selectIndexRange(index, index);
      if (!useUiStore.getState().agentOpen) useUiStore.getState().toggleAgent();
      set({ instruction: "Sobre este bloque: " });
      get().focusComposer();
      if (preview.proposalId !== null) {
        get().requestChanges();
        set({ instruction: "Sobre este bloque: " });
      }
    },
    previewVersion: (blockKey, versionId) => {
      const version = useAnnotationsStore
        .getState()
        .blockVersions.find((item) => item.id === versionId && item.blockKey === blockKey);
      const blocks = useDocumentStore.getState().blocks;
      const index = blocks.findIndex((block) => block.key === blockKey && !block.pending);
      const block = blocks[index];
      if (!version || !block) {
        useUiStore.getState().setToast("El bloque ya no existe; no se puede comparar esa versión.");
        return;
      }
      useSelectionStore.getState().selectIndexRange(index, index);
      set({
        blockPreview: {
          blockKey,
          original: block.raw,
          proposed: version.raw,
          source: "history",
          proposalId: null,
          versionDate: version.createdAt,
        },
      });
    },

    cancel: async () => {
      const state = get();
      const fittingSnapshot = pending?.fittingFromReview ? pending.fittingSnapshot : null;
      const sessionID = state.sessionID;
      const autoApplyKey = pending?.autoApplyKey ?? null;
      const messages = updateLastAssistant(state.thread.messages, (message) =>
        message.status === "streaming" ? { ...message, status: "cancelled" } : message,
      );
      pending = null;
      sendEpoch += 1;
      set({
        busy: false,
        narrativeBusy: null,
        streamingText: "",
        pendingReview: null,
        blockPreview: null,
        fittingReview: null,
        fittingBusy: false,
        fittingError: null,
        ...(fittingSnapshot !== null ? { review: fittingSnapshot } : {}),
        thread: { ...state.thread, messages },
      });
      if (autoApplyKey !== null) {
        const doc = useDocumentStore.getState();
        if (splitBlocks(doc.content).some((block) => block.key === autoApplyKey)) {
          doc.setPendingBlock(autoApplyKey, false);
        } else {
          doc.requestInlineEdit(autoApplyKey, "start");
        }
      }
      if (sessionID !== null) {
        try {
          await nrvn.agent.interrupt({ sessionID });
        } catch (reason: unknown) {
          set({ error: messageOf(reason, "No se pudo interrumpir al agente.") });
        }
      }
      void saveThreadBestEffort();
    },

    acceptProposal: async () => {
      if (get().applying) return;
      const proposal = get().thread.proposal;
      if (proposal === null) return;
      set({ applying: true, fittingReview: null });
      const archiveAppliedProposal = (applied: AgentProposal): void => {
        if (applied.kind !== "blocks") return;
        const blocks = useDocumentStore.getState().blocks;
        const selection = useSelectionStore.getState();
        const indexes = selectedIndexes(selection, blocks);
        let targets = applied.blocks.map(
          (block) =>
            blocks.find((candidate) => !candidate.pending && candidate.key === block.key) ?? null,
        );
        if (targets.some((target) => target === null)) {
          const selectedTargets = indexes.map((index) => blocks[index]);
          const selectionMatches =
            indexes.length === applied.blocks.length &&
            applied.blocks.every(
              (block, index) => selectedTargets[index]?.raw.trim() === block.after.trim(),
            );
          targets = selectionMatches
            ? selectedTargets
            : applied.blocks.map((block) => {
                const matches = blocks.filter(
                  (candidate) => !candidate.pending && candidate.raw.trim() === block.after.trim(),
                );
                return matches.length === 1 ? matches[0] : null;
              });
        }
        applied.blocks.forEach((block, index) => {
          const target = targets[index];
          if (target)
            useAnnotationsStore
              .getState()
              .addBlockVersion(
                target.key,
                block.before,
                applied.source ?? "chat",
                target.key !== block.key ? block.key : undefined,
              );
        });
      };
      try {
        if (proposal.kind === "document" && proposal.document !== null) {
          const change = proposal.document;
          let document = useDocumentStore.getState();
          const first = buildDocumentReplacement(document.content, change.before, change.after);
          if (!first.ok) {
            set({ error: first.error });
            return;
          }

          // Borrador sin ruta: reemplazo total en memoria.
          if (document.path === null) {
            useAnnotationsStore.getState().appendHistory({
              kind: "agent-document",
              prompt: proposal.prompt,
              blocks: [
                {
                  key: "__document__",
                  beforeHash: hashBlock(change.before),
                  afterHash: hashBlock(first.content),
                },
              ],
            });
            document.setContent(first.content);
            set((state) => ({
              thread: {
                ...state.thread,
                proposal: null,
                messages: withDocumentApplied(state.thread.messages),
              },
              proposalError: null,
              error: null,
              variantFromReview: false,
            }));
            useUiStore.getState().setToast("Documento actualizado en el borrador");
            void saveThreadBestEffort();
            return;
          }

          if (document.dirty) {
            const saved = await document.save();
            if (!saved) {
              set({
                error:
                  useDocumentStore.getState().saveError ??
                  "No se pudo guardar el documento antes de aplicar.",
              });
              return;
            }
            document = useDocumentStore.getState();
          }

          const relPath = document.path;
          if (relPath === null) {
            const next = buildDocumentReplacement(document.content, change.before, change.after);
            if (!next.ok) {
              set({ error: next.error });
              return;
            }
            document.setContent(next.content);
            useAnnotationsStore.getState().appendHistory({
              kind: "agent-document",
              prompt: proposal.prompt,
              blocks: [
                {
                  key: "__document__",
                  beforeHash: hashBlock(change.before),
                  afterHash: hashBlock(next.content),
                },
              ],
            });
            set((state) => ({
              thread: {
                ...state.thread,
                proposal: null,
                messages: withDocumentApplied(state.thread.messages),
              },
              proposalError: null,
              error: null,
              variantFromReview: false,
            }));
            useUiStore.getState().setToast("Documento actualizado en el borrador");
            void saveThreadBestEffort();
            return;
          }

          const next = buildDocumentReplacement(document.content, change.before, change.after);
          if (!next.ok) {
            set({ error: next.error });
            return;
          }

          try {
            const result = await nrvn.agent.applyDocument({
              relPath,
              expectedHash: sha256Hex(document.content.replace(/\r\n/g, "\n")),
              prompt: proposal.prompt,
              content: next.content,
            });
            if (!result.ok) {
              set({ error: result.error });
              return;
            }
            await useDocumentStore.getState().reload();
            useAnnotationsStore.getState().appendHistory({
              kind: "agent-document",
              prompt: proposal.prompt,
              blocks: [
                {
                  key: "__document__",
                  beforeHash: hashBlock(change.before),
                  afterHash: hashBlock(next.content),
                },
              ],
            });
            set((state) => ({
              thread: {
                ...state.thread,
                proposal: null,
                messages: withDocumentApplied(state.thread.messages),
              },
              proposalError: null,
              error: null,
              variantFromReview: false,
            }));
            useUiStore.getState().setToast("Documento actualizado");
            void saveThreadBestEffort();
          } catch (reason: unknown) {
            set({ error: messageOf(reason, "No se pudo aplicar el documento.") });
          }
          return;
        }

        if (proposal.blocks.length === 0) return;

        const document = useDocumentStore.getState();
        const parsed = proposal.blocks.map((block) => ({ key: block.key, after: block.after }));
        const doc = useDocumentStore.getState();
        const parsedPending = proposal.blocks.map((block) => ({
          key: block.key,
          after: block.after,
        }));
        const touchesPending = parsedPending.some((item) =>
          doc.pending.some((entry) => entry.key === item.key),
        );
        if (touchesPending) {
          const handled = doc.applyPendingProposals(parsedPending);
          if (handled) {
            useAnnotationsStore.getState().appendHistory({
              kind: "agent-blocks",
              prompt: proposal.prompt,
              blocks: proposal.blocks.map((block) => ({
                key: block.key,
                beforeHash: hashBlock(block.before),
                afterHash: hashBlock(block.after),
              })),
            });
            set((state) => ({
              thread: { ...state.thread, proposal: null },
              proposalError: null,
              error: null,
              variantFromReview: false,
            }));
            useUiStore.getState().setToast("Propuesta aplicada");
            if (useDocumentStore.getState().path !== null) {
              await useDocumentStore.getState().persistPending();
              await useDocumentStore.getState().save();
            }
            void saveThreadBestEffort();
            return;
          }
        }
        const beforeByKey = new Map(proposal.blocks.map((block) => [block.key, block.before]));
        const currentBlocks = (source: typeof document) =>
          source.blocks.map((block) => ({
            key: block.key,
            startOffset: block.startOffset,
            endOffset: block.endOffset,
            raw: beforeByKey.get(block.key) ?? block.raw,
          }));
        const replacement = buildReplacement(document.content, currentBlocks(document), parsed);
        if (!replacement.ok) {
          set({ error: replacement.error });
          return;
        }

        // Borrador sin ruta: se aplica en memoria, no hay archivo que escribir.
        if (document.path === null) {
          document.setContent(replacement.content);
          useAnnotationsStore.getState().appendHistory({
            kind: "agent-blocks",
            prompt: proposal.prompt,
            blocks: proposal.blocks.map((block) => ({
              key: block.key,
              beforeHash: hashBlock(block.before),
              afterHash: hashBlock(block.after),
            })),
          });
          useDocumentStore.getState().reanchorAfterProposal(parsed);
          set((state) => ({
            thread: { ...state.thread, proposal: null },
            proposalError: null,
            error: null,
            variantFromReview: false,
          }));
          useUiStore.getState().setToast("Propuesta aplicada al borrador");
          void saveThreadBestEffort();
          return;
        }

        let current = useDocumentStore.getState();
        if (current.dirty) {
          const saved = await current.save();
          if (!saved) {
            set({
              error:
                useDocumentStore.getState().saveError ??
                "No se pudo guardar el documento antes de aplicar.",
            });
            return;
          }
          current = useDocumentStore.getState();
        }

        const relPath = current.path;
        if (relPath === null) {
          const next = buildReplacement(current.content, currentBlocks(current), parsed);
          if (!next.ok) {
            set({ error: next.error });
            return;
          }
          current.setContent(next.content);
          useAnnotationsStore.getState().appendHistory({
            kind: "agent-blocks",
            prompt: proposal.prompt,
            blocks: proposal.blocks.map((block) => ({
              key: block.key,
              beforeHash: hashBlock(block.before),
              afterHash: hashBlock(block.after),
            })),
          });
          set((state) => ({
            thread: { ...state.thread, proposal: null },
            proposalError: null,
            error: null,
            variantFromReview: false,
          }));
          useUiStore.getState().setToast("Propuesta aplicada al borrador");
          void saveThreadBestEffort();
          return;
        }

        // Se revalida contra el contenido que acaba de guardarse.
        const next = buildReplacement(current.content, currentBlocks(current), parsed);
        if (!next.ok) {
          set({ error: next.error });
          return;
        }

        try {
          const result = await nrvn.agent.applyProposal({
            relPath,
            expectedHash: sha256Hex(current.content.replace(/\r\n/g, "\n")),
            prompt: proposal.prompt,
            blocks: proposal.blocks,
          });
          if (!result.ok) {
            set({ error: result.error });
            return;
          }
          await useDocumentStore.getState().reload();
          useAnnotationsStore.getState().appendHistory({
            kind: "agent-blocks",
            prompt: proposal.prompt,
            blocks: proposal.blocks.map((block) => ({
              key: block.key,
              beforeHash: hashBlock(block.before),
              afterHash: hashBlock(block.after),
            })),
          });
          useDocumentStore.getState().reanchorAfterProposal(parsed);
          set((state) => ({
            thread: { ...state.thread, proposal: null },
            proposalError: null,
            error: null,
            variantFromReview: false,
          }));
          useUiStore.getState().setToast("Propuesta aplicada");
          void saveThreadBestEffort();
        } catch (reason: unknown) {
          set({ error: messageOf(reason, "No se pudo aplicar la propuesta.") });
        }
      } finally {
        set({ applying: false });
        if (get().thread.proposal === null) {
          archiveAppliedProposal(proposal);
          set({ blockPreview: null });
        }
      }
    },

    rejectProposal: () => {
      set((state) => {
        const rejected = state.thread.proposal;
        if (rejected === null) {
          return {
            lastRejected: null,
            revision: null,
            revisionRequested: false,
            variantFromReview: false,
          };
        }
        const messages =
          rejected.kind === "document"
            ? updateLastAssistant(state.thread.messages, (message) => ({
                ...message,
                text: "Propuesta de documento descartada.",
              }))
            : state.thread.messages;
        return {
          thread: { ...state.thread, proposal: null, messages },
          lastRejected: rejected,
          revision: null,
          revisionRequested: false,
          proposalError: null,
          error: null,
          variantFromReview: false,
          ...(state.fittingReview !== null
            ? { review: state.fittingReview, fittingReview: null }
            : {}),
        };
      });
      void saveThreadBestEffort();
    },

    undoReject: () => {
      set((state) => {
        if (state.lastRejected === null) return {};
        const lastRejected = state.lastRejected;
        const rejectedBlock =
          lastRejected.kind === "blocks" && lastRejected.blocks.length === 1
            ? lastRejected.blocks[0]
            : undefined;
        const blockBefore = rejectedBlock?.before;
        const blockAfter = rejectedBlock?.after;
        const blockExists =
          rejectedBlock !== undefined &&
          useDocumentStore
            .getState()
            .blocks.some((block) => block.key === rejectedBlock.key && !block.pending);
        const blockPreview =
          rejectedBlock !== undefined &&
          blockBefore !== undefined &&
          blockAfter !== undefined &&
          blockExists
            ? {
                blockKey: rejectedBlock.key,
                original: blockBefore,
                proposed: blockAfter,
                source: lastRejected.source ?? "chat",
                proposalId: lastRejected.id,
              }
            : null;
        // La tarjeta de documento vuelve con su resumen canónico: el mensaje
        // del assistant no puede seguir diciendo «descartada».
        const messages =
          lastRejected.kind === "document"
            ? updateLastAssistant(state.thread.messages, (message) => ({
                ...message,
                text: "Propuesta de documento completo lista. Revísala en la tarjeta.",
              }))
            : state.thread.messages;
        return {
          thread: { ...state.thread, proposal: lastRejected, messages },
          blockPreview,
          lastRejected: null,
          proposalError: null,
          error: null,
        };
      });
      void saveThreadBestEffort();
    },

    requestChanges: () => {
      set((state) => ({
        revision: state.thread.proposal,
        revisionRequested: state.thread.proposal !== null,
        proposalError: null,
        instruction: "",
        composerFocusToken: state.composerFocusToken + 1,
      }));
      void saveThreadBestEffort();
    },

    cancelRevision: () => {
      set({
        revision: null,
        revisionRequested: false,
        instruction: "",
        promptError: null,
      });
    },

    clearThread: async () => {
      const sessionID = get().sessionID;
      pending = null;
      sendEpoch += 1;
      set({
        thread: emptyThread(),
        revision: null,
        revisionRequested: false,
        lastRejected: null,
        sessionID: null,
        streamingText: "",
        busy: false,
        proposalError: null,
        promptError: null,
        error: null,
        instruction: "",
        review: null,
        pendingReview: null,
        variantFromReview: false,
        fittingReview: null,
        blockPreview: null,
        fittingBusy: false,
        fittingError: null,
      });
      if (sessionID !== null) {
        try {
          await nrvn.agent.interrupt({ sessionID });
        } catch {
          // La conversación ya se limpió localmente; el interrupt es best-effort.
        }
      }
      void saveThreadBestEffort();
    },

    setInstruction: (text) => set({ instruction: text, promptError: null }),

    setAudience: (id) => set({ audience: id, promptError: null }),
    openReviewerPicker: () => set({ reviewerPickerOpen: true, reviewLens: null }),
    closeReviewerPicker: () => set({ reviewerPickerOpen: false }),
    setTargetAudience: (id) => set({ targetAudience: id }),

    clearReview: () => {
      const wasFittingBusy = get().fittingBusy;
      if (wasFittingBusy) {
        sendEpoch += 1;
        const sessionID = get().sessionID;
        pending = null;
        if (sessionID !== null) {
          void nrvn.agent.interrupt({ sessionID }).catch(() => {});
        }
        set({ busy: false, streamingText: "", fittingBusy: false });
      }
      const current = get();
      const messages = wasFittingBusy
        ? settleStreaming(current.thread.messages)
        : current.thread.messages;
      set({
        review: null,
        fittingError: null,
        fittingBusy: false,
        fittingReview: null,
        blockPreview: null,
        reviewLensUsed: null,
        pendingReview: null,
        variantFromReview: false,
        thread: { ...current.thread, messages },
      });
      void saveThreadBestEffort();
    },

    clearProposalError: () => set({ proposalError: null }),

    clearError: () => set({ error: null }),
  };
});
