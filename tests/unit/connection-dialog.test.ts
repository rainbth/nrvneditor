import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgentCatalog, AgentStatus } from "../../electron/types";
import {
  ConnectionDialogBody,
  type ConnectionDialogBodyProps,
} from "../../src/components/agent/ConnectionDialogBody";
import type { AgentOAuthUi } from "../../src/store/agent";

const CATALOG: AgentCatalog = {
  models: [
    {
      id: "deepseek-v4.1-flash",
      providerID: "opencode-go",
      providerName: "OpenCode Go",
      name: "DeepSeek V4.1 Flash",
    },
    { id: "gpt-6-sol", providerID: "opencode", providerName: "OpenCode", name: "GPT-6 Sol" },
  ],
  defaultModel: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
  providers: [
    { id: "opencode-go", name: "OpenCode Go" },
    { id: "opencode", name: "OpenCode" },
  ],
  agents: [
    { id: "build", name: "build", description: "", mode: "primary" },
    { id: "plan", name: "plan", description: "", mode: "primary" },
  ],
};

const STATUS: AgentStatus = {
  state: "ready",
  mode: "auto",
  runtime: "local",
  serviceUrl: "http://127.0.0.1:49374",
  serviceAuth: true,
  sessionsDir: "/Users/tester/Library/Application Support/nrvn/sessions",
  catalog: CATALOG,
  account: {
    id: "acct-1",
    label: "demo@nrvn.local",
    email: "demo@nrvn.local",
    organization: "nrvn",
  },
};

const IDLE_OAUTH: AgentOAuthUi = {
  status: "idle",
  attemptID: null,
  url: null,
  instructions: null,
  error: null,
};

function render(overrides: Partial<ConnectionDialogBodyProps> = {}): string {
  const props: ConnectionDialogBodyProps = {
    mode: "auto",
    agent: "build",
    model: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
    status: STATUS,
    catalog: CATALOG,
    account: STATUS.account ?? null,
    oauth: IDLE_OAUTH,
    busy: false,
    onModeChange: vi.fn(),
    onAgentChange: vi.fn(),
    onModelChange: vi.fn(),
    onReconnect: vi.fn(),
    onStartOAuth: vi.fn(),
    onCancelOAuth: vi.fn(),
    onOpenExternal: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return renderToStaticMarkup(createElement(ConnectionDialogBody, props));
}

describe("ConnectionDialogBody", () => {
  it("renderiza la sección de comportamiento cuando recibe contenido", () => {
    const html = render({ behavior: createElement("p", { "data-testid": "behavior-slot" }, "x") });
    expect(html).toContain('data-testid="agent-behavior"');
    expect(html).toContain('data-testid="behavior-slot"');
  });

  it("omite la sección de comportamiento cuando no recibe contenido", () => {
    expect(render()).not.toContain('data-testid="agent-behavior"');
  });

  it("renderiza las cuatro secciones con títulos", () => {
    const html = render();
    expect(html).toContain("Conexión");
    expect(html).toContain("Cuenta OpenCode");
    expect(html).toContain("Proveedores");
    expect(html).toContain("Avanzado");
    expect(html.match(/connection-section[^-]/g)?.length ?? 0).toBe(4);
  });

  it("expone modo, agente, modelo y meta de conexión", () => {
    const html = render();
    expect(html).toContain('data-testid="agent-mode"');
    expect(html).toContain('data-testid="agent-agent"');
    expect(html).toContain('data-testid="agent-model"');
    expect(html).toContain("OpenCode conectado · Servicio local · 2 agentes · 2 modelos");
    expect(html).toContain('data-testid="agent-reconnect"');
  });

  it("lista proveedores y la nota literal de OpenAI/ChatGPT", () => {
    const html = render();
    expect(html).toContain('data-testid="agent-providers"');
    expect(html).toContain("OpenCode Go");
    expect(html).toContain("OpenCode");
    expect(html).toContain("OpenAI requiere API key; ChatGPT Plus no es API");
  });

  it("muestra URL del servicio, carpeta de sesiones y máscara de auth sin secretos", () => {
    const html = render();
    expect(html).toContain('data-testid="agent-service-url"');
    expect(html).toContain("http://127.0.0.1:49374");
    expect(html).toContain('data-testid="agent-sessions-dir"');
    expect(html).toContain("sessions");
    expect(html).toContain('data-testid="agent-auth-mask"');
    expect(html).toContain("••••••");
    expect(html).not.toContain("hunter2");
    expect(html.toLowerCase()).not.toContain("password");
  });

  it("muestra 'Sin token · solo en 127.0.0.1' cuando serviceAuth es falso", () => {
    const html = render({ status: { ...STATUS, serviceAuth: false } });
    expect(html).toContain("Sin token · solo en 127.0.0.1");
    expect(html).not.toContain("••••••");
  });

  it("muestra el estado de permisos verificado, sin verificar y ausente", () => {
    const verified = render({ status: { ...STATUS, permissionsVerified: true } });
    expect(verified).toContain('data-testid="agent-permissions"');
    expect(verified).toContain("Verificados (sin herramientas)");

    const unverified = render({ status: { ...STATUS, permissionsVerified: false } });
    expect(unverified).toContain('data-testid="agent-permissions"');
    expect(unverified).toContain("Sin verificar");

    const unknown = render({ status: STATUS });
    expect(unknown).toContain('data-testid="agent-permissions"');
    expect(unknown).toContain("—");
  });

  it("en runtime embebido no expone un servicio externo", () => {
    const html = render({
      status: { ...STATUS, runtime: "embedded", serviceUrl: undefined },
    });
    expect(html).toContain("Embebido (sin servicio externo)");
  });

  it("muestra URL, código y espera de autorización durante OAuth", () => {
    const html = render({
      oauth: {
        status: "pending",
        attemptID: "attempt-1",
        url: "https://opencode.ai/console/device?user_code=NRVN-MOCK",
        instructions: "Enter code: NRVN-MOCK",
        error: null,
      },
    });
    expect(html).toContain('data-testid="agent-oauth-url"');
    expect(html).toContain("https://opencode.ai/console/device");
    expect(html).toContain('data-testid="agent-oauth-code"');
    expect(html).toContain("NRVN-MOCK");
    expect(html).toContain("Esperando autorización…");
    expect(html).toContain('data-testid="agent-oauth-open"');
    expect(html).toContain('data-testid="agent-oauth-cancel"');
  });
});
