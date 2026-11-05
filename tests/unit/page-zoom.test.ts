import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/ipc", () => ({
  nrvn: { settings: { patch: vi.fn(async (value: unknown) => value) } },
}));

import { nrvn } from "../../src/lib/ipc";
import {
  clampPageZoom,
  DEFAULT_PAGE_ZOOM,
  MAX_PAGE_ZOOM,
  MIN_PAGE_ZOOM,
  PAGE_ZOOM_STEP,
  useUiStore,
} from "../../src/store/ui";

describe("page zoom", () => {
  beforeEach(() => vi.mocked(nrvn.settings.patch).mockClear());

  it("clamps finite values to 50–200 and rounds to ten percent", () => {
    expect(clampPageZoom(Number.NaN)).toBe(DEFAULT_PAGE_ZOOM);
    expect(clampPageZoom(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PAGE_ZOOM);
    expect(clampPageZoom(20)).toBe(MIN_PAGE_ZOOM);
    expect(clampPageZoom(204)).toBe(MAX_PAGE_ZOOM);
    expect(clampPageZoom(124)).toBe(120);
    expect(clampPageZoom(126)).toBe(130);
    expect(PAGE_ZOOM_STEP).toBe(10);
  });

  it("persists zoom with the other render settings and provides step/reset actions", () => {
    useUiStore.getState().setPageZoom(130);
    expect(useUiStore.getState().pageZoom).toBe(130);
    expect(nrvn.settings.patch).toHaveBeenLastCalledWith({
      render: { font: "lato", lineNumbers: true, pageSize: "letter", zoom: 130 },
    });
    useUiStore.getState().zoomPageOut();
    expect(useUiStore.getState().pageZoom).toBe(120);
    useUiStore.getState().zoomPageIn();
    expect(useUiStore.getState().pageZoom).toBe(130);
    useUiStore.getState().zoomPageReset();
    expect(useUiStore.getState().pageZoom).toBe(DEFAULT_PAGE_ZOOM);
  });
});
