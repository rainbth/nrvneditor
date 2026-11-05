import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { AgentAccount, AgentCatalog, AgentMode, AgentStatus } from "../../../electron/types";
import type { AgentOAuthUi } from "../../store/agent";

const MODE_LABEL: Record<AgentMode, string> = {
  auto: "Automático",
  local: "Local",
  embedded: "Embebido",
};

const PROVIDERS_URL = "https://opencode.ai/docs/providers/";

const STATE_LABEL = {
  connecting: "Conectando…",
  ready: "OpenCode conectado",
  error: "Sin conexión",
  disconnected: "Desconectado",
} as const;

function modelValue(model: { providerID: string; id: string } | null): string {
  return model === null ? "" : `${model.providerID}/${model.id}`;
}

export interface ConnectionDialogBodyProps {
  behavior?: ReactNode;
  mode: AgentMode;
  agent: string;
  model: { providerID: string; id: string } | null;
  status: AgentStatus;
  catalog: AgentCatalog | null;
  account: AgentAccount | null;
  oauth: AgentOAuthUi;
  busy: boolean;
  onModeChange: (mode: AgentMode) => void;
  onAgentChange: (id: string) => void;
  onModelChange: (model: { providerID: string; id: string } | null) => void;
  onReconnect: () => void;
  onStartOAuth: () => void;
  onCancelOAuth: () => void;
  onOpenExternal: (url: string) => void;
  onClose: () => void;
}

/**
 * Cuerpo presentacional del dialog «Conexión y cuenta». Sin portal ni estado
 * global: se puede renderizar con `renderToStaticMarkup` para tests.
 */
