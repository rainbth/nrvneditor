import { describe, expect, it } from "vitest";
import {
  clampTreeOutlineRatio,
  MAX_TREE_ZONE_RATIO,
  MIN_TREE_ZONE,
  treeSplitBounds,
} from "../../src/lib/panel-heights";

describe("tree and outline split bounds", () => {
  it("sets the minimum zone and maximum tree ratio", () => {
    expect(MIN_TREE_ZONE).toBe(120);
    expect(MAX_TREE_ZONE_RATIO).toBe(0.7);
  });

  it("bounds a 1000px split, preserves minimum zones, and clamps ratios", () => {
    expect(treeSplitBounds(1000).min).toBeCloseTo(0.3);
    expect(treeSplitBounds(1000).max).toBeCloseTo(0.7);
    expect(clampTreeOutlineRatio(0.9, 1000)).toBe(0.7);
    expect(clampTreeOutlineRatio(0.01, 1000)).toBeCloseTo(0.3);
    expect(treeSplitBounds(1000).min * 1000).toBeGreaterThanOrEqual(MIN_TREE_ZONE);
    expect((1 - treeSplitBounds(1000).max) * 1000).toBeGreaterThanOrEqual(MIN_TREE_ZONE);
  });

  it("preserves 120px minimum zones when available and falls back when not", () => {
    expect(clampTreeOutlineRatio(0.01, 300)).toBe(0.4);
    expect(clampTreeOutlineRatio(0.9, 300)).toBe(0.6);
    expect(treeSplitBounds(200)).toEqual({ min: 0.5, max: 0.5 });
    expect(clampTreeOutlineRatio(Number.NaN, 1000)).toBe(0.5);
    expect(treeSplitBounds(Number.NaN)).toEqual({ min: 0.5, max: 0.5 });
    expect(treeSplitBounds(Number.POSITIVE_INFINITY)).toEqual({ min: 0.5, max: 0.5 });
    expect(treeSplitBounds(100)).toEqual({ min: 0.5, max: 0.5 });
  });

  it("allows both zones to reach 120px within the 70% cap at 600px", () => {
    const bounds = treeSplitBounds(600);
    expect(bounds.min).toBeLessThanOrEqual(1 - MIN_TREE_ZONE / 600);
    expect(bounds.max).toBeLessThanOrEqual(MAX_TREE_ZONE_RATIO);
    expect(bounds.min * 600).toBeGreaterThanOrEqual(MIN_TREE_ZONE);
    expect((1 - bounds.max) * 600).toBeGreaterThanOrEqual(MIN_TREE_ZONE);
    expect(treeSplitBounds(600).min * 600).toBeGreaterThanOrEqual(MIN_TREE_ZONE);
    expect((1 - treeSplitBounds(600).max) * 600).toBeGreaterThanOrEqual(MIN_TREE_ZONE);
  });
});
