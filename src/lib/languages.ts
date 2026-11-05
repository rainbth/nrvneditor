import type { LanguageBlockState, LanguageTranslation } from "../../electron/types";
import { splitBlocks } from "./blocks";
import { sha256Hex } from "./hash";

export function isLanguageCode(lang: string): boolean {
  return /^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(lang);
}
export function languageSiblingParts(relPath: string): { basePath: string; lang: string } | null {
  const match = /^(.*)\.([a-z]{2}(?:-[A-Za-z]{2})?)\.(md|mdx)$/i.exec(relPath);
  if (!match) return null;
  const lang = match[2];
  if (!isLanguageCode(lang)) return null;
  return { basePath: `${match[1]}.${match[3]}`, lang };
}
export function canonicalLanguagePath(relPath: string): string {
  return languageSiblingParts(relPath)?.basePath ?? relPath;
}
export function languageSiblingPath(relPath: string, lang: string): string {
  const source = languageSiblingParts(relPath)?.basePath ?? relPath;
  const match = /^(.*)\.(md|mdx)$/i.exec(source);
  return match && isLanguageCode(lang) ? `${match[1]}.${lang}.${match[2]}` : source;
}
export function sourceLanguageOf(relPath: string, fallback = "es"): string {
  return languageSiblingParts(relPath)?.lang ?? fallback;
}
export function languageLabel(lang: string): string {
  return lang.toUpperCase();
}
export function languageContentHash(content: string): string {
  return sha256Hex(content.replace(/\r\n?/g, "\n"));
}

