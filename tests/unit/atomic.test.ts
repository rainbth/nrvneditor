import fs, {
  existsSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileTooLargeError,
  MAX_FILE_BYTES,
  projectedDocumentBytes,
  readTextFile,
  sha256,
  writeFileAtomic,
} from "../../electron/lib/atomic";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "nrvn-atomic-test-"));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("atomic document IO", () => {
  it("creates a new LF file without BOM", () => {
    const file = path.join(dir, "new.md");
    writeFileAtomic(file, "uno\ndos\n");
    expect(readFileSync(file)).toEqual(Buffer.from("uno\ndos\n"));
  });

  it("preserves existing CRLF and BOM when editing", () => {
    const file = path.join(dir, "existing.md");
    writeFileSync(file, "\uFEFFuno\r\ndos\r\n");
    writeFileAtomic(file, "cambio\nfinal\n");
    expect(readFileSync(file)).toEqual(Buffer.from("\uFEFFcambio\r\nfinal\r\n"));
  });

  it("detects EOL and BOM", () => {
    const file = path.join(dir, "detect.md");
    writeFileSync(file, "\uFEFFa\r\nb");
    expect(readTextFile(file)).toMatchObject({ content: "a\r\nb", eol: "crlf", bom: true });
  });

  it("counts UTF-8 BOM and CRLF in projected bytes", () => {
    expect(projectedDocumentBytes("é\nx", "crlf", true)).toBe(Buffer.byteLength("\uFEFFé\r\nx"));
  });

  it("rejects files over MAX_FILE_BYTES", () => {
    const file = path.join(dir, "large.md");
    const fd = openSync(file, "w");
    ftruncateSync(fd, MAX_FILE_BYTES + 1);
    fs.closeSync(fd);
    expect(() => readTextFile(file)).toThrow(FileTooLargeError);
  });

  it("keeps the original and cleans temporary after rename failure", () => {
    const file = path.join(dir, "rename.md");
    writeFileSync(file, "original");
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("rename-fail");
    });
    expect(() => writeFileAtomic(file, "replacement")).toThrow("rename-fail");
    expect(readFileSync(file, "utf8")).toBe("original");
    expect(readdirSync(dir).filter((name) => name.includes("nrvn-tmp-"))).toEqual([]);
  });

  it("cleans the temporary file when write/fsync fails", () => {
    const file = path.join(dir, "write.md");
    vi.spyOn(fs, "fsyncSync").mockImplementationOnce(() => {
      throw new Error("fsync-fail");
    });
    expect(() => writeFileAtomic(file, "payload")).toThrow("fsync-fail");
    expect(existsSync(file)).toBe(false);
    expect(readdirSync(dir).filter((name) => name.includes("nrvn-tmp-"))).toEqual([]);
  });

  it("creates a backup with prior content", () => {
    const file = path.join(dir, "backup.md");
    const backups = path.join(dir, "backups");
    writeFileSync(file, "previous");
    writeFileAtomic(file, "current", { backupDir: backups });
    const backup = readdirSync(backups).find((name) => name.endsWith(".bak"));
    expect(backup).toBeDefined();
    expect(readFileSync(path.join(backups, backup as string), "utf8")).toBe("previous");
    expect(sha256("current")).toHaveLength(64);
  });
});
