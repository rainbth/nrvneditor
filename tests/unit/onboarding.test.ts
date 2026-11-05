import { beforeEach, describe, expect, it, vi } from "vitest";

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("../../src/lib/ipc", () => ({ nrvn: { settings: { patch } } }));

import { ONBOARDING_STEPS } from "../../src/components/layout/OnboardingDialog";
import { useUiStore } from "../../src/store/ui";

describe("onboarding", () => {
  beforeEach(() => {
    useUiStore.setState({ onboardingOpen: false, onboardingDone: false });
  });

  it("opens on request and dismisses while persisting completion", async () => {
    patch.mockResolvedValue({});
    useUiStore.getState().openOnboarding();
    expect(useUiStore.getState().onboardingOpen).toBe(true);
    useUiStore.getState().dismissOnboarding();
    expect(useUiStore.getState().onboardingOpen).toBe(false);
    expect(useUiStore.getState().onboardingDone).toBe(true);
    expect(patch).toHaveBeenCalledWith({ onboarding: { done: true } });
    patch.mockReset();
  });

  it("contains the three onboarding instructions in order", () => {
    expect(ONBOARDING_STEPS).toEqual([
      "Abre una carpeta con tus documentos .md.",
      "Haz clic en un párrafo o sección para seleccionar el área de trabajo.",
      "Pide un cambio al agente y acepta, rechaza o pide ajustes sobre el diff.",
    ]);
  });
});
