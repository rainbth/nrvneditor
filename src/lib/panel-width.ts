/**
 * Ancho del panel de agente: constantes y clamp puro.
 *
 * El panel crece hacia la izquierda, así que su máximo práctico nunca supera
 * la mitad del viewport; el mínimo garantiza que el composer siga usable.
 */

export const MIN_AGENT_WIDTH = 320;
export const MAX_AGENT_WIDTH = 640;
export const DEFAULT_AGENT_WIDTH = 380;

/**
 * Acota `width` al rango [320, min(640, floor(viewport / 2))].
 *
 * Un `width` no finito cae al ancho por defecto (380); un viewport no finito
 * usa sólo el máximo absoluto. En viewports muy estrechos el mínimo (320)
 * tiene prioridad sobre la mitad del viewport para no colapsar el panel.
 */
export function clampAgentWidth(width: number, viewport: number): number {
  const requested = Number.isFinite(width) ? width : DEFAULT_AGENT_WIDTH;
  const viewportMax = Number.isFinite(viewport) ? Math.floor(viewport * 0.5) : MAX_AGENT_WIDTH;
  const upper = Math.max(MIN_AGENT_WIDTH, Math.min(MAX_AGENT_WIDTH, viewportMax));
  return Math.min(upper, Math.max(MIN_AGENT_WIDTH, Math.round(requested)));
}
