import { useAgentStore } from "../../store/agent";
import { AgentPresets } from "./AgentPresets";

/** Presets de comportamiento y ámbito de las sesiones del agente. */
export function AgentBehaviorSettings() {
  const sessionScope = useAgentStore((state) => state.sessionScope);
  const setSessionScope = useAgentStore((state) => state.setSessionScope);
  const busy = useAgentStore((state) => state.busy);

  return (
    <>
      <AgentPresets />
      <label className="agent-setting">
        <span className="agent-setting-label">Sesión</span>
        <select
          className="agent-select"
          data-testid="agent-session-scope"
          value={sessionScope}
          disabled={busy}
          onChange={(event) => {
            if (event.target.value === "document" || event.target.value === "workspace") {
              setSessionScope(event.target.value);
            }
          }}
        >
          <option value="document">Documento</option>
          <option value="workspace">Área de trabajo</option>
        </select>
        <span className="agent-setting-label">
          Documento: historial por archivo · Área de trabajo: historial compartido
        </span>
      </label>
    </>
  );
}
