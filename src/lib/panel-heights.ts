export const MIN_TREE_ZONE = 120;
export const MAX_TREE_ZONE_RATIO = 0.7;

export interface TreeSplitBounds {
  min: number;
  max: number;
}

export function treeSplitBounds(available: number): TreeSplitBounds {
  if (!Number.isFinite(available) || available < 2 * MIN_TREE_ZONE) {
    return { min: 0.5, max: 0.5 };
  }
  const min = Math.max(1 - MAX_TREE_ZONE_RATIO, MIN_TREE_ZONE / available);
  const max = Math.min(MAX_TREE_ZONE_RATIO, 1 - MIN_TREE_ZONE / available);
  if (min > max) return { min: 0.5, max: 0.5 };
  return { min, max };
}

export function clampTreeOutlineRatio(ratio: number, available: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  const { min, max } = treeSplitBounds(available);
  return Math.min(max, Math.max(min, ratio));
}
