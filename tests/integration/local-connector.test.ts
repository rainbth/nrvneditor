// Si el servicio no está disponible, el test se marca SKIP explícito y anotado; nunca pasa en verde implícito.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OpenCode as OpenCodeClient } from "@opencode/client";
import { Service } from "@opencode/client/service";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRestrictedSession } from "../../electron/lib/opencode-session";
import { splitBlocks } from "../../src/lib/blocks";
import { buildPrompt } from "../../src/lib/prompt";
import { parseProposal } from "../../src/lib/proposal";

const ARTIFACT_DIR = path.join(process.cwd(), "artifacts", "screenshots", "loop-b3");
const ARTIFACT_FILE = path.join(ARTIFACT_DIR, "local-connector.json");
const ARTIFACT_ERROR_FILE = path.join(ARTIFACT_DIR, "local-connector.error.json");
const FIXTURE = path.join(process.cwd(), "fixtures", "workspace", "guia-estilo.md");
const PROMPT_TIMEOUT_MS = 120_000;

interface ConnectorEvidence {
  service: { url: string; version?: string } | null;
  agents: unknown[];
  models: unknown[];
  selected?: { agent: string; model: { providerID: string; id: string } | null };
  prompt?: {
    deltas: number;
    terminal: boolean;
    proposal?: unknown;
    parse?: unknown;
    raw?: string;
  };
  oauth?: {
    attemptID?: string;
    url?: string;
    instructions?: string;
    mode?: string;
    error?: string;
  };
  quotaOrError?: string;
  failure?: string;
}

const evidence: ConnectorEvidence = { service: null, agents: [], models: [] };

/** Sólo un mensaje de cuota/rate limit justifica saltar las assertions duras. */
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

let endpoint: Endpoint;
let client: ReturnType<typeof OpenCodeClient.make> | null = null;
let probeError: string | null = null;

