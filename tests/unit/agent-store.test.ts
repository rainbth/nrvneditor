import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  thread: { sessionID: null, messages: [], proposal: null } as {
    sessionID: string | null;
    messages: unknown[];
    proposal: unknown;
  },
  prompts: [] as string[],
  appliedDocuments: [] as { relPath: string; content: string }[],
  savedThreads: [] as unknown[],
  savedThreadKeys: [] as string[],
  savedThreadImpl: null as (() => Promise<void>) | null,
  loadedThreadKeys: [] as string[],
  loadThreadImpl: null as (() => Promise<unknown>) | null,
  oauthCancelled: [] as string[],
  registerSessions: [] as string[],
  interrupts: [] as string[],
  persistedModels: [] as unknown[],
  eventHandler: null as ((event: unknown) => void) | null,
  oauthStartImpl: null as (() => Promise<unknown>) | null,
  createSessionImpl: null as (() => Promise<{ sessionID: string }>) | null,
  connectStatus: {
    state: "ready",
    mode: "auto",
    runtime: "local",
  } as Record<string, unknown>,
  saveBlockVersions: vi.fn(async () => undefined),
  loadAnnotations: vi.fn(async () => ({
    exists: false,
    history: [],
    comments: [],
    critiques: [],
    blockVersions: [],
  })),
}));

vi.mock("../../src/lib/ipc", () => ({
  nrvn: {
    agent: {
      loadThread: async (_root: string, docKey: string) => {
        host.loadedThreadKeys.push(docKey);
        return host.loadThreadImpl === null ? host.thread : host.loadThreadImpl();
      },
      saveThread: async (_root: string, docKey: string, thread: unknown) => {
        host.savedThreadKeys.push(docKey);
        host.savedThreads.push(thread);
        if (host.savedThreadImpl !== null) await host.savedThreadImpl();
      },
      connect: async () => host.connectStatus,
      getStatus: async () => host.connectStatus,
      createSession: async () =>
        host.createSessionImpl === null ? { sessionID: "ses_test" } : host.createSessionImpl(),
      prompt: async (input: { text: string }) => {
        host.prompts.push(input.text);
      },
      applyDocument: async (input: { relPath: string; content: string }) => {
        host.appliedDocuments.push({ relPath: input.relPath, content: input.content });
        return {
          ok: true,
          mtimeMs: 1,
          hash: "h",
          snapshotPath: "mock://snapshots/x",
        };
      },
      refresh: async () => ({ state: "ready", mode: "auto", runtime: "local" }),
      getAccount: async () => ({
        id: "acc",
        label: "demo@nrvn.local",
        email: "demo@nrvn.local",
      }),
      onEvent: (handler: (event: unknown) => void) => {
        host.eventHandler = handler;
        return () => {
          host.eventHandler = null;
        };
      },
      oauthStart: async () =>
        host.oauthStartImpl === null
          ? {
              attemptID: "attempt_1",
              url: "https://opencode.ai/console/device?user_code=TEST",
              instructions: "Enter code: TEST",
              mode: "auto",
              expiresAt: null,
            }
          : host.oauthStartImpl(),
      oauthStatus: async () => ({ status: "pending" }),
      oauthCancel: async (input: { attemptID: string }) => {
        host.oauthCancelled.push(input.attemptID);
      },
      interrupt: async (input: { sessionID: string }) => {
        host.interrupts.push(input.sessionID);
      },
      registerSession: async (input: { sessionID: string }) => {
        host.registerSessions.push(input.sessionID);
      },
    },
    settings: {
      get: async () => ({
        agent: { mode: "embedded", model: null, agent: "nrvn-editor" },
        panels: { agent: false },
      }),
      patch: async (partial: { agent?: { model?: unknown } }) => {
        if (partial.agent?.model !== undefined) host.persistedModels.push(partial.agent.model);
        return {};
      },
    },
    workspace: { onFileSaved: () => () => {} },
    pending: { save: async () => undefined, load: async () => [] },
    annotations: {
      saveBlockVersions: host.saveBlockVersions,
      load: host.loadAnnotations,
      appendHistory: vi.fn(async () => undefined),
      saveComments: vi.fn(async () => undefined),
      saveCritiques: vi.fn(async () => undefined),
    },
  },
}));

import type { AgentProposal } from "../../electron/types";
import { markThreadMigration } from "../../src/lib/agent-session";
import { splitBlocks } from "../../src/lib/blocks";
import { useAgentStore } from "../../src/store/agent";
import { useAnnotationsStore } from "../../src/store/annotations";
import { useDocumentStore } from "../../src/store/document";
import { useSelectionStore } from "../../src/store/selection";
import { useUiStore } from "../../src/store/ui";

const revision: AgentProposal = {
  id: "proposal_1",
  createdAt: 1,
  prompt: "cambia algo",
  blocks: [{ key: "#paragraph:0", before: "uno", after: "dos" }],
};

const block = {
  key: "#paragraph:0",
  type: "paragraph" as const,
  headingPath: [],
  ordinal: 0,
  startLine: 0,
  endLine: 0,
  startOffset: 0,
  endOffset: 3,
  raw: "uno",
  hash: "h",
};

beforeEach(() => {
  host.thread = { sessionID: null, messages: [], proposal: null };
  host.prompts = [];
  host.appliedDocuments = [];
  host.savedThreads = [];
  host.savedThreadKeys = [];
  host.savedThreadImpl = null;
  host.loadedThreadKeys = [];
  host.loadThreadImpl = null;
  host.oauthCancelled = [];
  host.registerSessions = [];
  host.interrupts = [];
  host.persistedModels = [];
  host.oauthStartImpl = null;
  host.createSessionImpl = null;
  host.connectStatus = { state: "ready", mode: "auto", runtime: "local" };
  useDocumentStore.setState({
    localId: "doc-test",
    path: null,
    content: "",
    original: "",
    blocks: [],
    outline: [],
    dirty: false,
    saving: false,
    saveState: "saved",
    saveError: null,
    lastSavedAt: null,
    lastWriteHash: null,
    error: null,
    loadMs: null,
    status: "ready",
    pending: [],
  });
  useSelectionStore.getState().clear();
  useAgentStore.setState({
    revision: null,
    audience: null,
    review: null,
    fittingReview: null,
    fittingBusy: false,
    fittingError: null,
    reviewLens: null,
    reviewLensUsed: null,
    pendingReview: null,
    variantFromReview: false,
    revisionRequested: false,
    lastRejected: null,
    lastAgentBlock: null,
    instruction: "",
    promptError: null,
    proposalError: null,
    status: { state: "disconnected", mode: "embedded" },
    sessionID: null,
    thread: { sessionID: null, messages: [], proposal: null },
    busy: false,
    applying: false,
    contextMode: "document",
    account: null,
    oauth: { status: "idle", attemptID: null, url: null, instructions: null, error: null },
  });
});

async function installEvents(): Promise<void> {
  if (host.eventHandler === null) await useAgentStore.getState().hydrate();
}

