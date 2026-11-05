import { describe, expect, it } from "vitest";
import { settingsSchema } from "../../electron/types";
import { clampTreeOutlineRatio, treeSplitBounds } from "../../src/lib/panel-heights";

describe("page layout settings", () => {
  it("defaults to Letter and validates presets plus splitter ratio", () => {
    const settings = settingsSchema.parse({});
    expect(settings.render.pageSize).toBe("letter");
    expect(settings.panelHeights.treeOutline).toBe(0.5);
    expect(settingsSchema.safeParse({ render: { pageSize: "a4" } }).success).toBe(true);
    expect(settingsSchema.safeParse({ panelHeights: { treeOutline: 1.1 } }).success).toBe(false);
  });

  it("clamps the outline zone to pixel and proportional limits", () => {
    expect(clampTreeOutlineRatio(0.9, 1000)).toBe(0.7);
    expect(clampTreeOutlineRatio(0.01, 1000)).toBeCloseTo(0.3);
    expect(clampTreeOutlineRatio(0.9, 1000)).toBe(0.7);
    expect(clampTreeOutlineRatio(0.01, 300)).toBe(0.4);
    expect(clampTreeOutlineRatio(0.9, 300)).toBe(0.6);
    expect(clampTreeOutlineRatio(0.9, 200)).toBe(0.5);
    expect(treeSplitBounds(1000).min).toBeCloseTo(0.3);
    expect(treeSplitBounds(1000).max).toBeCloseTo(0.7);
  });
});
