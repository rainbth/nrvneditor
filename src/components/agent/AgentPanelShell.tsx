import {
  AlertTriangle,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AgentConnectionState } from "../../../electron/types";
import { contextModeFor } from "../../lib/agent-context";
import { docKeyForDocument } from "../../lib/agent-session";
import {
  clampAgentWidth,
  DEFAULT_AGENT_WIDTH,
  MAX_AGENT_WIDTH,
  MIN_AGENT_WIDTH,
} from "../../lib/panel-width";
import { useAgentStore } from "../../store/agent";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";
import { useUiStore } from "../../store/ui";
import { IconButton } from "../common/IconButton";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { AgentComposer } from "./AgentComposer";
import { AgentMessage, cleanAssistantText } from "./AgentMessage";
import { AudienceChip } from "./AudienceChip";
import { ConnectionDialog } from "./ConnectionDialog";
import { ProposalCard, ProposalErrorCard } from "./ProposalCard";
import { ReviewCard } from "./ReviewCard";
import { SelectionContextCard } from "./SelectionContextCard";

const STATUS_LABEL: Record<AgentConnectionState, string> = {
  connecting: "Conectando…",
  ready: "OpenCode conectado",
  error: "Sin conexión",
  disconnected: "Desconectado",
};

/** Panel de agente completo: conexión, catálogo, chat, propuesta y composer. */
export function AgentPanelShell() {
  const agentOpen = useUiStore((state) => state.agentOpen);
  const agentWidth = useUiStore((state) => state.agentWidth);
  const viewMode = useUiStore((state) => state.mode);
  const toggleAgent = useUiStore((state) => state.toggleAgent);
  const setAgentWidth = useUiStore((state) => state.setAgentWidth);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const settingsTriggerRef = useRef<HTMLElement | null>(null);

  const status = useAgentStore((state) => state.status);
  const mode = useAgentStore((state) => state.mode);
  const error = useAgentStore((state) => state.error);
  const busy = useAgentStore((state) => state.busy);
  const streamingText = useAgentStore((state) => state.streamingText);
  const thread = useAgentStore((state) => state.thread);
  const proposalError = useAgentStore((state) => state.proposalError);
  const revisionRequested = useAgentStore((state) => state.revisionRequested);
  const variantFromReview = useAgentStore((state) => state.variantFromReview);
  const lastRejected = useAgentStore((state) => state.lastRejected);
  const hydrate = useAgentStore((state) => state.hydrate);
  const retry = useAgentStore((state) => state.retry);
  const setMode = useAgentStore((state) => state.setMode);
  const clearThread = useAgentStore((state) => state.clearThread);
  const loadForDocument = useAgentStore((state) => state.loadForDocument);
  const scrollRequest = useAgentStore((state) => state.scrollRequest);
  const threadDocKey = useAgentStore((state) => state.docKey);
  const undoReject = useAgentStore((state) => state.undoReject);
  const syncContextMode = useAgentStore((state) => state.syncContextMode);
  const clearError = useAgentStore((state) => state.clearError);
  const lastAgentBlock = useAgentStore((state) => state.lastAgentBlock);
  const regenerateAgentBlock = useAgentStore((state) => state.regenerateAgentBlock);
  const setInstruction = useAgentStore((state) => state.setInstruction);

  const path = useDocumentStore((state) => state.path);
  const localId = useDocumentStore((state) => state.localId);
  const blocks = useDocumentStore((state) => state.blocks);
  const anchor = useSelectionStore((state) => state.anchor);
  const focus = useSelectionStore((state) => state.focus);
  const selectionMode = useSelectionStore((state) => state.mode);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  // Intención del usuario medida antes del commit: si estaba al fondo al
  // llegar un mensaje/delta, se le sigue; si había subido, no se le secuestra.
  const stickToBottom = useRef(true);

  useEffect(() => {
    if (agentOpen) void hydrate();
  }, [agentOpen, hydrate]);

  useEffect(() => {
    void loadForDocument(docKeyForDocument(path, localId));
  }, [path, localId, loadForDocument]);

  // Mantén el contexto del store (documento/selección) en sincronía con la UI.
  // biome-ignore lint/correctness/useExhaustiveDependencies: blocks/anchor/focus/mode disparan la sincronización aunque el cuerpo lea del store.
  useEffect(() => {
    syncContextMode();
  }, [blocks, anchor, focus, selectionMode, syncContextMode]);

  // Auto-scroll sólo cuando crece la conversación y el usuario ya estaba al
  // fondo (ref actualizada por `onScroll`, no geometría post-render): leer un
  // mensaje anterior nunca se ve secuestrado por el stream.
  // biome-ignore lint/correctness/useExhaustiveDependencies: la intención vive en `stickToBottom`; el efecto se dispara al cambiar mensajes o el stream.
  useEffect(() => {
    const node = conversationRef.current;
    if (node === null) return;
    if (!stickToBottom.current) return;
    node.scrollTop = node.scrollHeight;
  }, [thread.messages.length, streamingText]);

  // Al enviar un turno se fuerza el anclaje al fondo aunque el usuario
  // estuviera leyendo arriba: acaba de iniciar una acción y espera verla.
  // biome-ignore lint/correctness/useExhaustiveDependencies: el efecto sólo debe reaccionar a `scrollRequest`.
  useEffect(() => {
    stickToBottom.current = true;
    const node = conversationRef.current;
    if (node === null) return;
    node.scrollTop = node.scrollHeight;
  }, [scrollRequest]);

  // Al abrir o cambiar de hilo se muestra el final de la conversación.
  // biome-ignore lint/correctness/useExhaustiveDependencies: el anclaje depende del hilo visible.
  useEffect(() => {
    stickToBottom.current = true;
    const node = conversationRef.current;
    if (node === null) return;
    node.scrollTop = node.scrollHeight;
  }, [threadDocKey, thread.sessionID]);

  // Un cambio de tamaño (abrir Cuenta/OAuth, redimensionar el panel) reduce el
  // alto visible sin tocar el contenido: reancla al fondo sólo si el usuario ya
  // estaba ahí. Si estaba leyendo arriba, el resize no le mueve la vista.
  useEffect(() => {
    const node = conversationRef.current;
    if (node === null) return;
    const observer = new ResizeObserver(() => {
      if (!stickToBottom.current) return;
      node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const ready = status.state === "ready";
  const stateLabel = STATUS_LABEL[status.state];
  const connectionError = status.state === "error" || status.state === "disconnected";

  // Región viva única del panel: anuncia transiciones, nunca cada delta.
  const lastMessage = thread.messages[thread.messages.length - 1];
  const noChange =
    thread.proposal === null &&
    proposalError === null &&
    lastMessage !== undefined &&
    lastMessage.role === "assistant" &&
    lastMessage.status === "done" &&
    cleanAssistantText(lastMessage.text).length === 0;
  const announcement = busy
    ? "El agente está respondiendo"
    : thread.proposal !== null
      ? thread.proposal.kind === "document"
        ? "Propuesta de documento completo lista"
        : `Propuesta lista: ${thread.proposal.blocks.length} ${
            thread.proposal.blocks.length === 1 ? "bloque" : "bloques"
          }`
      : error !== null
        ? "Se produjo un error"
        : noChange
          ? "Sin cambios propuestos"
          : lastMessage !== undefined &&
              lastMessage.role === "assistant" &&
              lastMessage.status === "done"
            ? "Respuesta lista"
            : "";

  const indexes = selectedIndexes({ anchor, focus, mode: selectionMode }, blocks);
  const agentBlockIndex =
    lastAgentBlock === null ? -1 : blocks.findIndex((block) => block.key === lastAgentBlock.key);
  const agentBlockSelected = agentBlockIndex >= 0 && indexes.includes(agentBlockIndex);
  const contextMode = contextModeFor(blocks, indexes);
  const composerReason =
    status.state === "error" || status.state === "disconnected"
      ? "Sin conexión con OpenCode · usa Reintentar"
      : status.state === "connecting"
        ? "Conectando con OpenCode…"
        : busy
          ? "El agente está respondiendo"
          : null;

  const openSettings = (trigger: HTMLElement | null) => {
    settingsTriggerRef.current = trigger;
    setSettingsOpen(true);
  };

  const viewportWidth = typeof window === "undefined" ? MAX_AGENT_WIDTH * 2 : window.innerWidth;
  const maxAgentWidth = Math.max(
    MIN_AGENT_WIDTH,
    Math.min(MAX_AGENT_WIDTH, Math.floor(viewportWidth * 0.5)),
  );

  const onResizerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = agentWidth;
    const resizer = event.currentTarget;
    const pointerId = event.pointerId;
    resizer.setPointerCapture(pointerId);
    setResizing(true);
    function onMove(moveEvent: PointerEvent): void {
      // Si se perdió el pointerup (p. ej. al cambiar de ventana), el botón ya
      // no está pulsado: cierra el gesto sin aplicar más ancho.
      if (moveEvent.buttons === 0) {
        onUp();
        return;
      }
      // Arrastrar hacia la izquierda (clientX menor) agranda el panel.
      setAgentWidth(clampAgentWidth(startWidth + (startX - moveEvent.clientX), window.innerWidth));
    }
    function onUp(): void {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (resizer.hasPointerCapture(pointerId)) {
        try {
          resizer.releasePointerCapture(pointerId);
        } catch {
          // El navegador pudo liberar la captura antes (pointercancel).
        }
      }
      setResizing(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onResizerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 16 : 8;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setAgentWidth(agentWidth + step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setAgentWidth(agentWidth - step);
    }
  };

  return (
    <aside
      className="agent-panel"
      aria-label="Panel de agente"
      inert={!agentOpen || undefined}
      data-selection-retain
      data-resizing={resizing ? "true" : undefined}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: el asa se expone como separador focusable y requiere eventos de puntero/teclado sobre un div. */}
      <div
        className="agent-resizer"
        data-testid="agent-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar panel de agente"
        title="Arrastra para redimensionar · doble clic para restablecer"
        aria-valuenow={agentWidth}
        aria-valuemin={MIN_AGENT_WIDTH}
        aria-valuemax={maxAgentWidth}
        aria-valuetext={`${agentWidth} píxeles`}
        tabIndex={0}
        onPointerDown={onResizerPointerDown}
        onKeyDown={onResizerKeyDown}
        onDoubleClick={() => setAgentWidth(DEFAULT_AGENT_WIDTH)}
      />
      <p className="sr-only" role="status" aria-live="polite" data-testid="agent-announcement">
        {announcement}
      </p>
      <div className="agent-header">
        <span className="agent-title">Agente</span>
        <button
          type="button"
          className="agent-status-badge agent-status-button"
          data-testid="agent-status"
          data-status={status.state}
          data-runtime={status.runtime ?? "embedded"}
          title={status.reason ?? stateLabel}
          aria-haspopup="dialog"
          aria-label={`Conexión y cuenta · ${stateLabel}`}
          onClick={(event) => openSettings(event.currentTarget)}
        >
          <span className="agent-status-dot" aria-hidden="true" />
          {stateLabel}
        </button>
        {status.state === "error" || status.state === "disconnected" ? (
          <button type="button" className="agent-retry" onClick={() => void retry()}>
            <RefreshCw size={12} aria-hidden="true" />
            Reintentar
          </button>
        ) : null}
        <button
          type="button"
          className="icon-button icon-button-sm agent-settings-trigger"
          data-testid="agent-settings-trigger"
          aria-label="Conexión y cuenta"
          title="Conexión y cuenta"
          aria-haspopup="dialog"
          onClick={(event) => openSettings(event.currentTarget)}
        >
          <Settings2 size={14} aria-hidden="true" />
        </button>
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="menu-trigger menu-trigger-sm"
              data-testid="menu-agent-trigger"
              aria-label="Menú del agente"
              title="Menú del agente"
            >
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuLabel>{ready ? "OpenCode conectado" : stateLabel}</MenuLabel>
            <MenuSeparator />
            <MenuLabel>Modo de conexión</MenuLabel>
            <MenuRadioGroup
              value={mode}
              onValueChange={(value) => {
                if (value === "auto" || value === "local" || value === "embedded") setMode(value);
              }}
            >
              <MenuRadioItem value="auto" disabled={status.state === "connecting" || busy}>
                Automático
              </MenuRadioItem>
              <MenuRadioItem value="local" disabled={status.state === "connecting" || busy}>
                Local
              </MenuRadioItem>
              <MenuRadioItem value="embedded" disabled={status.state === "connecting" || busy}>
                Embebido
              </MenuRadioItem>
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuItem icon={<RotateCcw size={14} />} onSelect={() => void retry()}>
              Reconectar
            </MenuItem>
            <MenuItem icon={<Trash2 size={14} />} onSelect={() => void clearThread()}>
              Limpiar conversación
            </MenuItem>
          </MenuContent>
        </Menu>
        <IconButton
          label={agentOpen ? "Colapsar el agente" : "Expandir el agente"}
          size="sm"
          aria-expanded={agentOpen}
          aria-controls="agent-panel-body"
          onClick={() => {
            const closing = agentOpen;
            toggleAgent();
            if (closing) {
              requestAnimationFrame(() => {
                document.querySelector<HTMLElement>(".panel-handle-right")?.focus();
              });
            }
          }}
        >
          {agentOpen ? (
            <PanelRightClose size={14} aria-hidden="true" />
          ) : (
            <PanelRightOpen size={14} aria-hidden="true" />
          )}
        </IconButton>
      </div>

      {error !== null ? (
        <p className="agent-error-banner" role="alert">
          <AlertTriangle size={13} aria-hidden="true" />
          <span className="agent-error-text">{error}</span>
          {connectionError ? (
            <button
              type="button"
              className="agent-error-action"
              onClick={() => openSettings(settingsTriggerRef.current)}
            >
              Ajustes de conexión
            </button>
          ) : (
            <button type="button" className="agent-error-action" onClick={clearError}>
              Descartar
            </button>
          )}
        </p>
      ) : null}

      <div className="agent-body" id="agent-panel-body">
        <AudienceChip />
        <div
          className="agent-conversation"
          ref={conversationRef}
          onScroll={(event) => {
            const node = event.currentTarget;
            stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
          }}
        >
          {thread.messages.length === 0 && thread.proposal === null && proposalError === null ? (
            <div className="agent-empty">
              <span className="agent-empty-icon" aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <p className="agent-empty-title">
                {contextMode === "document"
                  ? blocks.length === 0
                    ? "Pide al agente que escriba el documento"
                    : "Pide un cambio sobre el documento"
                  : "Pide un cambio sobre la selección"}
              </p>
              <p className="agent-empty-copy">
                {contextMode === "document"
                  ? "El agente recibe el documento completo. Selecciona bloques si quieres limitar el cambio."
                  : "El agente solo ve la selección que marcas en el documento. No recibe el archivo completo."}
              </p>
              <button
                type="button"
                className="agent-empty-action"
                disabled={status.state !== "ready" || busy}
                title={
                  status.state !== "ready"
                    ? "Conecta el agente para escribir"
                    : busy
                      ? "El agente está ocupado"
                      : undefined
                }
                onClick={() => useAgentStore.getState().focusComposer()}
              >
                <PenLine size={14} aria-hidden="true" />
                Escribir una instrucción
              </button>
            </div>
          ) : null}

          <AnimatePresence initial={false}>
            {thread.messages.map((message, index) => (
              <AgentMessage
                key={message.id}
                message={message}
                noChange={noChange && index === thread.messages.length - 1}
                streaming={
                  busy && index === thread.messages.length - 1 && message.status === "streaming"
                }
              />
            ))}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {thread.proposal !== null ? (
              <ProposalCard
                key="proposal"
                proposal={thread.proposal}
                revisionRequested={revisionRequested}
                variantFromReview={variantFromReview}
              />
            ) : null}
          </AnimatePresence>
          {viewMode !== "render" ? <ReviewCard /> : null}

          {thread.proposal === null && lastRejected !== null && !busy ? (
            <div className="agent-undo-bar" data-testid="agent-undo-bar">
              <span>Propuesta descartada</span>
              <button
                type="button"
                className="button agent-undo"
                data-testid="agent-undo-reject"
                onClick={undoReject}
              >
                Deshacer
              </button>
            </div>
          ) : null}

          {proposalError !== null ? (
            <ProposalErrorCard raw={proposalError.raw} reason={proposalError.reason} />
          ) : null}
        </div>

        <SelectionContextCard />
        {revisionRequested ? (
          <p className="agent-revision-note" data-testid="agent-revision-note">
            La propuesta anterior se adjuntará al siguiente mensaje
          </p>
        ) : null}
        {agentBlockSelected && lastAgentBlock !== null && !busy && thread.proposal === null ? (
          <div className="agent-agent-block-bar" data-testid="agent-block-bar">
            <span>Bloque de agente insertado</span>
            <div className="agent-agent-block-actions">
              <button
                type="button"
                className="button"
                data-testid="agent-block-regenerate"
                disabled={!ready}
                onClick={() => void regenerateAgentBlock()}
              >
                Regenerar
              </button>
              <button
                type="button"
                className="button"
                data-testid="agent-block-adjust"
                onClick={() => {
                  const index = useDocumentStore
                    .getState()
                    .blocks.findIndex((block) => block.key === lastAgentBlock.key);
                  if (index < 0) {
                    useUiStore.getState().setToast("El bloque ya no existe; no se puede ajustar.");
                    useAgentStore.setState({ lastAgentBlock: null });
                    return;
                  }
                  useSelectionStore.getState().selectIndexRange(index, index);
                  setInstruction("Ajusta este párrafo: ");
                  useAgentStore.getState().focusComposer();
                }}
              >
                Ajustar
              </button>
            </div>
          </div>
        ) : null}
        <AgentComposer disabledReason={composerReason} />
      </div>

      <ConnectionDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        triggerRef={settingsTriggerRef}
      />
    </aside>
  );
}