describe("agent store · revision ligada al documento/modelo/agente", () => {
  const fittingReview = (blocks = [block.key]) => ({
    audience: "editor",
    blocks,
    works: [],
    problems: [],
    suggestions: [],
    fitting: null,
  });

  it("requestFitting pide un bloque y abre la vista previa tras la respuesta", async () => {
    await installEvents();
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      sessionID: "ses_test",
      thread: { sessionID: "ses_test", messages: [], proposal: null },
      reviewLensUsed: "problems",
      review: {
        audience: "editor",
        blocks: [block.key],
        works: [],
        problems: [],
        suggestions: [],
        fitting: null,
      },
    });
    await useAgentStore.getState().requestFitting();
    expect(host.prompts[0]).toContain("Sugerencia de mejora para el párrafo revisado.");
    const sessionID = useAgentStore.getState().sessionID;
    host.eventHandler?.({
      type: "delta",
      sessionID: sessionID ?? "ses_test",
      delta: `<<<NRVN_BLOCK key="${block.key}">>>\nMejora concreta.\n<<<NRVN_END>>>`,
    });
    host.eventHandler?.({ type: "done", sessionID: sessionID ?? "ses_test" });
    expect(useAgentStore.getState().blockPreview?.proposed).toBe("Mejora concreta.");
    expect(useAgentStore.getState().fittingReview?.fitting).toBe("Mejora concreta.");
    expect(useAgentStore.getState().review).toBeNull();
    expect(useAgentStore.getState().fittingBusy).toBe(false);
    expect(useAgentStore.getState().fittingError).toBeNull();
    expect(host.appliedDocuments).toHaveLength(0);
  });

  it("requestFitting restaura la revisión si la respuesta no cumple el contrato", async () => {
    await installEvents();
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    const review = {
      audience: "editor",
      blocks: [block.key],
      works: [],
      problems: [],
      suggestions: [],
      fitting: null,
    };
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      sessionID: "ses_test",
      thread: { sessionID: "ses_test", messages: [], proposal: null },
      review,
      reviewLensUsed: "problems",
    });
    await useAgentStore.getState().requestFitting();
    const sessionID = useAgentStore.getState().sessionID ?? "ses_test";
    host.eventHandler?.({ type: "delta", sessionID, delta: "texto plano inválido" });
    host.eventHandler?.({ type: "done", sessionID });
    const state = useAgentStore.getState();
    expect(state.fittingError).not.toBeNull();
    expect(state.fittingBusy).toBe(false);
    expect(state.review).toEqual(review);
    expect(state.blockPreview).toBeNull();
    expect(host.appliedDocuments).toHaveLength(0);
  });

  it("requestFitting no envía otra petición si ya existe fitting", async () => {
    useAgentStore.setState({
      review: {
        audience: "editor",
        blocks: [block.key],
        works: [],
        problems: [],
        suggestions: [],
        fitting: "Ya existe.",
      },
    });
    const before = host.prompts.length;
    await useAgentStore.getState().requestFitting();
    expect(host.prompts).toHaveLength(before);
  });

  it("requestFitting rechaza revisión multi-bloque", async () => {
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      review: fittingReview([block.key, "otra"]),
    });
    const before = host.prompts.length;
    await useAgentStore.getState().requestFitting();
    expect(host.prompts).toHaveLength(before);
    expect(useAgentStore.getState().fittingError).not.toBeNull();
  });

  it("requestFitting rechaza un bloque que no sea párrafo ni cita", async () => {
    const heading = { ...block, type: "heading" as const };
    useDocumentStore.setState({ blocks: [heading], content: heading.raw, status: "ready" });
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      review: fittingReview(),
    });
    const before = host.prompts.length;
    await useAgentStore.getState().requestFitting();
    expect(host.prompts).toHaveLength(before);
    expect(useAgentStore.getState().fittingError).not.toBeNull();
  });

  it("requestFitting rechaza un agente desconectado y no hace prompt", async () => {
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useAgentStore.setState({
      status: { state: "disconnected", mode: "embedded" },
      review: fittingReview(),
    });
    const before = host.prompts.length;
    await useAgentStore.getState().requestFitting();
    expect(host.prompts).toHaveLength(before);
    expect(useAgentStore.getState().fittingError).not.toBeNull();
  });

  it("requestFitting no envía prompt mientras busy", async () => {
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      review: fittingReview(),
      busy: true,
    });
    const before = host.prompts.length;
    await useAgentStore.getState().requestFitting();
    expect(host.prompts).toHaveLength(before);
  });

  it("loadForDocument resetea busy y error de sugerencia en vuelo", async () => {
    useAgentStore.setState({
      fittingBusy: true,
      fittingError: "error antiguo",
      blockPreview: {
        blockKey: block.key,
        original: block.raw,
        proposed: "x",
        source: "review",
        proposalId: null,
      },
      fittingReview: fittingReview(),
    });
    await useAgentStore.getState().loadForDocument("otro.md");
    expect(useAgentStore.getState().fittingBusy).toBe(false);
    expect(useAgentStore.getState().fittingError).toBeNull();
  });

  it("clearReview durante sugerencia ignora un done tardío", async () => {
    await installEvents();
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      sessionID: "ses_test",
      review: fittingReview(),
    });
    await useAgentStore.getState().requestFitting();
    const sessionID = useAgentStore.getState().sessionID ?? "ses_test";
    useAgentStore.getState().clearReview();
    host.eventHandler?.({
      type: "delta",
      sessionID,
      delta: `<<<NRVN_BLOCK key="${block.key}">>>\nTexto tardío\n<<<NRVN_END>>>`,
    });
    host.eventHandler?.({ type: "done", sessionID });
    expect(useAgentStore.getState().review).toBeNull();
    expect(useAgentStore.getState().blockPreview).toBeNull();
  });

  it("clearReview cancela el último mensaje streaming y guarda el hilo", async () => {
    useAgentStore.setState({
      busy: true,
      fittingBusy: true,
      thread: {
        sessionID: "ses_test",
        proposal: null,
        messages: [
          {
            id: "assistant-streaming",
            role: "assistant",
            text: "Escribiendo…",
            createdAt: 1,
            status: "streaming",
          },
        ],
      },
    });
    useAgentStore.getState().clearReview();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useAgentStore.getState().thread.messages.at(-1)?.status).toBe("cancelled");
    expect(host.savedThreads).toHaveLength(1);
  });

  it("sanea fences y encabezados antes de aceptar una sugerencia", async () => {
    await installEvents();
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      sessionID: "ses_test",
      review: fittingReview(),
    });
    await useAgentStore.getState().requestFitting();
    const sessionID = useAgentStore.getState().sessionID ?? "ses_test";
    host.eventHandler?.({
      type: "delta",
      sessionID,
      delta: `<<<NRVN_BLOCK key="${block.key}">>>\n\`\`\`markdown\n# T\nTexto limpio\n\`\`\`\n<<<NRVN_END>>>`,
    });
    host.eventHandler?.({ type: "done", sessionID });
    expect(useAgentStore.getState().blockPreview?.proposed).toBe("T Texto limpio");
    useAgentStore.getState().acceptFittingPreview();
    expect(useDocumentStore.getState().content).toBe("T Texto limpio");
  });

  it("loadForDocument limpia la revisión y los errores pendientes", async () => {
    useAgentStore.setState({
      revision,
      instruction: "Revisa la propuesta anterior: ",
      promptError: "error previo",
      proposalError: { raw: "raw", reason: "motivo" },
    });

    await useAgentStore.getState().loadForDocument("notas.md");

    const state = useAgentStore.getState();
    expect(state.revision).toBeNull();
    expect(state.instruction).toBe("");
    expect(state.promptError).toBeNull();
    expect(state.proposalError).toBeNull();
    expect(state.docKey).toBe("notas.md");
  });

  it("setModel no arrastra la propuesta rechazada", () => {
    useAgentStore.setState({ revision });
    useAgentStore.getState().setModel({ providerID: "p", id: "m" });
    expect(useAgentStore.getState().revision).toBeNull();
  });

  it("setAgent no arrastra la propuesta rechazada", () => {
    useAgentStore.setState({ revision });
    useAgentStore.getState().setAgent("otro-agente");
    expect(useAgentStore.getState().revision).toBeNull();
  });

  it("send incluye la revisión en el prompt y la limpia después", async () => {
    useAgentStore.setState({
      revision,
      instruction: "Revisa la propuesta anterior: hazla más corta",
      status: { state: "ready", mode: "embedded" },
    });

    await useAgentStore.getState().send({
      blocks: [block],
      headingTrail: [],
      path: "notas.md",
    });

    expect(host.prompts).toHaveLength(1);
    expect(host.prompts[0]).toContain("Propuesta anterior (rechazada):");
    expect(useAgentStore.getState().revision).toBeNull();
  });

  it("send sin revisión no incluye la sección de propuesta anterior", async () => {
    useAgentStore.setState({
      revision: null,
      instruction: "Cambia esto",
      status: { state: "ready", mode: "embedded" },
    });

    await useAgentStore.getState().send({
      blocks: [block],
      headingTrail: [],
      path: "notas.md",
    });

    expect(host.prompts).toHaveLength(1);
    expect(host.prompts[0]).not.toContain("Propuesta anterior (rechazada):");
  });

  it("reviewWithAudience publica una revisión y nunca crea propuesta", async () => {
    await installEvents();
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useSelectionStore.getState().selectBlock(0);
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      audience: null,
      fittingError: "error de sugerencia anterior",
    });
    await useAgentStore.getState().reviewWithAudience("editor");
    expect(host.prompts[0]).toContain("NRVN_REVIEW");
    expect(useAgentStore.getState().pendingReview).toEqual({
      audience: "editor",
      blockKey: block.key,
    });
    host.eventHandler?.({
      type: "delta",
      sessionID: "ses_test",
      delta: `<<<NRVN_REVIEW>>>{"audience":"editor","blocks":["${block.key}"],"works":["Ok"],"problems":[],"suggestions":["Sigue"]}<<<NRVN_END>>>`,
    });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });
    const state = useAgentStore.getState();
    expect(state.review?.audience).toBe("editor");
    expect(state.review?.works).toHaveLength(1);
    expect(state.fittingError).toBeNull();
    expect(state.thread.proposal).toBeNull();
    expect(host.appliedDocuments).toHaveLength(0);
  });

  it("previewFitting muestra el fitting sin propuesta ni cambios de documento", () => {
    const content = "uno";
    useDocumentStore.setState({ blocks: [block], content, original: content, status: "ready" });
    const review = {
      audience: "editor",
      blocks: [block.key],
      works: ["Ok"],
      problems: [],
      suggestions: [],
      fitting: "mejor",
    };
    useAgentStore.setState({ review, fittingError: "error de sugerencia anterior" });
    const pendingAntes = useDocumentStore.getState().pending;
    useAgentStore.getState().previewFitting();
    const state = useAgentStore.getState();
    expect(state.thread.proposal).toBeNull();
    expect(state.blockPreview).toEqual({
      blockKey: block.key,
      original: block.raw,
      proposed: "mejor",
      source: "review",
      proposalId: null,
    });
    expect(state.fittingReview).toEqual(review);
    expect(state.fittingError).toBeNull();
    expect(host.appliedDocuments).toHaveLength(0);
    expect(useAgentStore.getState().pendingReview).toBeNull();
    expect(useAgentStore.getState().busy).toBe(false);
    expect(useDocumentStore.getState().pending).toEqual(pendingAntes);
    expect(useDocumentStore.getState().content).toBe(content);
    expect(state.review).toBeNull();
  });

  it("previewFitting informa si el bloque revisado ya no existe", () => {
    useDocumentStore.setState({ blocks: [], content: "", status: "ready" });
    useAgentStore.setState({
      review: {
        audience: "editor",
        blocks: ["clave-inexistente"],
        works: ["Ok"],
        problems: [],
        suggestions: [],
        fitting: "Un párrafo válido.",
      },
    });
    useAgentStore.getState().previewFitting();
    expect(useAgentStore.getState().thread.proposal).toBeNull();
    expect(useAgentStore.getState().promptError).toBe(
      "El bloque revisado ya no existe; repite la revisión.",
    );
  });

  it("previewFitting exige una revisión de un solo bloque", () => {
    useAgentStore.setState({
      review: {
        audience: "editor",
        blocks: [block.key, "b"],
        works: ["Ok"],
        problems: [],
        suggestions: [],
        fitting: "Mejor.",
      },
    });
    useAgentStore.getState().previewFitting();
    expect(useAgentStore.getState().thread.proposal).toBeNull();
    expect(useAgentStore.getState().promptError).toContain("un solo bloque");
  });

  it("previewFitting rechaza bloques que no sean párrafo o cita", () => {
    const heading = { ...block, type: "heading" as const };
    useDocumentStore.setState({ blocks: [heading], content: heading.raw, status: "ready" });
    useAgentStore.setState({
      review: {
        audience: "editor",
        blocks: [heading.key],
        works: ["Ok"],
        problems: [],
        suggestions: [],
        fitting: "Mejor.",
      },
    });
    useAgentStore.getState().previewFitting();
    expect(useAgentStore.getState().thread.proposal).toBeNull();
    expect(useAgentStore.getState().promptError).toContain("párrafos y citas");
  });

  it("previewFitting sin párrafo propuesto da error; aceptar y descartar son reversibles", () => {
    useAgentStore.setState({
      review: {
        audience: "editor",
        blocks: [block.key],
        works: ["Ok"],
        problems: [],
        suggestions: [],
        fitting: null,
      },
    });
    useAgentStore.getState().previewFitting();
    expect(useAgentStore.getState().thread.proposal).toBeNull();
    expect(useAgentStore.getState().promptError).toBe(
      "No hay un párrafo propuesto para este cambio.",
    );
    expect(useAgentStore.getState().fittingError).toBe(
      "No hay un párrafo propuesto para este cambio.",
    );
    useAgentStore.setState({
      review: {
        audience: "editor",
        blocks: [block.key],
        works: ["Ok"],
        problems: [],
        suggestions: [],
        fitting: "mejor",
      },
    });
    useDocumentStore.setState({
      blocks: [block],
      content: block.raw,
      original: block.raw,
      status: "ready",
    });
    useAgentStore.getState().previewFitting();
    useAgentStore.getState().acceptFittingPreview();
    expect(useDocumentStore.getState().content).toBe("mejor");
    expect(useAgentStore.getState().blockPreview).toBeNull();
    expect(useAgentStore.getState().review?.fitting).toBe("mejor");
    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().content).toBe(block.raw);
    useAgentStore.setState({
      review: {
        audience: "editor",
        blocks: [block.key],
        works: ["Ok"],
        problems: [],
        suggestions: [],
        fitting: "otro",
      },
    });
    useAgentStore.getState().previewFitting();
    const priorReview = useAgentStore.getState().fittingReview;
    useAgentStore.getState().discardFittingPreview();
    expect(useDocumentStore.getState().content).toBe(block.raw);
    expect(useAgentStore.getState().blockPreview).toBeNull();
    expect(useAgentStore.getState().review).toEqual(priorReview);
    expect(useAgentStore.getState().fittingReview).toBeNull();
  });

  it("dismissFittingPreview limpia sin restaurar revisión", () => {
    useAgentStore.setState({
      blockPreview: {
        blockKey: block.key,
        original: block.raw,
        proposed: "mejor",
        source: "review",
        proposalId: null,
      },
      fittingReview: {
        audience: "editor",
        blocks: [block.key],
        works: ["Ok"],
        problems: [],
        suggestions: [],
        fitting: "mejor",
      },
      review: null,
    });
    useAgentStore.getState().dismissFittingPreview();
    expect(useAgentStore.getState().blockPreview).toBeNull();
    expect(useAgentStore.getState().review).toBeNull();
  });

  it("acceptFittingPreview rechaza un bloque cambiado y conserva el prefijo de cita", () => {
    useDocumentStore.setState({
      blocks: [{ ...block, raw: "cambió" }],
      content: "cambió",
      status: "ready",
    });
    useAgentStore.setState({
      blockPreview: {
        blockKey: block.key,
        original: block.raw,
        proposed: "mejor",
        source: "review",
        proposalId: null,
      },
    });
    useAgentStore.getState().acceptFittingPreview();
    expect(useDocumentStore.getState().content).toBe("cambió");
    expect(useAgentStore.getState().error).toBe(
      "El bloque cambió desde la vista previa; repite la revisión.",
    );

    const quote = { ...block, type: "quote" as const, raw: "> original", endOffset: 10 };
    useDocumentStore.setState({ blocks: [quote], content: quote.raw, status: "ready" });
    useAgentStore.setState({
      blockPreview: {
        blockKey: quote.key,
        original: quote.raw,
        proposed: "> nueva línea",
        source: "review",
        proposalId: null,
      },
    });
    useAgentStore.getState().acceptFittingPreview();
    expect(useDocumentStore.getState().content).toBe("> nueva línea");
  });

  it("propaga la lente al prompt y al resultado y la limpia al cambiar de hilo o desconectar", async () => {
    await installEvents();
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useSelectionStore.getState().selectBlock(0);
    useAgentStore.setState({ status: { state: "ready", mode: "embedded" }, audience: null });

    await useAgentStore.getState().reviewWithAudience("editor", "questions");

    expect(host.prompts[0]).toContain("Lente de revisión: Qué preguntaría (id: questions)");
    expect(host.prompts[0]).not.toContain("Analiza el texto y devuelve los tres bloques");
    host.eventHandler?.({
      type: "delta",
      sessionID: "ses_test",
      delta: `<<<NRVN_REVIEW>>>{"audience":"editor","blocks":["${block.key}"],"works":[],"problems":[],"suggestions":["¿Qué contexto falta?"]}<<<NRVN_END>>>`,
    });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });
    expect(useAgentStore.getState().reviewLensUsed).toBe("questions");

    await useAgentStore.getState().disconnect();
    expect(useAgentStore.getState().reviewLensUsed).toBeNull();
    useAgentStore.setState({ reviewLensUsed: "questions" });
    await useAgentStore.getState().loadForDocument("otro-doc.md");
    expect(useAgentStore.getState().reviewLensUsed).toBeNull();
  });

  it("reviewWithAudience resuelve el alias legacy y cierra el picker al desconectar", async () => {
    await installEvents();
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useSelectionStore.getState().selectBlock(0);
    useAgentStore.setState({ status: { state: "ready", mode: "embedded" }, audience: null });

    useAgentStore.getState().openReviewerPicker();
    await useAgentStore.getState().reviewWithAudience("producto");

    expect(useAgentStore.getState().pendingReview?.audience).toBe("pm");
    expect(host.prompts[0]).toContain("Id del revisor: pm");
    expect(useAgentStore.getState().reviewerPickerOpen).toBe(false);

    useAgentStore.getState().openReviewerPicker();
    await useAgentStore.getState().disconnect();

    const state = useAgentStore.getState();
    expect(state.reviewerPickerOpen).toBe(false);
    expect(state.review).toBeNull();
    expect(state.pendingReview).toBeNull();
  });

  it("createVariantFromReview genera una propuesta de cambio", async () => {
    await installEvents();
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useSelectionStore.getState().selectBlock(0);
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      review: {
        audience: "editor",
        blocks: [block.key],
        works: ["Ok"],
        problems: [{ severity: "media", issue: "Falta contexto", evidence: "Ambigua" }],
        suggestions: ["Añade ejemplo"],
      },
    });
    await useAgentStore.getState().createVariantFromReview();
    expect(host.prompts.at(-1)).toContain("Corrige lo que no funciona");
    expect(host.prompts.at(-1)).toContain("Añade ejemplo");
    expect(host.prompts.at(-1)).toContain(
      "Aplica solo los cambios necesarios para resolver los problemas listados. No toques el resto del bloque.",
    );
    expect(host.prompts.at(-1)).toContain("No reescribas bloques que ya funcionan");
    expect(useAgentStore.getState().variantFromReview).toBe(true);
    host.eventHandler?.({
      type: "delta",
      sessionID: "ses_test",
      delta: `<<<NRVN_BLOCK key="${block.key}">>>nuevo<<<NRVN_END>>>`,
    });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });
    const proposal = useAgentStore.getState().thread.proposal;
    expect(proposal).not.toBeNull();
    expect(proposal?.blocks[0]?.key).toBe(block.key);
  });

  it("restaura la revisión si la variante termina con contrato inválido", async () => {
    await installEvents();
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      review: {
        audience: "editor",
        blocks: [block.key],
        works: ["Ok"],
        problems: [],
        suggestions: [],
      },
    });

    await useAgentStore.getState().createVariantFromReview();
    host.eventHandler?.({ type: "delta", sessionID: "ses_test", delta: "JSON roto" });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });

    const state = useAgentStore.getState();
    expect(state.review).not.toBeNull();
    expect(state.variantFromReview).toBe(false);
    expect(state.proposalError).not.toBeNull();
  });

  it("restaura la revisión si la variante termina sin bloques", async () => {
    await installEvents();
    useDocumentStore.setState({ blocks: [block], content: block.raw, status: "ready" });
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      review: {
        audience: "editor",
        blocks: [block.key],
        works: ["Ok"],
        problems: [],
        suggestions: [],
      },
    });

    await useAgentStore.getState().createVariantFromReview();
    host.eventHandler?.({ type: "delta", sessionID: "ses_test", delta: "<<<NRVN_NO_CHANGE>>>" });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });

    const state = useAgentStore.getState();
    expect(state.review).not.toBeNull();
    expect(state.variantFromReview).toBe(false);
  });

  it("createVariantFromReview informa si hay una respuesta en curso o falta revisión", async () => {
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      busy: true,
      review: {
        audience: "editor",
        blocks: [block.key],
        works: [],
        problems: [],
        suggestions: [],
      },
    });
    await useAgentStore.getState().createVariantFromReview();
    expect(useAgentStore.getState().promptError).toContain("está respondiendo");

    useAgentStore.setState({ busy: false, review: null, promptError: null });
    await useAgentStore.getState().createVariantFromReview();
    expect(useAgentStore.getState().promptError).toContain("No hay una revisión");
  });

  it("no crea variante cuando ya no existen los bloques revisados", async () => {
    useDocumentStore.setState({ blocks: [], content: "", status: "ready" });
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      review: {
        audience: "editor",
        blocks: [block.key],
        works: ["Ok"],
        problems: [],
        suggestions: [],
      },
    });
    const promptsBefore = host.prompts.length;

    await useAgentStore.getState().createVariantFromReview();

    const state = useAgentStore.getState();
    expect(state.promptError).not.toBeNull();
    expect(host.prompts).toHaveLength(promptsBefore);
    expect(state.review).not.toBeNull();
  });

  it("cancelar invalida un envío mientras createSession sigue pendiente", async () => {
    let resolveCreate!: (value: { sessionID: string }) => void;
    let markCreateCalled!: () => void;
    const createCalled = new Promise<void>((resolve) => {
      markCreateCalled = resolve;
    });
    host.createSessionImpl = () => {
      markCreateCalled();
      return new Promise((resolve) => {
        resolveCreate = resolve;
      });
    };
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      instruction: "hola",
    });

    const sending = useAgentStore.getState().send({
      blocks: [block],
      headingTrail: [],
      path: "notas.md",
    });
    await createCalled;
    await useAgentStore.getState().cancel();
    resolveCreate({ sessionID: "ses_late" });
    await sending;

    expect(host.prompts).toHaveLength(0);
    expect(useAgentStore.getState().busy).toBe(false);
  });

  it("invalida revisión malformada sin aplicar contenido", async () => {
    await installEvents();
    useAgentStore.setState({
      instruction: "",
      status: { state: "ready", mode: "embedded" },
    });
    await useAgentStore.getState().send({
      blocks: [block],
      headingTrail: [],
      path: "notas.md",
      review: { audienceId: "editor" },
    });
    expect(host.prompts[0]).toContain("NRVN_REVIEW");
    host.eventHandler?.({ type: "delta", sessionID: "ses_test", delta: "JSON roto" });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });
    expect(useAgentStore.getState().proposalError).not.toBeNull();
    expect(useAgentStore.getState().thread.proposal).toBeNull();
    expect(host.appliedDocuments).toHaveLength(0);
  });

  it("requestChanges mantiene la propuesta visible y marca revisionRequested", () => {
    useAgentStore.setState({
      thread: { sessionID: null, messages: [], proposal: revision },
    });

    useAgentStore.getState().requestChanges();

    const state = useAgentStore.getState();
    expect(state.thread.proposal).toBe(revision);
    expect(state.revision).toBe(revision);
    expect(state.revisionRequested).toBe(true);
    expect(state.instruction).toBe("");
  });

  it("cancelRevision vuelve al estado activo sin borrar la propuesta", () => {
    useAgentStore.setState({
      thread: { sessionID: null, messages: [], proposal: revision },
    });
    useAgentStore.getState().requestChanges();
    useAgentStore.setState({ promptError: "error previo" });

    useAgentStore.getState().cancelRevision();

    const state = useAgentStore.getState();
    expect(state.thread.proposal).toBe(revision);
    expect(state.revision).toBeNull();
    expect(state.revisionRequested).toBe(false);
    expect(state.instruction).toBe("");
    expect(state.promptError).toBeNull();
  });

  it("send desde revisión limpia propuesta/revisión y adjunta previousProposal", async () => {
    useAgentStore.setState({
      thread: { sessionID: null, messages: [], proposal: revision },
      status: { state: "ready", mode: "embedded" },
    });
    useAgentStore.getState().requestChanges();
    useAgentStore.getState().setInstruction("Cambia el tono");

    await useAgentStore.getState().send({
      blocks: [block],
      headingTrail: [],
      path: "notas.md",
    });

    expect(host.prompts).toHaveLength(1);
    expect(host.prompts[0]).toContain("Propuesta anterior (rechazada):");
    const state = useAgentStore.getState();
    expect(state.thread.proposal).toBeNull();
    expect(state.revision).toBeNull();
    expect(state.revisionRequested).toBe(false);
  });

  it("send descarta la revisión si sus claves no están en la selección", async () => {
    const otherBlock = {
      ...block,
      key: "#paragraph:1",
      startOffset: 4,
      endOffset: 7,
      raw: "tres",
    };
    useAgentStore.setState({
      revision,
      instruction: "Cambia esto",
      status: { state: "ready", mode: "embedded" },
    });

    await useAgentStore.getState().send({
      blocks: [otherBlock],
      headingTrail: [],
      path: "notas.md",
    });

    expect(host.prompts).toHaveLength(1);
    expect(host.prompts[0]).not.toContain("Propuesta anterior (rechazada):");
    expect(useAgentStore.getState().revision).toBeNull();
  });

  it("requestChanges sin propuesta no entra en revisión", () => {
    useAgentStore.setState({
      thread: { sessionID: null, messages: [], proposal: null },
      revision,
      instruction: "texto previo",
    });

    useAgentStore.getState().requestChanges();

    const state = useAgentStore.getState();
    expect(state.thread.proposal).toBeNull();
    expect(state.revision).toBeNull();
    expect(state.revisionRequested).toBe(false);
    expect(state.instruction).toBe("");
  });

  it("send en modo documento permite un documento vacío", async () => {
    useAgentStore.setState({
      instruction: "Crea un documento",
      status: { state: "ready", mode: "embedded" },
      promptError: "error previo",
    });

    await useAgentStore.getState().send({
      blocks: [],
      headingTrail: [],
      path: null,
      mode: "document",
      documentContent: "",
      documentBlockCount: 0,
    });

    expect(host.prompts).toHaveLength(1);
    expect(host.prompts[0]).toContain("Modo: documento completo");
    expect(host.prompts[0]).toContain("Documento vacío (0 caracteres)");
    expect(useAgentStore.getState().promptError).toBeNull();
  });

  it("send en modo documento incluye el Markdown completo", async () => {
    const content = "# Guía\n\nTodo el texto.";
    useAgentStore.setState({
      instruction: "Reescribe",
      status: { state: "ready", mode: "embedded" },
    });

    await useAgentStore.getState().send({
      blocks: [],
      headingTrail: [],
      path: "guia.md",
      mode: "document",
      documentContent: content,
      documentBlockCount: 2,
    });

    expect(host.prompts).toHaveLength(1);
    expect(host.prompts[0]).toContain(content);
    expect(host.prompts[0]).toContain("<<<NRVN_DOCUMENT>>>");
    expect(host.prompts[0]).toContain("Bloques: 2");
  });

  it("send en modo selección sin bloques muestra promptError", async () => {
    useAgentStore.setState({
      instruction: "Cambia algo",
      status: { state: "ready", mode: "embedded" },
    });

    await useAgentStore.getState().send({
      blocks: [],
      headingTrail: [],
      path: null,
      mode: "selection",
    });

    expect(host.prompts).toHaveLength(0);
    expect(useAgentStore.getState().promptError).toBe(
      "Selecciona al menos un bloque para trabajar.",
    );
  });

  it("acceptProposal de documento reemplaza el borrador sin llamar a applyDocument", async () => {
    useDocumentStore.setState({ content: "antes", original: "antes", dirty: false });
    const documentProposal: AgentProposal = {
      id: "proposal_doc",
      createdAt: 1,
      prompt: "x",
      kind: "document",
      blocks: [],
      document: { before: "antes", after: "después" },
    };
    useAgentStore.setState({
      thread: { sessionID: null, messages: [], proposal: documentProposal },
      fittingReview: {
        audience: "editor",
        blocks: [],
        works: ["Ok"],
        problems: [],
        suggestions: [],
        fitting: null,
      },
    });

    await useAgentStore.getState().acceptProposal();

    expect(useDocumentStore.getState().content).toBe("después");
    expect(useAgentStore.getState().thread.proposal).toBeNull();
    expect(useAgentStore.getState().fittingReview).toBeNull();
    expect(host.appliedDocuments).toHaveLength(0);
  });

  it("acceptProposal registra versiones anteriores de todos los bloques", async () => {
    const blockA = {
      ...block,
      key: "#paragraph:0",
      startLine: 0,
      endLine: 0,
      startOffset: 0,
      endOffset: 1,
      raw: "a",
    };
    const blockB = {
      ...block,
      key: "#paragraph:1",
      ordinal: 1,
      startLine: 2,
      endLine: 2,
      startOffset: 3,
      endOffset: 4,
      raw: "b",
    };
    useAnnotationsStore.setState({ docKey: "doc.md", blockVersions: [] });
    useDocumentStore.setState({
      path: null,
      blocks: [blockA, blockB],
      content: "a\n\nb",
      status: "ready",
    });
    useAgentStore.setState({
      thread: {
        sessionID: null,
        messages: [],
        proposal: {
          id: "p1",
          createdAt: 1,
          prompt: "x",
          kind: "blocks",
          source: "chat",
          blocks: [
            { key: blockA.key, before: blockA.raw, after: "nuevo A" },
            { key: blockB.key, before: blockB.raw, after: "nuevo B" },
          ],
          document: null,
        },
      },
    });

    await useAgentStore.getState().acceptProposal();

    const versions = useAnnotationsStore.getState().blockVersions;
    expect(versions).toHaveLength(2);
    expect(versions.map((item) => item.raw).sort()).toEqual([blockA.raw, blockB.raw]);
    expect(versions.every((item) => item.source === "chat" && item.blockKey.length > 0)).toBe(true);
  });

  it("acceptProposal archiva el bloque seleccionado ante textos duplicados", async () => {
    const [first, second] = splitBlocks("repetido\n\nrepetido");
    if (!first || !second) throw new Error("faltan los bloques duplicados");
    useAnnotationsStore.setState({ docKey: "doc.md", blockVersions: [] });
    useDocumentStore.setState({
      path: null,
      blocks: [first, second],
      content: "repetido\n\nrepetido",
      status: "ready",
    });
    useSelectionStore.getState().selectBlock(1);
    useAgentStore.setState({
      thread: {
        sessionID: null,
        messages: [],
        proposal: {
          id: "p-duplicate",
          createdAt: 1,
          prompt: "cambia el segundo",
          kind: "blocks",
          source: "chat",
          blocks: [{ key: second.key, before: "repetido", after: "nuevo B" }],
          document: null,
        },
      },
    });

    await useAgentStore.getState().acceptProposal();

    const resultingSecond = useDocumentStore.getState().blocks[1];
    const versions = useAnnotationsStore.getState().blockVersions;
    expect(resultingSecond?.raw).toBe("nuevo B");
    expect(versions).toHaveLength(1);
    expect(versions[0]?.blockKey).toBe(resultingSecond?.key);
    expect(versions[0]?.blockKey).not.toBe(first.key);
  });

  it("acceptProposal de documento resume el mensaje sin duplicar el documento", async () => {
    useDocumentStore.setState({ content: "antes", original: "antes", dirty: false });
    const assistant = {
      id: "m_doc",
      role: "assistant" as const,
      text: "Propuesta de documento completo lista. Revísala en la tarjeta.",
      createdAt: 1,
      status: "done" as const,
    };
    useAgentStore.setState({
      thread: {
        sessionID: null,
        messages: [assistant],
        proposal: {
          id: "proposal_doc_2",
          createdAt: 1,
          prompt: "x",
          kind: "document",
          blocks: [],
          document: { before: "antes", after: "después" },
        },
      },
    });

    await useAgentStore.getState().acceptProposal();

    const last = useAgentStore.getState().thread.messages[0];
    expect(last.text).toBe("Documento completo aplicado.");
    expect(last.text).not.toContain("después");
  });

  it("un turno de documento con propuesta persiste solo el resumen", async () => {
    await installEvents();
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      sessionID: "ses_test",
      thread: { sessionID: "ses_test", messages: [], proposal: null },
      instruction: "Reescribe",
    });

    await useAgentStore.getState().send({
      blocks: [],
      headingTrail: [],
      path: null,
      mode: "document",
      documentContent: "antes",
      documentBlockCount: 1,
    });
    host.eventHandler?.({
      type: "delta",
      sessionID: "ses_test",
      delta: "<<<NRVN_DOCUMENT>>>\n# Nuevo\n\nContenido largo\n<<<NRVN_END>>>",
    });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });

    const state = useAgentStore.getState();
    const last = state.thread.messages[state.thread.messages.length - 1];
    expect(last.text).toBe("Propuesta de documento completo lista. Revísala en la tarjeta.");
    expect(last.text).not.toContain("Contenido largo");
    expect(state.thread.proposal?.kind).toBe("document");
  });

  it("un turno de documento sin cambios persiste «Sin cambios propuestos.»", async () => {
    await installEvents();
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      sessionID: "ses_test",
      thread: { sessionID: "ses_test", messages: [], proposal: null },
      instruction: "Reescribe",
    });

    await useAgentStore.getState().send({
      blocks: [],
      headingTrail: [],
      path: null,
      mode: "document",
      documentContent: "igual",
      documentBlockCount: 1,
    });
    host.eventHandler?.({ type: "delta", sessionID: "ses_test", delta: "<<<NRVN_NO_CHANGE>>>" });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });

    const state = useAgentStore.getState();
    const last = state.thread.messages[state.thread.messages.length - 1];
    expect(last.text).toBe("Sin cambios propuestos.");
    expect(state.thread.proposal).toBeNull();
    expect(state.proposalError).toBeNull();
  });

  it("un turno de documento fuera de contrato explica el fallo en el mensaje", async () => {
    await installEvents();
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      sessionID: "ses_test",
      thread: { sessionID: "ses_test", messages: [], proposal: null },
      instruction: "Reescribe",
    });

    await useAgentStore.getState().send({
      blocks: [],
      headingTrail: [],
      path: null,
      mode: "document",
      documentContent: "antes",
      documentBlockCount: 1,
    });
    host.eventHandler?.({
      type: "delta",
      sessionID: "ses_test",
      delta: "<<<NRVN_DOCUMENT>>>\nsin cierre",
    });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });

    const state = useAgentStore.getState();
    const last = state.thread.messages[state.thread.messages.length - 1];
    expect(last.text).toBe("La propuesta no sigue el contrato.");
    expect(state.thread.proposal).toBeNull();
    expect(state.proposalError).not.toBeNull();
  });

  it("startOAuth expone url/instructions y cancelOAuth limpia el intento", async () => {
    await useAgentStore.getState().startOAuth();

    let state = useAgentStore.getState();
    expect(state.oauth.status).toBe("pending");
    expect(state.oauth.attemptID).toBe("attempt_1");
    expect(state.oauth.url).toBe("https://opencode.ai/console/device?user_code=TEST");
    expect(state.oauth.instructions).toBe("Enter code: TEST");

    await useAgentStore.getState().cancelOAuth();

    state = useAgentStore.getState();
    expect(state.oauth.status).toBe("idle");
    expect(state.oauth.attemptID).toBeNull();
    expect(host.oauthCancelled).toEqual(["attempt_1"]);
  });

  it("cancelar durante starting descarta el intento y no deja timers", async () => {
    vi.useFakeTimers();
    try {
      let resolveStart: ((value: unknown) => void) | null = null;
      host.oauthStartImpl = () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        });

      const starting = useAgentStore.getState().startOAuth();
      await useAgentStore.getState().cancelOAuth();
      expect(useAgentStore.getState().oauth.status).toBe("idle");

      if (resolveStart === null) throw new Error("oauthStart no se invocó");
      resolveStart({
        attemptID: "attempt_late",
        url: "https://opencode.ai/console/device?user_code=LATE",
        instructions: "Enter code: LATE",
        mode: "auto",
        expiresAt: null,
      });
      await starting;

      expect(useAgentStore.getState().oauth.status).toBe("idle");
      expect(useAgentStore.getState().oauth.attemptID).toBeNull();
      expect(host.oauthCancelled).toEqual(["attempt_late"]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("loadForDocument cierra un streaming persistido y registra su sesión", async () => {
    host.thread = {
      sessionID: "ses_persisted",
      messages: [
        {
          id: "m_streaming",
          role: "assistant",
          text: "Respuesta a medias",
          createdAt: 1,
          status: "streaming",
        },
      ],
      proposal: null,
    };

    await useAgentStore.getState().loadForDocument("notas.md");

    const state = useAgentStore.getState();
    expect(state.thread.messages[0].status).toBe("cancelled");
    expect(state.thread.messages[0].status).not.toBe("streaming");
    expect(state.busy).toBe(false);
    expect(state.sessionID).toBe("ses_persisted");
    expect(host.registerSessions).toEqual(["ses_persisted"]);
  });

  it("loadForDocument interrumpe el turno del hilo anterior si estaba ocupado", async () => {
    useAgentStore.setState({
      sessionID: "ses_vieja",
      busy: true,
      thread: { sessionID: "ses_vieja", messages: [], proposal: null },
    });

    await useAgentStore.getState().loadForDocument("otra.md");

    expect(host.interrupts).toEqual(["ses_vieja"]);
  });

  it("un status de error limpia cuenta y catálogo", async () => {
    useAgentStore.setState({
      status: { state: "ready", mode: "auto", runtime: "local" },
      account: { id: "acc", label: "demo@nrvn.local" },
      catalog: {
        models: [],
        defaultModel: null,
        agents: [],
        providers: [],
      },
      model: null,
    });
    host.connectStatus = { state: "error", mode: "auto", reason: "falló" };

    await useAgentStore.getState().connect("auto");

    const state = useAgentStore.getState();
    expect(state.account).toBeNull();
    expect(state.catalog).toBeNull();
  });

  it("un catálogo nuevo sin el modelo actual reconcilia al predeterminado", async () => {
    const catalog = {
      models: [
        {
          id: "m1",
          providerID: "p",
          providerName: "Proveedor",
          name: "Modelo 1",
        },
      ],
      defaultModel: { providerID: "p", id: "m1" },
      agents: [{ id: "nrvn-editor", name: "nrvn", mode: "primary" }],
      providers: [{ id: "p", name: "Proveedor" }],
    };
    useAgentStore.setState({
      status: { state: "ready", mode: "auto", runtime: "local" },
      model: { providerID: "p", id: "inexistente" },
      catalog: null,
      agent: "nrvn-editor",
    });
    host.connectStatus = {
      state: "ready",
      mode: "auto",
      runtime: "local",
      catalog,
      account: null,
    };

    await useAgentStore.getState().connect("auto");

    const state = useAgentStore.getState();
    expect(state.model).toEqual({ providerID: "p", id: "m1" });
    expect(host.persistedModels).toContainEqual({ providerID: "p", id: "m1" });
  });

  it("model:null se conserva con catálogo listo y no se persiste", async () => {
    const catalog = {
      models: [
        {
          id: "m1",
          providerID: "p",
          providerName: "Proveedor",
          name: "Modelo 1",
        },
      ],
      defaultModel: { providerID: "p", id: "m1" },
      agents: [{ id: "nrvn-editor", name: "nrvn", mode: "primary" }],
      providers: [{ id: "p", name: "Proveedor" }],
    };
    useAgentStore.setState({
      status: { state: "ready", mode: "auto", runtime: "local" },
      model: null,
      catalog: null,
      agent: "nrvn-editor",
    });
    host.connectStatus = {
      state: "ready",
      mode: "auto",
      runtime: "local",
      catalog,
      account: null,
    };

    await useAgentStore.getState().connect("auto");

    expect(useAgentStore.getState().model).toBeNull();
    expect(host.persistedModels).toEqual([]);
  });

  it("rejectProposal guarda lastRejected y undoReject la restaura", () => {
    useAgentStore.setState({
      thread: { sessionID: null, messages: [], proposal: revision },
    });

    useAgentStore.getState().rejectProposal();
    let state = useAgentStore.getState();
    expect(state.thread.proposal).toBeNull();
    expect(state.lastRejected).toBe(revision);

    useAgentStore.getState().undoReject();
    state = useAgentStore.getState();
    expect(state.thread.proposal).toBe(revision);
    expect(state.lastRejected).toBeNull();
  });

  it("rejectProposal de documento deja constancia en el último assistant", () => {
    const documentProposal: AgentProposal = {
      id: "proposal_doc",
      createdAt: 1,
      prompt: "x",
      kind: "document",
      blocks: [],
      document: { before: "antes", after: "después" },
    };
    useAgentStore.setState({
      thread: {
        sessionID: null,
        proposal: documentProposal,
        messages: [
          {
            id: "message_1",
            role: "assistant",
            text: "Propuesta de documento completo lista. Revísala en la tarjeta.",
            createdAt: 1,
            status: "done",
          },
        ],
      },
    });

    useAgentStore.getState().rejectProposal();
    const state = useAgentStore.getState();
    expect(state.thread.proposal).toBeNull();
    expect(state.lastRejected).toBe(documentProposal);
    expect(state.thread.messages[0]?.text).toBe("Propuesta de documento descartada.");
  });

  it("undoReject de documento restaura también el resumen del assistant", () => {
    const documentProposal: AgentProposal = {
      id: "proposal_doc",
      createdAt: 1,
      prompt: "x",
      kind: "document",
      blocks: [],
      document: { before: "antes", after: "después" },
    };
    useAgentStore.setState({
      thread: {
        sessionID: null,
        proposal: documentProposal,
        messages: [
          {
            id: "message_1",
            role: "assistant",
            text: "Propuesta de documento completo lista. Revísala en la tarjeta.",
            createdAt: 1,
            status: "done",
          },
        ],
      },
    });

    useAgentStore.getState().rejectProposal();
    expect(useAgentStore.getState().thread.messages[0]?.text).toBe(
      "Propuesta de documento descartada.",
    );

    useAgentStore.getState().undoReject();

    const state = useAgentStore.getState();
    expect(state.thread.proposal).toBe(documentProposal);
    expect(state.thread.messages[0]?.text).toBe(
      "Propuesta de documento completo lista. Revísala en la tarjeta.",
    );
    expect(state.lastRejected).toBeNull();
  });

  it("undoReject de bloques conserva el mensaje como estaba", () => {
    useAgentStore.setState({
      thread: {
        sessionID: null,
        messages: [
          {
            id: "message_1",
            role: "assistant",
            text: "Respuesta del agente",
            createdAt: 1,
            status: "done",
          },
        ],
        proposal: revision,
      },
    });

    useAgentStore.getState().rejectProposal();
    useAgentStore.getState().undoReject();

    const state = useAgentStore.getState();
    expect(state.thread.proposal).toBe(revision);
    expect(state.thread.messages[0]?.text).toBe("Respuesta del agente");
  });

  it("send no publica el turno si se vuelve al mismo documento (A→B→A) durante createSession", async () => {
    let resolveCreate: ((value: { sessionID: string }) => void) | null = null;
    host.createSessionImpl = () =>
      new Promise((resolve) => {
        resolveCreate = resolve;
      });
    useDocumentStore.setState({ localId: "doc-a", path: null });
    useAgentStore.setState({
      instruction: "Cambia esto",
      status: { state: "ready", mode: "embedded" },
      sessionID: null,
      docKey: "doc-a",
      thread: { sessionID: null, messages: [], proposal: null },
    });

    const sending = useAgentStore.getState().send({
      blocks: [block],
      headingTrail: [],
      path: "a.md",
    });
    // El usuario pasa por B y vuelve a A mientras createSession sigue en vuelo.
    await useAgentStore.getState().loadForDocument("b.md");
    await useAgentStore.getState().loadForDocument("a.md");
    if (resolveCreate === null) throw new Error("createSession no se invocó");
    resolveCreate({ sessionID: "ses_aba" });
    await sending;

    const state = useAgentStore.getState();
    expect(host.prompts).toEqual([]);
    expect(state.docKey).toBe("a.md");
    expect(state.sessionID).toBeNull();
    expect(state.thread.messages).toEqual([]);
    expect(state.thread.sessionID).toBeNull();
    expect(host.interrupts).toEqual(["ses_aba"]);
  });

  it("un createSession rechazado tras cambiar de documento no ensucia el hilo de B", async () => {
    let rejectCreate: ((reason: unknown) => void) | null = null;
    host.createSessionImpl = () =>
      new Promise((_resolve, reject) => {
        rejectCreate = reject;
      });
    useDocumentStore.setState({ localId: "doc-a", path: null });
    useAgentStore.setState({
      instruction: "Cambia esto",
      status: { state: "ready", mode: "embedded" },
      sessionID: null,
      docKey: "doc-a",
      error: null,
      thread: { sessionID: null, messages: [], proposal: null },
    });

    const sending = useAgentStore.getState().send({
      blocks: [block],
      headingTrail: [],
      path: "a.md",
    });
    await useAgentStore.getState().loadForDocument("b.md");
    if (rejectCreate === null) throw new Error("createSession no se invocó");
    rejectCreate(new Error("falló la sesión"));
    await sending;

    const state = useAgentStore.getState();
    expect(state.docKey).toBe("b.md");
    expect(state.error).toBeNull();
    expect(state.thread.messages).toEqual([]);
    expect(host.savedThreads).toEqual([]);
  });

  it("send no contamina el documento nuevo si se cambia durante createSession", async () => {
    let resolveCreate: ((value: { sessionID: string }) => void) | null = null;
    host.createSessionImpl = () =>
      new Promise((resolve) => {
        resolveCreate = resolve;
      });
    useDocumentStore.setState({ localId: "doc-a", path: null });
    useAgentStore.setState({
      instruction: "Cambia esto",
      status: { state: "ready", mode: "embedded" },
      sessionID: null,
      docKey: "doc-a",
      thread: { sessionID: null, messages: [], proposal: null },
    });

    const sending = useAgentStore.getState().send({
      blocks: [block],
      headingTrail: [],
      path: "a.md",
    });
    // El usuario cambia de documento mientras createSession sigue en vuelo.
    await useAgentStore.getState().loadForDocument("b.md");
    if (resolveCreate === null) throw new Error("createSession no se invocó");
    resolveCreate({ sessionID: "ses_huerfana" });
    await sending;

    const state = useAgentStore.getState();
    expect(host.prompts).toEqual([]);
    expect(state.docKey).toBe("b.md");
    expect(state.sessionID).toBeNull();
    expect(state.thread.messages).toEqual([]);
    expect(host.interrupts).toEqual(["ses_huerfana"]);
  });

  it("un delta/error tardío tras cancelar no contamina el hilo", async () => {
    await installEvents();
    useAgentStore.setState({
      status: { state: "ready", mode: "embedded" },
      sessionID: "ses_late",
      docKey: "notas.md",
      thread: { sessionID: "ses_late", messages: [], proposal: null },
      instruction: "Cambia esto",
    });

    await useAgentStore.getState().send({
      blocks: [block],
      headingTrail: [],
      path: "notas.md",
    });
    await useAgentStore.getState().cancel();

    const before = useAgentStore.getState().thread.messages.map((message) => ({ ...message }));
    expect(useAgentStore.getState().busy).toBe(false);

    host.eventHandler?.({ type: "delta", sessionID: "ses_late", delta: " basura tardía" });
    host.eventHandler?.({ type: "error", sessionID: "ses_late", message: "error tardío" });
    host.eventHandler?.({ type: "done", sessionID: "ses_late" });

    const state = useAgentStore.getState();
    expect(state.thread.messages).toEqual(before);
    expect(state.error).toBeNull();
    expect(state.streamingText).toBe("");
  });

  it("un delta/error de la sesión anterior no contamina el hilo tras cambiar de documento", async () => {
    await installEvents();
    useAgentStore.setState({
      sessionID: "ses_shared",
      busy: true,
      docKey: "a.md",
      thread: {
        sessionID: "ses_shared",
        messages: [
          {
            id: "m_a",
            role: "assistant",
            text: "respuesta a medias",
            createdAt: 1,
            status: "streaming",
          },
        ],
        proposal: null,
      },
    });
    host.thread = {
      sessionID: "ses_shared",
      messages: [
        {
          id: "m_b",
          role: "assistant",
          text: "respuesta de B",
          createdAt: 2,
          status: "done",
        },
      ],
      proposal: null,
    };

    await useAgentStore.getState().loadForDocument("b.md");
    const before = useAgentStore.getState().thread.messages.map((message) => ({ ...message }));

    host.eventHandler?.({ type: "delta", sessionID: "ses_shared", delta: " basura" });
    host.eventHandler?.({ type: "error", sessionID: "ses_shared", message: "error viejo" });

    const state = useAgentStore.getState();
    expect(state.docKey).toBe("b.md");
    expect(state.thread.messages).toEqual(before);
    expect(state.error).toBeNull();
  });

  it("un loadThread rechazado tras cambiar de documento no pone error en B", async () => {
    let calls = 0;
    let rejectFirst: ((reason: unknown) => void) | null = null;
    host.loadThreadImpl = () => {
      calls += 1;
      if (calls === 1) {
        return new Promise((_resolve, reject) => {
          rejectFirst = reject;
        });
      }
      return Promise.resolve(host.thread);
    };
    host.thread = { sessionID: "ses_b", messages: [], proposal: null };
    useAgentStore.setState({ docKey: "a.md", error: null });

    const loadingA = useAgentStore.getState().loadForDocument("a.md");
    await useAgentStore.getState().loadForDocument("b.md");
    if (rejectFirst === null) throw new Error("loadThread de A no se invocó");
    rejectFirst(new Error("falló A"));
    await loadingA;

    const state = useAgentStore.getState();
    expect(state.docKey).toBe("b.md");
    expect(state.error).toBeNull();
  });

  it("Guardar como migra el hilo y la propuesta del borrador al archivo nuevo", async () => {
    const documentProposal: AgentProposal = {
      id: "proposal_doc",
      createdAt: 1,
      prompt: "x",
      kind: "document",
      blocks: [],
      document: { before: "antes", after: "después" },
    };
    const messages = [
      {
        id: "m_user",
        role: "user" as const,
        text: "Reescribe",
        createdAt: 1,
        status: "done" as const,
      },
      {
        id: "m_assistant",
        role: "assistant" as const,
        text: "Propuesta de documento completo lista. Revísala en la tarjeta.",
        createdAt: 1,
        status: "done" as const,
      },
    ];
    useAgentStore.setState({
      docKey: "untitled-x",
      sessionID: "ses_draft",
      thread: { sessionID: "ses_draft", messages, proposal: documentProposal },
    });

    markThreadMigration("untitled-x", "notas.md");

    await useAgentStore.getState().loadForDocument("notas.md");

    const state = useAgentStore.getState();
    expect(state.docKey).toBe("notas.md");
    expect(state.thread.messages).toEqual(messages);
    expect(state.thread.proposal).toBe(documentProposal);
    expect(state.sessionID).toBe("ses_draft");
    expect(host.savedThreadKeys).toEqual(["notas.md"]);
    expect(host.savedThreads[0]).toMatchObject({
      sessionID: "ses_draft",
      proposal: documentProposal,
    });
    expect(host.loadedThreadKeys).not.toContain("notas.md");
    expect(host.registerSessions).toEqual(["ses_draft"]);
  });

  it("un documento nuevo (untitled) no migra el hilo", async () => {
    useAgentStore.setState({
      docKey: "untitled-a",
      sessionID: "ses_a",
      thread: {
        sessionID: "ses_a",
        messages: [
          {
            id: "m_a",
            role: "assistant",
            text: "hola",
            createdAt: 1,
            status: "done",
          },
        ],
        proposal: null,
      },
    });

    await useAgentStore.getState().loadForDocument("untitled-b");

    expect(host.savedThreadKeys).toEqual([]);
    expect(host.loadedThreadKeys).toEqual(["untitled-b"]);
    expect(useAgentStore.getState().thread.messages).toEqual([]);
  });

  it("abrir un archivo SIN señal de migración carga su propio hilo", async () => {
    const draftMessages = [
      {
        id: "m_draft",
        role: "assistant" as const,
        text: "Documento completo aplicado.",
        createdAt: 1,
        status: "done" as const,
      },
    ];
    const fileMessages = [
      {
        id: "m_file",
        role: "assistant" as const,
        text: "Hilo propio del archivo",
        createdAt: 2,
        status: "done" as const,
      },
    ];
    host.thread = { sessionID: "ses_file", messages: fileMessages, proposal: null };
    useAgentStore.setState({
      docKey: "untitled-x",
      sessionID: "ses_draft",
      thread: { sessionID: "ses_draft", messages: draftMessages, proposal: null },
    });

    await useAgentStore.getState().loadForDocument("notas.md");

    const state = useAgentStore.getState();
    expect(host.savedThreadKeys).toEqual([]);
    expect(host.loadedThreadKeys).toEqual(["notas.md"]);
    expect(state.docKey).toBe("notas.md");
    expect(state.thread.messages).toEqual(fileMessages);
    expect(state.sessionID).toBe("ses_file");
  });

  it("migración con saveThread diferido no publica si otro documento la invalida", async () => {
    let resolveSave: (() => void) | null = null;
    host.savedThreadImpl = () =>
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      });
    const draftMessages = [
      {
        id: "m_draft",
        role: "assistant" as const,
        text: "Documento completo aplicado.",
        createdAt: 1,
        status: "done" as const,
      },
    ];
    const fileMessages = [
      {
        id: "m_b",
        role: "assistant" as const,
        text: "Hilo de b",
        createdAt: 2,
        status: "done" as const,
      },
    ];
    host.thread = { sessionID: "ses_b", messages: fileMessages, proposal: null };
    useAgentStore.setState({
      docKey: "untitled-x",
      sessionID: "ses_draft",
      thread: { sessionID: "ses_draft", messages: draftMessages, proposal: null },
    });

    markThreadMigration("untitled-x", "notas.md");
    const migrating = useAgentStore.getState().loadForDocument("notas.md");
    await useAgentStore.getState().loadForDocument("b.md");

    if (resolveSave === null) throw new Error("saveThread no se invocó");
    resolveSave();
    await migrating;

    const state = useAgentStore.getState();
    expect(state.docKey).toBe("b.md");
    expect(state.thread.messages).toEqual(fileMessages);
    expect(state.streamingText).toBe("");
  });
});

