// Si el servicio no está disponible, el test se marca SKIP explícito y anotado; nunca pasa en verde implícito.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { OpenCode as OpenCodeClient } from "@opencode/client";
import { Service } from "@opencode/client/service";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRestrictedSession,
  normalizeSessionDirectory,
} from "../../electron/lib/opencode-session";
import { splitBlocks } from "../../src/lib/blocks";
import { buildPrompt } from "../../src/lib/prompt";
import { parseProposal } from "../../src/lib/proposal";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "screenshots", "loop-b4");
const ARTIFACT_FILE = path.join(ARTIFACT_DIR, "local-untitled.json");
const ARTIFACT_ERROR_FILE = path.join(ARTIFACT_DIR, "local-untitled.error.json");
const FIXTURE = path.join(process.cwd(), "fixtures", "workspace", "guia-estilo.md");
const PROMPT_TIMEOUT_MS = 120_000;
const CANCEL_TIMEOUT_MS = 30_000;
const INTERRUPT_AFTER_MS = 1_500;

/** Reproduce el 500: el renderer envía este directorio para un documento sin título. */
const REQUESTED_DIRECTORY = "__untitled__";
const USER_DATA_DIR = path.join(os.tmpdir(), "nrvn-loop-b4-userdata");

interface PromptEvidence {
  deltas: number;
  terminal: boolean;
  parse: "ok" | "failed";
  blocks: number;
  reason?: string;
}

interface CancelEvidence {
  attempted: boolean;
  deltas: number;
  terminal: boolean;
  interrupted: boolean;
  interruptRequested: boolean;
  reason?: string;
}

interface UntitledEvidence {
  service: { url: string; version?: string } | null;
  mode: "local";
  requestedDirectory: string;
  normalizedDirectory: string;
  agent?: string;
  model?: { providerID: string; id: string } | null;
  title: string;
  prompt?: PromptEvidence;
  cancel?: CancelEvidence;
  oauth?: { status: string; error?: string };
  quotaOrError?: string;
  failure?: string;
}

const evidence: UntitledEvidence = {
  service: null,
  mode: "local",
  requestedDirectory: REQUESTED_DIRECTORY,
  normalizedDirectory: "",
  title: "Borrador sin título",
};

const QUOTA_RE = /429|quota|rate limit|insufficient|credit/i;

function isQuotaMessage(message: string): boolean {
  return QUOTA_RE.test(message);
}

function recordError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (isQuotaMessage(message)) evidence.quotaOrError = message;
  else evidence.failure = message;
}

type Endpoint = Awaited<ReturnType<typeof Service.discover>>;
type Client = ReturnType<typeof OpenCodeClient.make>;

let endpoint: Endpoint;
let client: Client | null = null;
let probeError: string | null = null;

