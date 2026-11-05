import type { BlockComment, StoredCritique } from "../../electron/types";

export function commentsForBlock(
  comments: readonly BlockComment[],
  blockKey: string,
): BlockComment[] {
  return comments.filter((comment) => comment.blockKey === blockKey);
}
export function isCommentStale(comment: BlockComment, currentHash: string): boolean {
  return comment.blockHash !== currentHash;
}
export function isCritiqueStale(
  critique: StoredCritique,
  hashesByKey: Record<string, string>,
): boolean {
  return Object.entries(critique.blockHashes).some(([key, hash]) => hashesByKey[key] !== hash);
}
export function commentCountsByBlock(comments: readonly BlockComment[]): Record<string, number> {
  return comments.reduce<Record<string, number>>((counts, comment) => {
    counts[comment.blockKey] = (counts[comment.blockKey] ?? 0) + 1;
    return counts;
  }, {});
}
