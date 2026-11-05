import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { splitBlocks } from "../../src/lib/blocks";
import {
  canonicalLanguagePath,
  isLanguageCode,
  languageContentHash,
  languageSiblingParts,
  languageSiblingPath,
  sourceLanguageOf,
  syncLanguageBlocks,
} from "../../src/lib/languages";
import { readTextFile, sha256, writeFileAtomic } from "../lib/atomic";
import { assertInsideRoot, resolveWorkspacePath } from "../lib/paths";
import type {
  LanguageBlockState,
  LanguageCreateResult,
  LanguageSet,
  LanguageSyncResult,
  LanguageTranslation,
} from "../types";
import { composeBundle, readSidecar, writeSidecar } from "./metadata";

const blockSchema = z
  .object({
    key: z.string(),
    sourceHash: z.string(),
    targetHash: z.string(),
    humanEdited: z.boolean(),
  })
  .strict();
const translationSchema = z
  .object({
    path: z.string(),
    lang: z.string(),
    sourceHash: z.string(),
    updatedAt: z.string(),
    stale: z.boolean(),
    humanEditedBlocks: z.array(z.string()),
    blocks: z.array(blockSchema),
  })
  .strict();
const languageSetSchema = z
  .object({
    originalPath: z.string(),
    sourceLang: z.string(),
    translations: z.record(z.string(), translationSchema),
  })
  .strict();
const emptySet = (originalPath: string): LanguageSet => ({
  originalPath,
  sourceLang: sourceLanguageOf(originalPath),
  translations: {},
});
function safe(root: string, rel: string): string {
  const abs = resolveWorkspacePath(root, rel);
  assertInsideRoot(root, abs);
  return abs;
}
function validSet(value: unknown, path: string): LanguageSet {
  const parsed = languageSetSchema.safeParse(value);
  return parsed.success && parsed.data.originalPath === path ? parsed.data : emptySet(path);
}
const writeQueues = new Map<string, Promise<unknown>>();

function queueWrite<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  writeQueues.set(key, current);
  void current
    .finally(() => {
      if (writeQueues.get(key) === current) writeQueues.delete(key);
    })
    .catch(() => undefined);
  return current;
}

function discovered(
  path: string,
  lang: string,
  sourceContent = "",
  targetContent = "",
): LanguageTranslation {
  const sourceBlocks = splitBlocks(sourceContent);
  const targetBlocks = splitBlocks(targetContent);
  const blocks: LanguageBlockState[] = [];
  for (let i = 0; i < Math.min(sourceBlocks.length, targetBlocks.length); i += 1) {
    const source = sourceBlocks[i];
    const target = targetBlocks[i];
    blocks.push({
      key: source.key,
      sourceHash: source.hash,
      targetHash: target.hash,
      humanEdited: target.hash !== source.hash,
    });
  }
  for (const source of sourceBlocks.slice(targetBlocks.length))
    blocks.push({
      key: source.key,
      sourceHash: source.hash,
      targetHash: source.hash,
      humanEdited: true,
    });
  return {
    path,
    lang,
    sourceHash: "",
    updatedAt: "",
    stale: true,
    humanEditedBlocks: [],
    blocks,
  };
}

export async function getLanguageSet(root: string, relPath: string): Promise<LanguageSet> {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
    throw new Error("La carpeta del workspace no existe.");
  const canonical = canonicalLanguagePath(relPath);
  const originalPath =
    languageSiblingParts(relPath) && !fs.existsSync(safe(root, canonical)) ? relPath : canonical;
  const originalAbs = safe(root, originalPath);
  const prior = await readSidecar(originalAbs);
  let set =
    prior.status === "ok"
      ? validSet(prior.bundle.languages[originalPath], originalPath)
      : emptySet(originalPath);
  let discoveredAny = false;
  let sourceContent = "";
  let sourceRead = false;
  try {
    sourceContent = readTextFile(originalAbs).content;
    sourceRead = true;
  } catch {
    /* discovered sibling only */
  }
  try {
    const entries = await fsp.readdir(path.dirname(originalAbs), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const sibling = path.posix.join(path.posix.dirname(originalPath), entry.name);
      const parts = languageSiblingParts(sibling);
      if (parts?.basePath === canonical && !set.translations[parts.lang]) {
        let targetContent = "";
        try {
          targetContent = readTextFile(safe(root, sibling)).content;
        } catch {
          /* baseline unavailable */
        }
        set.translations[parts.lang] = discovered(
          sibling,
          parts.lang,
          sourceContent,
          targetContent,
        );
        discoveredAny = true;
      }
    }
  } catch {
    /* directory may not exist */
  }
  const sourceHash = sourceRead ? languageContentHash(sourceContent) : "";
  set = {
    ...set,
    translations: Object.fromEntries(
      Object.entries(set.translations).map(([lang, t]) => [
        lang,
        { ...t, stale: !t.sourceHash || t.sourceHash !== sourceHash },
      ]),
    ),
  };
  if (discoveredAny && prior.status !== "error") await persistLanguageSet(root, originalPath, set);
  return set;
}