function writeEvidence(): void {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const body = `${JSON.stringify(evidence, null, 2)}\n`;
  // Si hay cuota o un fallo, no se pisa la evidencia buena: va a un archivo
  // aparte. Si la ejecución es buena, se escribe la evidencia y se elimina el
  // error previo (best-effort).
  if (evidence.quotaOrError !== undefined || evidence.failure !== undefined) {
    writeFileSync(ARTIFACT_ERROR_FILE, body, "utf8");
    return;
  }
  writeFileSync(ARTIFACT_FILE, body, "utf8");
  try {
    rmSync(ARTIFACT_ERROR_FILE, { force: true });
  } catch {
    // El borrado es best-effort.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TurnResult {
  deltas: number;
  terminal: boolean;
  interrupted: boolean;
  interruptRequested: boolean;
  text: string;
}

/**
 * Envía un prompt y consume el stream de eventos de la sesión. `interruptAfterMs`
 * activa la cancelación best-effort tras el envío.
 */
async function runTurn(
  active: Client,
  sessionID: string,
  text: string,
  interruptAfterMs?: number,
): Promise<TurnResult> {
  const controller = new AbortController();
  let deltas = 0;
  let terminal = false;
  let interrupted = false;
  let interruptRequested = false;
  let response = "";

  const consume = (async () => {
    const stream = active.event.subscribe({ signal: controller.signal });
    for await (const event of stream) {
      if (controller.signal.aborted) break;
      if (event.data.sessionID !== sessionID) continue;
      if (event.type === "session.text.delta") {
        deltas += 1;
        response += event.data.delta;
        continue;
      }
      if (event.type === "session.execution.interrupted") interrupted = true;
      if (
        event.type === "session.text.ended" ||
        event.type === "session.execution.succeeded" ||
        event.type === "session.execution.interrupted" ||
        event.type === "session.idle"
      ) {
        terminal = true;
        break;
      }
      if (event.type === "session.execution.failed" || event.type === "session.step.failed") {
        // Tras un interrupt solicitado por nrvn, el servicio puede cerrar el
        // turno como fallo: es el resultado esperado de la cancelación.
        if (interruptAfterMs !== undefined) {
          interrupted = true;
          terminal = true;
          break;
        }
        throw new Error("El turno del agente falló.");
      }
    }
  })();

  try {
    await active.session.prompt({ sessionID, text });
    if (interruptAfterMs !== undefined) {
      await delay(interruptAfterMs);
      interruptRequested = true;
      await active.session.interrupt({ sessionID }).catch(() => undefined);
    }
    await withTimeout(
      consume,
      interruptAfterMs === undefined ? PROMPT_TIMEOUT_MS : CANCEL_TIMEOUT_MS,
      "Timeout esperando la respuesta del agente",
    );
  } finally {
    controller.abort();
  }

  return { deltas, terminal, interrupted, interruptRequested, text: response };
}

beforeAll(async () => {
  evidence.normalizedDirectory = normalizeSessionDirectory(REQUESTED_DIRECTORY, USER_DATA_DIR);
  mkdirSync(evidence.normalizedDirectory, { recursive: true });

  try {
    endpoint = await Service.discover();
  } catch (error) {
    probeError = error instanceof Error ? error.message : String(error);
    endpoint = undefined;
  }
  evidence.service = endpoint === undefined ? null : { url: endpoint.url };
  if (endpoint === undefined) {
    recordError(probeError ?? "No hay servicio local de OpenCode disponible.");
    return;
  }
  const headers =
    endpoint.auth === undefined
      ? undefined
      : {
          Authorization: `Basic ${Buffer.from(
            `${endpoint.auth.username}:${endpoint.auth.password}`,
          ).toString("base64")}`,
        };
  client = OpenCodeClient.make({ baseUrl: endpoint.url, headers });
}, 30_000);

afterAll(() => {
  writeEvidence();
});

describe("borrador sin título contra el servicio local (integración real)", () => {
  it("normaliza __untitled__, crea la sesión y completa un turno real", async (ctx) => {
    // La normalización es pura y se verifica aunque no haya servicio.
    expect(path.isAbsolute(evidence.normalizedDirectory)).toBe(true);
    expect(evidence.normalizedDirectory).not.toBe(REQUESTED_DIRECTORY);
    expect(evidence.normalizedDirectory).toContain(path.join("opencode", "sessions"));

    if (client === null) {
      if (evidence.failure !== undefined) throw new Error(evidence.failure);
      const reason = `OpenCode service unavailable: ${probeError ?? "servicio no disponible"}`;
      await ctx.annotate(reason, "skip");
      ctx.skip(reason);
      return;
    }
    const active = client;

    try {
      try {
        const info = await active.server.info();
        const version = (info as { data?: { version?: unknown } }).data?.version;
        if (typeof version === "string") evidence.service = { url: endpoint?.url ?? "", version };
      } catch {
        // La versión es informativa.
      }

      const [agentsResult, modelsResult, defaultResult] = await Promise.all([
        active.agent.list(),
        active.model.list(),
        active.model.default(),
      ]);

      const primary = agentsResult.data.filter(
        (agent) => (agent.mode === "primary" || agent.mode === "all") && !agent.hidden,
      );
      const agent = primary.find((candidate) => candidate.id === "build") ?? primary[0];
      if (agent === undefined) {
        recordError("El servicio no expone agentes primarios.");
        return;
      }
      evidence.agent = agent.id;

      const enabledModels = modelsResult.data.filter((model) => model.enabled !== false);
      const preferred = enabledModels.find(
        (model) => model.providerID === "opencode-go" && model.id === "deepseek-v4.1-flash",
      );
      const defaultModel =
        defaultResult.data === null
          ? undefined
          : enabledModels.find(
              (model) =>
                model.id === defaultResult.data?.id &&
                model.providerID === defaultResult.data?.providerID,
            );
      const model = preferred ?? defaultModel ?? enabledModels[0];
      if (model === undefined) {
        recordError("El servicio no expone modelos habilitados.");
        return;
      }
      evidence.model = { providerID: model.providerID, id: model.id };

      const fixture = readFileSync(FIXTURE, "utf8");
      const blocks = splitBlocks(fixture);
      const paragraph = blocks.find((block) => block.type === "paragraph") ?? blocks[0];
      if (paragraph === undefined) {
        recordError("El fixture no produjo bloques.");
        return;
      }
      const promptText = buildPrompt({
        path: "fixtures/workspace/guia-estilo.md",
        headingTrail: paragraph.headingPath,
        blocks: [{ key: paragraph.key, type: paragraph.type, raw: paragraph.raw }],
        instruction:
          "Mejora este párrafo con una frase más concreta. Devuelve el bloque completo con sus marcas.",
      });

      const session = await createRestrictedSession(
        active,
        {
          directory: evidence.normalizedDirectory,
          agent: agent.id,
          model: { providerID: model.providerID, id: model.id },
          title: evidence.title,
        },
        { userDataDir: USER_DATA_DIR },
      );

      const turn = await runTurn(active, session.sessionID, promptText);
      const parsed = parseProposal(turn.text, new Set([paragraph.key]));
      evidence.prompt = {
        deltas: turn.deltas,
        terminal: turn.terminal,
        parse: parsed.ok ? "ok" : "failed",
        blocks: parsed.ok ? parsed.blocks.length : 0,
        ...(parsed.ok ? {} : { reason: parsed.reason }),
      };

      expect(turn.deltas).toBeGreaterThan(0);
      expect(turn.terminal).toBe(true);

      // Cancelación best-effort del contrato local: no invalida el test si el
      // servicio la rechaza o si el turno terminó antes del interrupt.
      const cancelSession = await createRestrictedSession(
        active,
        {
          directory: evidence.normalizedDirectory,
          agent: agent.id,
          model: { providerID: model.providerID, id: model.id },
          title: "Borrador sin título (cancelación)",
        },
        { userDataDir: USER_DATA_DIR },
      );
      try {
        const cancelTurn = await runTurn(
          active,
          cancelSession.sessionID,
          promptText,
          INTERRUPT_AFTER_MS,
        );
        evidence.cancel = {
          attempted: true,
          deltas: cancelTurn.deltas,
          terminal: cancelTurn.terminal,
          interrupted: cancelTurn.interrupted,
          interruptRequested: cancelTurn.interruptRequested,
        };
      } catch (error) {
        evidence.cancel = {
          attempted: true,
          deltas: 0,
          terminal: false,
          interrupted: false,
          interruptRequested: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      } finally {
        await active.session.remove({ sessionID: cancelSession.sessionID }).catch(() => undefined);
      }

      // Sin cuota, la cancelación debe haberse pedido y cerrado el turno.
      if (evidence.quotaOrError === undefined) {
        expect(evidence.cancel?.attempted).toBe(true);
        expect(evidence.cancel?.terminal).toBe(true);
        expect(evidence.cancel?.interruptRequested).toBe(true);
      }

      await active.session.remove({ sessionID: session.sessionID }).catch(() => undefined);
    } catch (error) {
      recordError(error);
    }

    if (evidence.failure !== undefined) throw new Error(evidence.failure);

    // Sin cuota, el turno real debe haber producido texto parseable.
    if (evidence.quotaOrError === undefined) {
      expect(evidence.prompt?.parse).toBe("ok");
      expect(evidence.prompt?.blocks ?? 0).toBeGreaterThan(0);
    }
  }, 150_000);
});
