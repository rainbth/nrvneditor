import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const MAX_LOG_BYTES = 1024 * 1024;

let logFile: string | null = null;

function resolveLogFile(): string {
  if (logFile) return logFile;
  logFile = path.join(app.getPath("logs"), "main.log");
  return logFile;
}

function rotateIfNeeded(file: string): void {
  try {
    const stat = fs.statSync(file);
    if (stat.size < MAX_LOG_BYTES) return;
    const previous = `${file}.1`;
    try {
      fs.unlinkSync(previous);
    } catch {
      // no había rotación previa
    }
    fs.renameSync(file, previous);
  } catch {
    // el log aún no existe
  }
}

function formatMeta(meta: Record<string, unknown> | undefined): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  return ` ${JSON.stringify(meta)}`;
}

/**
 * Log local en `~/Library/Logs/nrvn/main.log` con rotación por tamaño.
 * Nunca se registra el contenido de los documentos: sólo rutas, longitudes y errores.
 */
export function log(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
): void {
  const line = `${new Date().toISOString()} [${level}] ${message}${formatMeta(meta)}\n`;
  const consoleFn =
    level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  consoleFn(line.trimEnd());
  try {
    const file = resolveLogFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotateIfNeeded(file);
    fs.appendFileSync(file, line, "utf8");
  } catch {
    // si el log falla, la app no debe caerse.
  }
}

export function logInfo(message: string, meta?: Record<string, unknown>): void {
  log("info", message, meta);
}

export function logWarn(message: string, meta?: Record<string, unknown>): void {
  log("warn", message, meta);
}

export function logError(message: string, meta?: Record<string, unknown>): void {
  log("error", message, meta);
}
