import { motion, useReducedMotion } from "motion/react";
import type { AgentThreadMessage } from "../../../electron/types";
import { springSoft } from "../../lib/motion";

export interface AgentMessageProps {
  message: AgentThreadMessage;
  streaming?: boolean;
  /**
   * El último mensaje terminó sin error y no generó propuesta. Permite mostrar
   * «Sin cambios propuestos.» en vez de una burbuja vacía.
   */
  noChange?: boolean;
}

const ROLE_LABEL: Record<AgentThreadMessage["role"], string> = {
  user: "Tú",
  assistant: "Agente",
};

const PLACEHOLDER = "Preparando propuesta…";

/**
 * Marcadores del contrato de bloques que el agente incluye en su respuesta.
 * Son protocolo interno: no deben aparecer en la burbuja del asistente.
 */
const BLOCK_MARKER_RE =
  /<<<[ \t]*NRVN_BLOCK[ \t]+key[ \t]*=[ \t]*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^>\r\n]+)[ \t]*>>>/g;
const END_MARKER_RE = /<<<[ \t]*NRVN_END[ \t]*>>>/g;
const NO_CHANGE_MARKER_RE = /<<<[ \t]*NRVN_NO_CHANGE[ \t]*>>>/g;
const DOCUMENT_MARKER_RE = /<<<[ \t]*NRVN_DOCUMENT[ \t]*>>>/g;

/**
 * Resto de un marcador que el streaming ha dejado a medias: `<<<NRVN` (o un
 * prefijo suyo) sin cerrar con `>>>`. Se detecta en el extremo del texto porque
 * `cleanAssistantText` solo elimina los marcadores completos.
 */
const PENDING_MARKER_RE = /<<<[ \t]*NRVN/;
const PENDING_MARKER_PREFIX_RE = /<<<[ \t]*N?R?V?N?(?:_[A-Z]*)?$/;

/** ¿El texto visible aún contiene el inicio de un marcador `<<<NRVN`? */
/** ¿El texto crudo del asistente contiene una propuesta de documento completo? */
export function hasDocumentMarker(text: string): boolean {
  return /<<<[ \t]*NRVN_DOCUMENT[ \t]*>>>/.test(text);
}

export function hasPendingMarker(text: string): boolean {
  return PENDING_MARKER_RE.test(text) || PENDING_MARKER_PREFIX_RE.test(text);
}

/**
 * Limpia solo la visualización del mensaje del asistente: quita los marcadores
 * `<<<NRVN_*>>>` y conserva como texto el Markdown interno de cada bloque.
 * No altera el texto almacenado en el thread ni el parser de propuestas.
 */
export function cleanAssistantText(text: string): string {
  return text
    .replace(BLOCK_MARKER_RE, "")
    .replace(DOCUMENT_MARKER_RE, "")
    .replace(END_MARKER_RE, "")
    .replace(NO_CHANGE_MARKER_RE, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Mensaje de la conversación. No es una región viva: el streaming se anuncia
 * desde una única región `role="status"` del panel, no delta a delta.
 */
export function AgentMessage({ message, streaming = false, noChange = false }: AgentMessageProps) {
  const reduceMotion = useReducedMotion();
  const isStreaming = streaming || message.status === "streaming";
  const text = message.role === "assistant" ? cleanAssistantText(message.text) : message.text;
  // Mientras el streaming deja un marcador a medias, no se muestra el texto
  // parcial: se anuncia que se está preparando la propuesta.
  const pendingMarker = isStreaming && message.role === "assistant" && hasPendingMarker(text);
  const assistantDone =
    message.role === "assistant" && message.status === "done" && message.error === undefined;
  // Solo para mensajes vacíos de respuestas antiguas: el texto del turno ya se
  // persiste como resumen, así que aquí nunca se inventa un estado «aplicado».
  const showNoChange = noChange && !isStreaming && assistantDone && text.length === 0;
  const displayText = showNoChange
    ? "Sin cambios propuestos."
    : pendingMarker || (text.length === 0 && isStreaming)
      ? PLACEHOLDER
      : text;
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={reduceMotion ? { duration: 0 } : springSoft}
      className={`agent-message agent-message-${message.role}`}
      data-testid="agent-message"
      data-role={message.role}
      data-status={message.status}
      aria-busy={isStreaming}
    >
      <p className="agent-message-meta">
        <span className="agent-message-role">{ROLE_LABEL[message.role]}</span>
        {isStreaming ? <span className="agent-message-state">Escribiendo…</span> : null}
        {message.status === "cancelled" ? (
          <span className="agent-message-state">Cancelado</span>
        ) : null}
      </p>
      <p className="agent-message-text" data-testid={showNoChange ? "agent-no-change" : undefined}>
        {displayText}
        {isStreaming ? <span className="agent-streaming-cursor" aria-hidden="true" /> : null}
      </p>
      {message.status === "error" ? (
        <p className="agent-message-error" role="alert">
          {message.error ?? "El agente devolvió un error."}
        </p>
      ) : null}
    </motion.article>
  );
}