describe("agent store · bloque de agente", () => {
  it("inserta automáticamente la propuesta en el párrafo pendiente", async () => {
    await installEvents();
    useDocumentStore.getState().setContent("uno\n\ndos");
    useAgentStore.setState({ status: { state: "ready", mode: "embedded" }, busy: false });
    await useAgentStore.getState().addAgentBlock(0);
    const pendingKey = useDocumentStore.getState().pending[0]?.key;
    expect(pendingKey).toBeTruthy();
    expect(host.prompts[0]).toContain("Contexto anterior");
    expect(host.prompts[0]).toContain("uno");
    expect(host.prompts[0]).toContain("Contexto siguiente");
    expect(host.prompts[0]).toContain("dos");
    expect(host.prompts[0]?.match(/^<<<NRVN_BLOCK/gm)).toHaveLength(1);
    host.eventHandler?.({
      type: "delta",
      sessionID: "ses_test",
      delta: `<<<NRVN_BLOCK key="${pendingKey}">>>\nTexto puente\n<<<NRVN_END>>>`,
    });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });
    await vi.waitFor(() => {
      expect(useDocumentStore.getState().content).toContain("Texto puente");
      expect(
        useDocumentStore.getState().blocks.some((item) => item.key === pendingKey && item.pending),
      ).toBe(false);
      expect(useAgentStore.getState().thread.proposal).toBeNull();
      expect(useAgentStore.getState().lastAgentBlock?.key).toBeTruthy();
    });
  });

  it("regenera el mismo bloque sin insertar otro", async () => {
    await installEvents();
    useDocumentStore.getState().setContent("uno\n\ndos");
    useAgentStore.setState({ status: { state: "ready", mode: "embedded" }, busy: false });
    await useAgentStore.getState().addAgentBlock(0);
    const key = useDocumentStore.getState().pending[0]?.key;
    expect(key).toBeDefined();
    if (key === undefined) throw new Error("No se insertó el bloque pendiente");
    host.eventHandler?.({
      type: "delta",
      sessionID: "ses_test",
      delta: `<<<NRVN_BLOCK key="${key}">>>\nTexto puente\n<<<NRVN_END>>>`,
    });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });
    await vi.waitFor(() => expect(useAgentStore.getState().lastAgentBlock?.key).toBeTruthy());
    const appliedKey = useAgentStore.getState().lastAgentBlock?.key;
    expect(appliedKey).toBeDefined();
    const count = useDocumentStore.getState().blocks.length;
    await useAgentStore.getState().regenerateAgentBlock();
    expect(host.prompts).toHaveLength(2);
    expect(host.prompts[1]).toContain(`key="${appliedKey}"`);
    expect(useDocumentStore.getState().blocks).toHaveLength(count);
  });

  it("resuelve el bloque aplicado aunque el foco cambie antes de done", async () => {
    await installEvents();
    useDocumentStore.getState().setContent("uno\n\ndos");
    useAgentStore.setState({ status: { state: "ready", mode: "embedded" }, busy: false });
    await useAgentStore.getState().addAgentBlock(0);
    const pendingKey = useDocumentStore.getState().pending[0]?.key;
    if (pendingKey === undefined) throw new Error("No se insertó el bloque pendiente");
    useSelectionStore.getState().selectIndexRange(0, 0);
    host.eventHandler?.({
      type: "delta",
      sessionID: "ses_test",
      delta: `<<<NRVN_BLOCK key="${pendingKey}">>>\nTexto puente\n<<<NRVN_END>>>`,
    });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });
    await vi.waitFor(() => expect(useAgentStore.getState().lastAgentBlock).not.toBeNull());
    const generated = useDocumentStore
      .getState()
      .blocks.find((block) => block.raw === "Texto puente" && !block.pending);
    expect(generated).toBeDefined();
    expect(useAgentStore.getState().lastAgentBlock?.key).toBe(generated?.key);
    expect(useAgentStore.getState().lastAgentBlock?.key).not.toBe(
      useDocumentStore.getState().blocks.find((block) => block.raw === "uno")?.key,
    );
  });

  it("deja el pendiente editable si done no trae propuesta", async () => {
    await installEvents();
    useUiStore.getState().setToast(null);
    useDocumentStore.getState().setContent("uno\n\ndos");
    useAgentStore.setState({ status: { state: "ready", mode: "embedded" }, busy: false });
    await useAgentStore.getState().addAgentBlock(0);
    host.eventHandler?.({ type: "delta", sessionID: "ses_test", delta: "<<<NRVN_NO_CHANGE>>>" });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });
    await vi.waitFor(() => expect(useAgentStore.getState().busy).toBe(false));
    expect(useDocumentStore.getState().pending).toHaveLength(1);
    expect(useAgentStore.getState().lastAgentBlock).toBeNull();
    expect(useUiStore.getState().toast).toBeTruthy();
  });

  it("deja editable el pendiente cuando falla el agente", async () => {
    await installEvents();
    useDocumentStore.getState().setContent("uno\n\ndos");
    useAgentStore.setState({ status: { state: "ready", mode: "embedded" }, busy: false });
    await useAgentStore.getState().addAgentBlock(0);
    const pendingKey = useDocumentStore.getState().pending[0]?.key;
    host.eventHandler?.({ type: "error", sessionID: "ses_test", message: "fallo" });
    await vi.waitFor(() => expect(useAgentStore.getState().busy).toBe(false));
    expect(useDocumentStore.getState().pending).toHaveLength(1);
    expect(useAgentStore.getState().lastAgentBlock).toBeNull();
    expect(useDocumentStore.getState().editRequest?.key).toBe(pendingKey);
  });

  it("no marca pendiente ni envía al regenerar sin conexión", async () => {
    await installEvents();
    useDocumentStore.getState().setContent("uno\n\ndos");
    useAgentStore.setState({ status: { state: "ready", mode: "embedded" }, busy: false });
    await useAgentStore.getState().addAgentBlock(0);
    const pendingKey = useDocumentStore.getState().pending[0]?.key;
    if (pendingKey === undefined) throw new Error("No se insertó el bloque pendiente");
    host.eventHandler?.({
      type: "delta",
      sessionID: "ses_test",
      delta: `<<<NRVN_BLOCK key="${pendingKey}">>>\nTexto puente\n<<<NRVN_END>>>`,
    });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });
    await vi.waitFor(() => expect(useAgentStore.getState().lastAgentBlock).not.toBeNull());
    const key = useAgentStore.getState().lastAgentBlock?.key;
    if (key === undefined) throw new Error("No se registró el bloque aplicado");
    const promptsBefore = host.prompts.length;
    useAgentStore.setState({ status: { state: "disconnected", mode: "embedded" } });
    await useAgentStore.getState().regenerateAgentBlock();
    expect(useDocumentStore.getState().pending.some((entry) => entry.key === key)).toBe(false);
    expect(host.prompts).toHaveLength(promptsBefore);
  });

  it("limpia el estado pendiente del bloque real si falla la regeneración", async () => {
    await installEvents();
    useDocumentStore.getState().setContent("uno\n\ndos");
    useAgentStore.setState({ status: { state: "ready", mode: "embedded" }, busy: false });
    await useAgentStore.getState().addAgentBlock(0);
    const pendingKey = useDocumentStore.getState().pending[0]?.key;
    if (pendingKey === undefined) throw new Error("No se insertó el bloque pendiente");
    host.eventHandler?.({
      type: "delta",
      sessionID: "ses_test",
      delta: `<<<NRVN_BLOCK key="${pendingKey}">>>\nTexto puente\n<<<NRVN_END>>>`,
    });
    host.eventHandler?.({ type: "done", sessionID: "ses_test" });
    await vi.waitFor(() => expect(useAgentStore.getState().lastAgentBlock).not.toBeNull());
    const key = useAgentStore.getState().lastAgentBlock?.key;
    if (key === undefined) throw new Error("No se registró el bloque aplicado");
    const beforeRaw = useDocumentStore.getState().blocks.find((block) => block.key === key)?.raw;

    await useAgentStore.getState().regenerateAgentBlock();
    expect(useDocumentStore.getState().pending.some((entry) => entry.key === key)).toBe(true);
    host.eventHandler?.({ type: "error", sessionID: "ses_test", message: "fallo" });
    await vi.waitFor(() => expect(useAgentStore.getState().busy).toBe(false));

    expect(useDocumentStore.getState().pending.some((entry) => entry.key === key)).toBe(false);
    expect(useDocumentStore.getState().blocks.find((block) => block.key === key)?.raw).toBe(
      beforeRaw,
    );
  });
});
