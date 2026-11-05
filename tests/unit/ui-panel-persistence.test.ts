import { afterEach, describe, expect, it, vi } from "vitest";

const patch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../src/lib/ipc", () => ({ nrvn: { settings: { patch } } }));

import { flushPanelPersistence, useUiStore } from "../../src/store/ui";

afterEach(() => {
  patch.mockClear();
  vi.unstubAllGlobals();
});

describe("panel persistence debounce", () => {
  it("flushes the latest visual values in one write", () => {
    useUiStore.getState().setTreeWidth(210);
    useUiStore.getState().setAgentWidth(340);
    useUiStore.getState().setTreeOutlineRatio(0.2);
    useUiStore.getState().setTreeWidth(230);
    useUiStore.getState().setTreeOutlineRatio(0.7);
    expect(useUiStore.getState().treeWidth).toBe(230);
    expect(useUiStore.getState().treeOutline).toBe(0.7);
    expect(patch).toHaveBeenCalledTimes(0);

    flushPanelPersistence();

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith({
      panelWidths: { tree: 230, agent: useUiStore.getState().agentWidth },
      panelHeights: { treeOutline: 0.7 },
    });
    flushPanelPersistence();
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("flushes on pagehide and ignores pointerup without pending work", () => {
    const listeners = new Map<string, EventListener>();
    const mockWindow = {
      innerWidth: 1000,
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    } as unknown as Window;
    vi.stubGlobal("window", mockWindow);

    useUiStore.getState().setTreeWidth(220);
    listeners.get("pagehide")?.(new Event("pagehide"));
    expect(patch).toHaveBeenCalledTimes(1);
    listeners.get("pointerup")?.(new Event("pointerup"));
    expect(patch).toHaveBeenCalledTimes(1);
  });
});