export async function persistLanguageSet(
  root: string,
  originalRel: string,
  set: LanguageSet,
): Promise<void> {
  const originalAbs = safe(root, originalRel);
  const prior = await readSidecar(originalAbs);
  if (prior.status === "error") throw new Error(prior.error);
  await queueWrite(originalAbs, async () => {
    const latest = await readSidecar(originalAbs);
    if (latest.status === "error") throw new Error(latest.error);
    const latestBundle = await composeBundle(
      root,
      originalRel,
      originalRel,
      sha256(readTextFile(originalAbs).content),
      latest.status === "ok" ? latest.bundle : undefined,
    );
    const latestSet =
      latest.status === "ok"
        ? validSet(latest.bundle.languages[originalRel], originalRel)
        : emptySet(originalRel);
    const merged = {
      ...latestSet,
      ...set,
      translations: { ...latestSet.translations, ...set.translations },
    };
    latestBundle.languages = { ...latestBundle.languages, [originalRel]: merged };
    const written = await writeSidecar(originalAbs, latestBundle);
    if (!written.ok) throw new Error(written.error);
  });
}

export async function createLanguage(
  root: string,
  relPath: string,
  lang: string,
): Promise<LanguageCreateResult> {
  try {
    if (!isLanguageCode(lang)) return { ok: false, error: "Código de idioma inválido." };
    const canonical = canonicalLanguagePath(relPath);
    const originalRel = fs.existsSync(safe(root, canonical)) ? canonical : relPath;
    const originalAbs = safe(root, originalRel);
    if (!/\.mdx?$/i.test(originalRel) || !fs.existsSync(originalAbs))
      throw new Error("No se encontró el documento original Markdown.");
    const targetRel = languageSiblingPath(originalRel, lang);
    const targetAbs = safe(root, targetRel);
    const source = readTextFile(originalAbs);
    const prior = await readSidecar(originalAbs);
    if (prior.status === "error") throw new Error(prior.error);
    const set = await getLanguageSet(root, originalRel);
    if (fs.existsSync(targetAbs)) {
      if (!set.translations[lang])
        set.translations[lang] = discovered(
          targetRel,
          lang,
          source.content,
          readTextFile(targetAbs).content,
        );
      await persistLanguageSet(root, originalRel, set);
      return { ok: true, created: false, path: targetRel, set };
    }
    writeFileAtomic(targetAbs, source.content, { eol: source.eol, bom: source.bom });
    const blocks: LanguageBlockState[] = splitBlocks(source.content).map((b) => ({
      key: b.key,
      sourceHash: b.hash,
      targetHash: b.hash,
      humanEdited: false,
    }));
    set.translations[lang] = {
      path: targetRel,
      lang,
      sourceHash: languageContentHash(source.content),
      updatedAt: new Date().toISOString(),
      stale: false,
      humanEditedBlocks: [],
      blocks,
    };
    await persistLanguageSet(root, originalRel, set);
    return { ok: true, created: true, path: targetRel, set };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo crear el idioma.",
    };
  }
}

export async function syncLanguage(
  root: string,
  relPath: string,
  lang: string,
): Promise<LanguageSyncResult> {
  try {
    const canonical = canonicalLanguagePath(relPath);
    const originalRel = fs.existsSync(safe(root, canonical)) ? canonical : relPath;
    const sourceAbs = safe(root, originalRel);
    // El sidecar se lee ANTES de cualquier descubrimiento: `getLanguageSet`
    // persiste el manifiesto al encontrar hermanos y borraría la evidencia de
    // que el hermano no estaba registrado.
    const prior = await readSidecar(sourceAbs);
    if (prior.status === "error") throw new Error(prior.error);
    const set = await getLanguageSet(root, originalRel);
    const targetRel = set.translations[lang]?.path ?? languageSiblingPath(originalRel, lang);
    const canonicalBase = languageSiblingParts(originalRel)?.basePath ?? originalRel;
    const parts = languageSiblingParts(targetRel);
    if (
      !parts ||
      parts.basePath !== canonicalBase ||
      parts.lang !== lang ||
      targetRel === originalRel
    )
      throw new Error("La versión registrada no corresponde a este documento/idioma.");
    const targetAbs = safe(root, targetRel);
    if (!fs.existsSync(targetAbs)) throw new Error(`No existe la versión ${lang}: ${targetRel}`);
    const source = readTextFile(sourceAbs);
    const target = readTextFile(targetAbs);
    // Un hermano con contenido pero sin manifiesto no se sobrescribe: sería
    // perder una traducción hecha a mano. Se adopta con createLanguage.
    if (prior.status === "missing" && target.content.trim() !== "")
      throw new Error(
        `La versión ${lang} (${targetRel}) existe pero no está registrada en el manifiesto; no se sobrescribe.`,
      );
    const record =
      set.translations[lang] ?? discovered(targetRel, lang, source.content, target.content);
    const outcome = syncLanguageBlocks(source.content, target.content, record);
    const targetChanged = outcome.content !== target.content;
    if (targetChanged)
      writeFileAtomic(targetAbs, outcome.content, { eol: target.eol, bom: target.bom });
    set.translations[lang] = outcome.record;
    try {
      await persistLanguageSet(root, originalRel, set);
    } catch (error) {
      if (targetChanged) {
        try {
          writeFileAtomic(targetAbs, target.content, { eol: target.eol, bom: target.bom });
        } catch (rollbackError) {
          return {
            ok: false,
            error: `No se pudo guardar el manifiesto (${error instanceof Error ? error.message : "error desconocido"}) ni revertir el destino (${rollbackError instanceof Error ? rollbackError.message : "error desconocido"}).`,
          };
        }
      }
      return {
        ok: false,
        error: `El archivo se actualizó pero no se pudo guardar el manifiesto; se revirtió el cambio. ${error instanceof Error ? error.message : "Error desconocido"}`,
      };
    }
    return {
      ok: true,
      path: targetRel,
      hash: sha256(readTextFile(targetAbs).content),
      changedBlocks: outcome.changedBlocks,
      protectedBlocks: outcome.protectedBlocks,
      set,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo sincronizar el idioma.",
    };
  }
}
