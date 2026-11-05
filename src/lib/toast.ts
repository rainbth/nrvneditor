export type ToastTone = "info" | "action" | "error";

export const TOAST_MS = 4000;
export const TOAST_LONG_MS = 10000;

export function classifyToast(message: string): { tone: ToastTone; durationMs: number } {
  const tone: ToastTone = /^(no se pudo|no se pueden?|no se pudieron|conflicto|error)/i.test(
    message,
  )
    ? "error"
    : /⌘z|deshacer/i.test(message)
      ? "action"
      : "info";
  return { tone, durationMs: tone === "info" ? TOAST_MS : TOAST_LONG_MS };
}