export function ConnectionDialogBody({
  behavior,
  mode,
  agent,
  model,
  status,
  catalog,
  account,
  oauth,
  busy,
  onModeChange,
  onAgentChange,
  onModelChange,
  onReconnect,
  onStartOAuth,
  onCancelOAuth,
  onOpenExternal,
  onClose,
}: ConnectionDialogBodyProps) {
  const connecting = status.state === "connecting";
  const agents = catalog?.agents ?? [];
  const models = catalog?.models ?? [];
  const providers = catalog?.providers ?? [];
  const runtime = status.runtime === "local" ? "Servicio local" : "Embebido";
  const oauthActive = oauth.status === "pending" || oauth.status === "starting";
  const disabled = catalog === null || connecting || busy;
  const instructions = oauth.instructions;
  const looksLikeCode = instructions !== null && instructions.trim().split(/\s+/).length <= 2;

  const groups = new Map<string, typeof models>();
  for (const item of models) {
    const list = groups.get(item.providerName);
    if (list) list.push(item);
    else groups.set(item.providerName, [item]);
  }

  const serviceUrl =
    status.runtime === "embedded" ? "Embebido (sin servicio externo)" : (status.serviceUrl ?? "—");
  const sessionsDir = status.sessionsDir ?? "—";
  const authMask = status.serviceAuth === true ? "••••••" : "Sin token · solo en 127.0.0.1";

  // Sin URL no hay nada que abrir: el botón queda deshabilitado hasta que el
  // intento de autorización publique el enlace.
  const openBrowserButton = (
    <button
      type="button"
      className="button"
      data-testid="agent-oauth-open"
      onClick={() => onOpenExternal(oauth.url ?? PROVIDERS_URL)}
      disabled={oauth.url === null}
    >
      <ExternalLink size={13} aria-hidden="true" />
      Abrir navegador
    </button>
  );

  return (
    <>
      <section className="connection-section" aria-labelledby="connection-section-title">
        <h3 className="connection-section-title" id="connection-section-title">
          Conexión
        </h3>
        <div className="connection-grid">
          <label className="agent-setting agent-setting-mode">
            <span className="agent-setting-label">Modo de conexión</span>
            <select
              className="agent-select"
              data-testid="agent-mode"
              value={mode}
              disabled={connecting || busy}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "auto" || value === "local" || value === "embedded") {
                  onModeChange(value);
                }
              }}
            >
              {(["auto", "local", "embedded"] as const).map((value) => (
                <option key={value} value={value}>
                  {MODE_LABEL[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="agent-setting">
            <span className="agent-setting-label">Agente</span>
            <select
              className="agent-select"
              data-testid="agent-agent"
              value={agent}
              disabled={disabled || agents.length === 0}
              onChange={(event) => onAgentChange(event.target.value)}
            >
              {agents.length === 0 ? <option value={agent}>{agent}</option> : null}
              {agents.length > 0 && !agents.some((item) => item.id === agent) ? (
                <option value={agent}>{agent}</option>
              ) : null}
              {agents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="agent-setting">
            <span className="agent-setting-label">Modelo</span>
            <select
              className="agent-select"
              data-testid="agent-model"
              value={modelValue(model)}
              disabled={disabled || models.length === 0}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "") {
                  onModelChange(null);
                  return;
                }
                const slash = value.indexOf("/");
                if (slash === -1) return;
                onModelChange({
                  providerID: value.slice(0, slash),
                  id: value.slice(slash + 1),
                });
              }}
            >
              {models.length === 0 ? <option value="">Sin modelos</option> : null}
              {models.length > 0 ? <option value="">Predeterminado</option> : null}
              {[...groups.entries()].map(([providerName, providerModels]) => (
                <optgroup key={providerName} label={providerName}>
                  {providerModels.map((item) => (
                    <option
                      key={`${item.providerID}/${item.id}`}
                      value={`${item.providerID}/${item.id}`}
                    >
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <p className="connection-meta" data-testid="agent-connection-meta">
          {STATE_LABEL[status.state]} · {runtime} · {agents.length}{" "}
          {agents.length === 1 ? "agente" : "agentes"} · {models.length}{" "}
          {models.length === 1 ? "modelo" : "modelos"}
        </p>
        <p className="connection-diagnostic" data-testid="agent-diagnostic">
          {status.reason ?? "Sin incidencias"}
        </p>

        <div className="connection-actions">
          <button
            type="button"
            className="button"
            data-testid="agent-reconnect"
            onClick={onReconnect}
            disabled={connecting}
          >
            <RefreshCw size={13} aria-hidden="true" />
            {status.state === "ready" ? "Reconectar servicio" : "Conectar servicio"}
          </button>
        </div>
      </section>

      {behavior !== undefined ? (
        <section
          className="connection-section"
          data-testid="agent-behavior"
          aria-labelledby="connection-behavior-title"
        >
          <h3 className="connection-section-title" id="connection-behavior-title">
            Comportamiento
          </h3>
          {behavior}
        </section>
      ) : null}

      <section
        className="connection-section"
        data-testid="agent-account"
        aria-labelledby="connection-account-title"
      >
        <h3 className="connection-section-title" id="connection-account-title">
          Cuenta OpenCode
        </h3>

        {account === null ? (
          <p className="agent-account-line">Sin cuenta conectada</p>
        ) : (
          <>
            <p className="agent-account-name">
              {account.label}
              {!oauthActive ? (
                <span
                  className="agent-account-status"
                  data-testid="agent-account-status"
                  role="status"
                  aria-live="polite"
                >
                  Conectado
                </span>
              ) : null}
            </p>
            {account.email !== undefined &&
            account.email.length > 0 &&
            account.email !== account.label ? (
              <p className="agent-account-line">{account.email}</p>
            ) : null}
            {account.organization !== undefined &&
            account.organization.length > 0 &&
            account.organization !== account.label &&
            account.organization !== account.email ? (
              <p className="agent-account-line">{account.organization}</p>
            ) : null}
          </>
        )}

        {oauthActive ? (
          <div className="agent-oauth" data-testid="agent-oauth" role="status" aria-live="polite">
            <p className="agent-oauth-help">
              Abre la URL e introduce el código. La app se actualiza sola al terminar.
            </p>
            {oauth.url !== null ? (
              <a
                className="agent-oauth-url"
                data-testid="agent-oauth-url"
                href={oauth.url}
                onClick={(event) => {
                  event.preventDefault();
                  onOpenExternal(oauth.url ?? PROVIDERS_URL);
                }}
              >
                {oauth.url}
              </a>
            ) : (
              <p className="agent-oauth-url" data-testid="agent-oauth-url">
                Abriendo OpenCode…
              </p>
            )}
            {instructions !== null ? (
              <>
                <p className="agent-oauth-code-label">
                  {looksLikeCode ? "Código" : "Instrucciones"}
                </p>
                <code className="agent-oauth-code" data-testid="agent-oauth-code">
                  {instructions}
                </code>
              </>
            ) : null}
            <div className="connection-actions">
              {openBrowserButton}
              <button
                type="button"
                className="button"
                data-testid="agent-oauth-cancel"
                onClick={onCancelOAuth}
              >
                Cancelar
              </button>
            </div>
            <p className="agent-oauth-waiting" data-testid="agent-oauth-waiting">
              <Loader2 size={13} className="agent-oauth-spinner" aria-hidden="true" />
              Esperando autorización…
            </p>
          </div>
        ) : (
          <div className="agent-account-actions">
            {oauth.status === "error" && oauth.error !== null ? (
              <p className="agent-account-error" role="alert">
                {oauth.error}
              </p>
            ) : null}
            <button
              type="button"
              className="button agent-account-action"
              data-testid="agent-oauth-start"
              onClick={onStartOAuth}
              disabled={oauthActive || busy}
            >
              {account !== null ? "Reconectar cuenta" : "Conectar con OpenCode"}
            </button>
            {openBrowserButton}
          </div>
        )}
      </section>

      <section className="connection-section" aria-labelledby="connection-providers-title">
        <h3 className="connection-section-title" id="connection-providers-title">
          Proveedores
        </h3>
        <ul className="connection-providers" data-testid="agent-providers">
          {providers.length === 0 ? (
            <li className="connection-provider">Sin proveedores conectados</li>
          ) : (
            providers.map((provider) => (
              <li key={provider.id} className="connection-provider">
                {provider.name}
              </li>
            ))
          )}
        </ul>
        <p className="agent-account-note">OpenAI requiere API key; ChatGPT Plus no es API</p>
        <button
          type="button"
          className="button agent-account-action"
          data-testid="agent-open-providers"
          onClick={() => onOpenExternal(PROVIDERS_URL)}
        >
          Ver proveedores de OpenCode
          <ExternalLink size={12} aria-hidden="true" />
        </button>
      </section>

      <section className="connection-section" aria-labelledby="connection-advanced-title">
        <h3 className="connection-section-title" id="connection-advanced-title">
          Avanzado
        </h3>
        <dl className="connection-advanced">
          <div className="connection-advanced-row">
            <dt>URL del servicio local</dt>
            <dd data-testid="agent-service-url">{serviceUrl}</dd>
          </div>
          <div className="connection-advanced-row">
            <dt>Carpeta de sesiones</dt>
            <dd data-testid="agent-sessions-dir">{sessionsDir}</dd>
          </div>
          <div className="connection-advanced-row">
            <dt>Autenticación</dt>
            <dd data-testid="agent-auth-mask">{authMask}</dd>
          </div>
          <div className="connection-advanced-row">
            <dt>Permisos del agente</dt>
            <dd data-testid="agent-permissions">
              {status.permissionsVerified === true
                ? "Verificados (sin herramientas)"
                : status.permissionsVerified === false
                  ? "Sin verificar"
                  : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <footer className="connection-dialog-footer">
        <button type="button" className="button" data-testid="agent-dialog-close" onClick={onClose}>
          Cerrar
        </button>
        <button
          type="button"
          className="button button-primary"
          data-testid="agent-primary"
          onClick={onReconnect}
          disabled={connecting}
        >
          {status.state === "ready" ? "Reconectar" : "Conectar"}
        </button>
      </footer>
    </>
  );
}
