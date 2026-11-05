import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Eol } from "../types";

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_BYTES = MAX_DOCUMENT_BYTES;

/** El archivo supera el límite de lectura de nrvn (5 MB). */
export class FileTooLargeError extends Error {
  constructor(absPath: string, size: number) {
    super(
      `Archivo demasiado grande (${size} bytes); el límite es 5 MB. Reduzca el contenido del documento. (${absPath})`,
    );
    this.name = "FileTooLargeError";
  }
}

/** SHA-256 hexadecimal del contenido UTF-8. */
export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function detectEol(text: string): Eol {
  return text.includes("\r\n") ? "crlf" : "lf";
}

export interface ReadTextResult {
  content: string;
  eol: Eol;
  bom: boolean;
  mtimeMs: number;
}

/** Lee un archivo de texto en UTF-8 detectando EOL, BOM y mtime. */
export function readTextFile(absPath: string): ReadTextResult {
  const stat = fs.statSync(absPath);
  if (stat.size > MAX_FILE_BYTES) {
    throw new FileTooLargeError(absPath, stat.size);
  }
  const buffer = fs.readFileSync(absPath);
  const bom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const content = buffer.toString("utf8").replace(/^\uFEFF/, "");
  return { content, eol: detectEol(content), bom, mtimeMs: stat.mtimeMs };
}

function withEol(content: string, eol: Eol): string {
  const normalized = content.replace(/\r\n/g, "\n");
  return eol === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
}

/** Bytes que ocupará el contenido al escribirse con EOL/BOM dados. */
export function projectedDocumentBytes(content: string, eol: Eol, bom: boolean): number {
  return Buffer.byteLength(`${bom ? "\uFEFF" : ""}${withEol(content, eol)}`, "utf8");
}

export interface WriteOptions {
  backupDir?: string;
  eol?: Eol;
  bom?: boolean;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backupOriginal(absPath: string, backupDir: string): void {
  if (!fs.existsSync(absPath)) return;
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${path.basename(absPath)}-${timestamp()}.bak`);
  fs.copyFileSync(absPath, backupPath);
}

/**
 * Escritura atómica: temporal en el mismo directorio + fsync + rename.
 * Backup previo del original, y preservación del EOL/BOM detectados.
 * Nunca deja el destino truncado.
 */
export function writeFileAtomic(
  absPath: string,
  content: string,
  options: WriteOptions = {},
): void {
  const dir = path.dirname(absPath);
  const base = path.basename(absPath);
  const existing = fs.existsSync(absPath);
  const detectedEol: Eol = options.eol ?? (existing ? readTextFile(absPath).eol : "lf");
  const detectedBom: boolean = options.bom ?? (existing ? readTextFile(absPath).bom : false);

  if (options.backupDir) backupOriginal(absPath, options.backupDir);

  const payload = `${detectedBom ? "\uFEFF" : ""}${withEol(content, detectedEol)}`;
  const tmpPath = path.join(dir, `.${base}.nrvn-tmp-${randomBytes(6).toString("hex")}`);

  let fd: number | undefined;
  try {
    fd = fs.openSync(tmpPath, "wx");
    fs.writeFileSync(fd, payload, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmpPath, absPath);
    try {
      const dirFd = fs.openSync(dir, "r");
      fs.fsyncSync(dirFd);
      fs.closeSync(dirFd);
    } catch {
      // fsync del directorio no es crítico ni soportado en todos los FS.
    }
  } catch (error) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // el temporal puede no existir si el open falló.
    }
    throw error;
  }
}