export function syncLanguageBlocks(
  sourceContent: string,
  targetContent: string,
  record: LanguageTranslation,
  now?: string,
): {
  content: string;
  record: LanguageTranslation;
  changedBlocks: number;
  protectedBlocks: number;
} {
  type Edit = { start: number; end: number; raw: string; priority: 0 | 1 };
  const sources = splitBlocks(sourceContent);
  const targets = splitBlocks(targetContent);
  const states: LanguageBlockState[] = [];
  const edits: Edit[] = [];
  const insertions = new Map<number, string[]>();
  const oldByKey = new Map(record.blocks.map((old) => [old.key, old]));
  const sourceHashes = new Set(sources.map((source) => source.hash));
  const usedOld = new Set<LanguageBlockState>();
  const targetIndexByKey = new Map<string, number>();
  const usedTargets = new Set<number>();
  record.blocks.forEach((old, oldIndex) => {
    let targetIndex = targets.findIndex(
      (target, index) => !usedTargets.has(index) && target.hash === old.targetHash,
    );
    if (targetIndex < 0 && oldIndex < targets.length && !usedTargets.has(oldIndex))
      targetIndex = oldIndex;
    if (targetIndex >= 0) usedTargets.add(targetIndex);
    targetIndexByKey.set(old.key, targetIndex);
  });
  let changedBlocks = 0;
  let protectedBlocks = 0;
  let lastTargetIndex = -1;
  let inInsertionRun = false;
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    let old = oldByKey.get(source.key);
    if (old && usedOld.has(old)) old = undefined;
    if (old && old.sourceHash !== source.hash && sourceHashes.has(old.sourceHash)) old = undefined;
    const exactHashOld = record.blocks.find(
      (candidate) => !usedOld.has(candidate) && candidate.sourceHash === source.hash,
    );
    if (exactHashOld && (!old || old.sourceHash !== source.hash)) old = exactHashOld;
    if (!old) {
      const fallback = record.blocks[i];
      if (fallback && !usedOld.has(fallback) && fallback.sourceHash === source.hash) old = fallback;
    }
    if (old) {
      usedOld.add(old);
      const targetIndex = targetIndexByKey.get(old.key) ?? -1;
      if (targetIndex >= 0) {
        inInsertionRun = false;
        const target = targets[targetIndex];
        const humanEdited = old.humanEdited || target.hash !== old.targetHash;
        const sourceChanged = source.hash !== old.sourceHash;
        if (sourceChanged && !humanEdited) {
          edits.push({
            start: target.startOffset,
            end: target.endOffset,
            raw: source.raw,
            priority: 0,
          });
          states.push({
            key: source.key,
            sourceHash: source.hash,
            targetHash: source.hash,
            humanEdited,
          });
          changedBlocks += 1;
        } else if (sourceChanged && humanEdited) {
          states.push({
            key: source.key,
            sourceHash: old.sourceHash,
            targetHash: target.hash,
            humanEdited,
          });
          protectedBlocks += 1;
        } else {
          states.push({
            key: source.key,
            sourceHash: source.hash,
            targetHash: target.hash,
            humanEdited,
          });
          if (humanEdited && source.key !== old.key) protectedBlocks += 1;
        }
        lastTargetIndex = targetIndex;
        continue;
      }
    }
    const at =
      lastTargetIndex >= 0
        ? targets[lastTargetIndex].endOffset
        : (targets[0]?.startOffset ?? targetContent.length);
    const group = insertions.get(at) ?? [];
    group.push(source.raw);
    insertions.set(at, group);
    states.push({
      key: source.key,
      sourceHash: source.hash,
      targetHash: source.hash,
      humanEdited: false,
    });
    if (!inInsertionRun) changedBlocks += 1;
    inInsertionRun = true;
  }
  const deletions: Array<{ start: number; end: number }> = [];
  let inDeletionRun = false;
  record.blocks.forEach((old) => {
    if (usedOld.has(old)) {
      inDeletionRun = false;
      return;
    }
    const targetIndex = targetIndexByKey.get(old.key) ?? -1;
    if (targetIndex < 0) {
      inDeletionRun = false;
      return;
    }
    const target = targets[targetIndex];
    const human = old.humanEdited || target.hash !== old.targetHash;
    if (human) {
      states.push({ ...old, humanEdited: true, targetHash: target.hash });
      protectedBlocks += 1;
      inDeletionRun = false;
      return;
    }
    const start =
      targetIndex + 1 < targets.length
        ? target.startOffset
        : targetIndex > 0
          ? targets[targetIndex - 1].endOffset
          : 0;
    const end =
      targetIndex + 1 < targets.length ? targets[targetIndex + 1].startOffset : target.endOffset;
    deletions.push({ start, end });
    if (!inDeletionRun) changedBlocks += 1;
    inDeletionRun = true;
  });
  deletions.sort((a, b) => a.start - b.start);
  const mergedDeletions: typeof deletions = [];
  for (const range of deletions) {
    const previous = mergedDeletions.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else mergedDeletions.push({ ...range });
  }
  edits.push(...mergedDeletions.map((range) => ({ ...range, raw: "", priority: 0 as const })));
  for (const [at, chunks] of [...insertions.entries()].sort(([a], [b]) => b - a)) {
    const joined = chunks.join("\n\n");
    const insertion =
      targets.length === 0
        ? joined
        : at === targets[0].startOffset
          ? `${joined}\n\n`
          : `\n\n${joined}`;
    edits.push({ start: at, end: at, raw: insertion, priority: 1 });
  }
  let content = targetContent;
  edits.sort((a, b) => b.start - a.start || a.priority - b.priority);
  for (const edit of edits)
    content = content.slice(0, edit.start) + edit.raw + content.slice(edit.end);
  const nextSourceHash = languageContentHash(sourceContent);
  const stale = protectedBlocks > 0;
  return {
    content,
    record: {
      ...record,
      sourceHash: stale ? record.sourceHash : nextSourceHash,
      updatedAt: now ?? new Date().toISOString(),
      stale,
      humanEditedBlocks: [
        ...new Set(states.filter((state) => state.humanEdited).map((state) => state.key)),
      ],
      blocks: states,
    },
    changedBlocks,
    protectedBlocks,
  };
}
