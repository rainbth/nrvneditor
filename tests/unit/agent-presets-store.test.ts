import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  patches: [] as unknown[],
  loadedThreadKeys: [] as string[],
  savedThreadKeys: [] as string[],
}));

vi.mock("../../src/lib/ipc", () => ({
  nrvn: {
    settings: {
      patch: async (input: unknown) => {
        host.patches.push(input);
      },
    },
    agent: {
      loadThread: async (_root: string, docKey: string) => {
        host.loadedThreadKeys.push(docKey);
        return { sessionID: null, messages: [], proposal: null };
      },
      saveThread: async (_root: string, docKey: string) => {
        host.savedThreadKeys.push(docKey);
      },
      registerSession: async () => {},
      interrupt: async () => {},
    },
    workspace: { onFileSaved: () => () => {} },
  },
}));

import type { AgentPreset } from "../../electron/types";
import { useAgentStore } from "../../src/store/agent";

const model = { providerID: "p", id: "m" };
const preset = (id: string, modelValue = model): AgentPreset => ({
  id,
  name: id,
  agent: "nrvn-editor",
  model: modelValue,
  instruction: "",
});

beforeEach(() => {
  vi.clearAllMocks();
  host.patches = [];
  host.loadedThreadKeys = [];
  host.savedThreadKeys = [];
  useAgentStore.setState({
    agent: "nrvn-editor",
    model: null,
    presets: [],
    presetId: null,
    sessionScope: "document",
    sessionID: null,
    docKey: "document.md",
    thread: { sessionID: null, messages: [], proposal: null },
  });
});

describe("agent preset store actions", () => {
  it("no reinicia sesión si el preset conserva agente y modelo por valor", () => {
    useAgentStore.setState({
      model: { ...model },
      sessionID: "ses_actual",
      presets: [preset("actual")],
    });

    useAgentStore.getState().setPreset("actual");

    expect(useAgentStore.getState().sessionID).toBe("ses_actual");
  });

  it("reinicia sesión al aplicar un modelo distinto", () => {
    useAgentStore.setState({
      model,
      sessionID: "ses_actual",
      presets: [preset("otro", { providerID: "p", id: "otro" })],
    });

    useAgentStore.getState().setPreset("otro");

    expect(useAgentStore.getState().sessionID).toBeNull();
    expect(useAgentStore.getState().model).toEqual({ providerID: "p", id: "otro" });
  });

  it("persiste el scope workspace y usa su clave de hilo", async () => {
    useAgentStore.getState().setSessionScope("workspace");
    await useAgentStore.getState().saveThreadBestEffort();

    expect(host.patches).toContainEqual({
      agent: expect.objectContaining({ sessionScope: "workspace" }),
    });
    expect(host.loadedThreadKeys).toEqual(["__workspace__"]);
    expect(host.savedThreadKeys).toEqual(["__workspace__"]);
  });

  it("elimina el preset activo y persiste su selección nula", () => {
    useAgentStore.setState({ presets: [preset("activo")], presetId: "activo" });

    useAgentStore.getState().deletePreset("activo");

    expect(useAgentStore.getState().presets).toEqual([]);
    expect(useAgentStore.getState().presetId).toBeNull();
    expect(host.patches).toContainEqual({
      agent: expect.objectContaining({ preset: null, presets: [] }),
    });
  });
});
