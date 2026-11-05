import { Send, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { contextModeFor } from "../../lib/agent-context";
import { headingTrailForSelection } from "../../lib/sections";
import { useAgentStore } from "../../store/agent";
import { useDocumentStore } from "../../store/document";
import { selectedIndexes, useSelectionStore } from "../../store/selection";

/** Composer del agente: instrucción, envío con ⌘↵ y detención del stream. */
export interface AgentComposerProps {
  /** Motivo por el que el composer no puede enviar; `null` cuando está listo. */
  disabledReason?: string | null;
}

export function AgentComposer({ disabledReason = null }: AgentComposerProps) {
  const blocks = useDocumentStore((state) => state.blocks);
  const content = useDocumentStore((state) => state.content);
  const path = useDocumentStore((state) => state.path);
  const anchor = useSelectionStore((state) => state.anchor);
  const focus = useSelectionStore((state) => state.focus);
  const mode = useSelectionStore((state) => state.mode);

  const instruction = useAgentStore((state) => state.instruction);
  const status = useAgentStore((state) => state.status);
  const busy = useAgentStore((state) => state.busy);
  const promptError = useAgentStore((state) => state.promptError);
  const focusToken = useAgentStore((state) => state.composerFocusToken);
  const setInstruction = useAgentStore((state) => state.setInstruction);
  const send = useAgentStore((state) => state.send);
  const cancel = useAgentStore((state) => state.cancel);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastFocusToken = useRef(0);

  const indexes = selectedIndexes({ anchor, focus, mode }, blocks);
  const selected = indexes.map((index) => blocks[index]).filter((block) => block !== undefined);
  const pending = selected.some((block) => block.pending);
  const pendingSection =
    selected[0]?.type === "heading" &&
    (mode === "section" || selected.slice(1).some((block) => block.pending));
  const hasSelection = selected.length > 0;
  const contextMode = contextModeFor(blocks, indexes);
  const ready = status.state === "ready";
  // Con documento (aunque esté vacío) siempre se puede pedir; solo la
  // selección exige al menos un bloque.
  const disabled = !ready || busy || (contextMode === "selection" && !hasSelection);
  const note =
    promptError ?? disabledReason ?? (ready && !busy && !disabled ? "⌘↵ para enviar" : null);

  useEffect(() => {
    if (focusToken === 0 || disabled || focusToken === lastFocusToken.current) return;
    lastFocusToken.current = focusToken;
    textareaRef.current?.focus();
  }, [focusToken, disabled]);

  const submit = () => {
    if (disabled || instruction.trim().length === 0) return;
    void send({
      blocks: selected,
      headingTrail: headingTrailForSelection(blocks, indexes),
      path,
      mode: contextMode,
      documentContent: content,
      documentBlockCount: blocks.length,
    });
  };

  const placeholder =
    blocks.length === 0
      ? "Pide al agente que escriba…"
      : pending
        ? pendingSection
          ? "Describe qué quieres en esta sección"
          : "Describe qué quieres en este párrafo"
        : contextMode === "selection"
          ? "Pide un cambio sobre la selección"
          : "Pide un cambio sobre el texto…";

  return (
    <form
      className="agent-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={textareaRef}
        id="agent-composer-input"
        className="agent-composer-input"
        data-testid="agent-composer"
        aria-label="Instrucción para el agente"
        aria-describedby="agent-composer-note"
        placeholder={placeholder}
        rows={3}
        value={instruction}
        disabled={disabled}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="agent-composer-actions">
        <span
          className="agent-composer-note"
          id="agent-composer-note"
          data-testid="agent-composer-note"
        >
          {note ?? ""}
        </span>
        {busy ? (
          <button
            type="button"
            className="button agent-stop"
            data-testid="agent-stop"
            onClick={() => void cancel()}
          >
            <Square size={13} aria-hidden="true" />
            Detener
          </button>
        ) : (
          <button
            type="submit"
            className="button button-primary"
            data-testid="agent-send"
            disabled={disabled || instruction.trim().length === 0}
          >
            <Send size={13} aria-hidden="true" />
            Enviar
          </button>
        )}
      </div>
    </form>
  );
}