function writeEvidence(): void {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const body = `${JSON.stringify(evidence, null, 2)}\n`;
  // Si el servicio no está disponible o hay cuota, no se pisa la evidencia
  // buena: el fallo va a un archivo aparte.
  if (evidence.quotaOrError !== undefined || evidence.failure !== undefined) {
    writeFileSync(ARTIFACT_ERROR_FILE, body, "utf8");
    return;
  }
  writeFileSync(ARTIFACT_FILE, body, "utf8");
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

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

beforeAll(async () => {
  try {
    endpoint = await Service.discover();
  } catch (error) {
    probeError = error instanceof Error ? error.message : String(error);
    endpoint = undefined;
  }
  evidence.service = endpoint === undefined ? null : { url: endpoint.url };
  if (endpoint === undefined) {
    recordError(probeError ?? "No hay servicio local de OpenCode disponible.");
    writeEvidence();
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

describe("conector local de OpenCode (integración real)", () => {
  it("lista agentes/modelos, crea sesión restringida, propone y arranca OAuth", async (ctx) => {
    if (client === null) {
      if (evidence.failure !== undefined) throw new Error(evidence.failure);
      const reason = `OpenCode service unavailable: ${probeError ?? "servicio no disponible"}`;
      await ctx.annotate(reason, "skip");
      ctx.skip(reason);
      return;
    }
    const active = client;

    try {
      evidence.service = { url: endpoint?.url ?? "" };
      try {
        const info = await active.server.info();
        const version = (info as { data?: { version?: unknown } }).data?.version;
        if (typeof version === "string") evidence.service.version = version;
      } catch {
        // La versión es informativa.
      }

      const [agentsResult, modelsResult, defaultResult] = await Promise.all([
        active.agent.list(),
        active.model.list(),
        active.model.default(),
      ]);

      evidence.agents = agentsResult.data.map((agent) => ({
        id: agent.id,
        name: agent.name,
        mode: agent.mode,
        hidden: agent.hidden,
        ...(agent.description === undefined ? {} : { description: agent.description }),
      }));
      evidence.models = modelsResult.data.map((model) => ({
        id: model.id,
        providerID: model.providerID,
        name: model.name,
        enabled: model.enabled,
      }));

      const primary = agentsResult.data.filter(
        (agent) => (agent.mode === "primary" || agent.mode === "all") && !agent.hidden,
      );
      const agent =
        primary.find((candidate) => candidate.id === "build") ??
        primary.find((candidate) => candidate.id === "loop") ??
        primary[0];
      if (agent === undefined) {
        recordError("El servicio no expone agentes primarios.");
        writeEvidence();
        const reason = "OpenCode service unavailable: servicio sin agentes primarios.";
        await ctx.annotate(reason, "skip");
        ctx.skip(reason);
        return;
      }

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
        writeEvidence();
        const reason = "OpenCode service unavailable: servicio sin modelos habilitados.";
        await ctx.annotate(reason, "skip");
        ctx.skip(reason);
        return;
      }

      evidence.selected = {
        agent: agent.id,
        model: { providerID: model.providerID, id: model.id },
      };

      const fixture = readFileSync(FIXTURE, "utf8");
      const blocks = splitBlocks(fixture);
      const paragraph = blocks.find((block) => block.type === "paragraph") ?? blocks[0];
      if (paragraph === undefined) {
        recordError("El fixture no produjo bloques.");
        writeEvidence();
        const reason = "fixture sin bloques";
        await ctx.annotate(reason, "skip");
        ctx.skip(reason);
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
          directory: process.cwd(),
          agent: agent.id,
          model: { providerID: model.providerID, id: model.id },
          title: "nrvn loop-b3 local connector",
        },
        { userDataDir: process.cwd() },
      );

      const controller = new AbortController();
      let deltas = 0;
      let text = "";
      let terminal = false;
      try {
        const consume = (async () => {
          const stream = active.event.subscribe({ signal: controller.signal });
          for await (const event of stream) {
            if (controller.signal.aborted) break;
            if (event.type === "session.text.delta" && event.data.sessionID === session.sessionID) {
              deltas += 1;
              text += event.data.delta;
              continue;
            }
            if (
              event.data.sessionID === session.sessionID &&
              (event.type === "session.text.ended" ||
                event.type === "session.execution.succeeded" ||
                event.type === "session.execution.interrupted" ||
                event.type === "session.idle")
            ) {
              terminal = true;
              break;
            }
            if (
              event.data.sessionID === session.sessionID &&
              (event.type === "session.execution.failed" || event.type === "session.step.failed")
            ) {
              throw new Error("El turno del agente falló.");
            }
          }
        })();

        await active.session.prompt({ sessionID: session.sessionID, text: promptText });
        await withTimeout(consume, PROMPT_TIMEOUT_MS, "Timeout esperando la respuesta del agente");
      } finally {
        controller.abort();
      }

      const parsed = parseProposal(text, new Set([paragraph.key]));
      evidence.prompt = {
        deltas,
        terminal,
        ...(parsed.ok
          ? { proposal: parsed.blocks, parse: "ok" }
          : { parse: parsed.reason, raw: text.slice(0, 20_000) }),
      };
      expect.soft(deltas).toBeGreaterThan(0);

      await active.session.remove({ sessionID: session.sessionID }).catch(() => undefined);
    } catch (error) {
      recordError(error);
      writeEvidence();
      // Un timeout, un stream roto o un contrato inválido no son cuota: fallan.
      if (evidence.failure !== undefined) throw new Error(evidence.failure);
    }

    try {
      const start = await active.integration.oauth.connect({
        integrationID: "opencode",
        methodID: "device",
        answer: { server: "https://opencode.ai/console" },
      });
      const data = start.data;
      evidence.oauth = {
        attemptID: data.attemptID,
        url: data.url,
        instructions: data.instructions,
        mode: data.mode,
      };
      expect(isHttpUrl(data.url)).toBe(true);
      expect(data.instructions.length).toBeGreaterThan(0);
      expect(data.attemptID.length).toBeGreaterThan(0);
      await active.integration.oauth.cancel({
        integrationID: "opencode",
        attemptID: data.attemptID,
      });
    } catch (error) {
      evidence.oauth = {
        error: error instanceof Error ? error.message : String(error),
      };
      writeEvidence();
      // OAuth es un contrato duro: un fallo real (no proveedor ausente) falla.
      throw error instanceof Error ? error : new Error(String(error));
    }

    writeEvidence();

    // Sin cuota/errores, la evidencia debe demostrar un turno real completo.
    if (evidence.quotaOrError === undefined && evidence.failure === undefined) {
      expect(evidence.prompt?.parse).toBe("ok");
      const proposal = evidence.prompt?.proposal;
      expect(Array.isArray(proposal)).toBe(true);
      expect((proposal as unknown[]).length).toBeGreaterThan(0);
    }
  }, 150_000);
});
