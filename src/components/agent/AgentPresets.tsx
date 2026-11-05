import { useEffect, useState } from "react";
import { activePreset } from "../../lib/presets";
import { useAgentStore } from "../../store/agent";
import { useUiStore } from "../../store/ui";

export function AgentPresets() {
  const presets = useAgentStore((state) => state.presets);
  const presetId = useAgentStore((state) => state.presetId);
  const agent = useAgentStore((state) => state.agent);
  const model = useAgentStore((state) => state.model);
  const setPreset = useAgentStore((state) => state.setPreset);
  const savePreset = useAgentStore((state) => state.savePreset);
  const deletePreset = useAgentStore((state) => state.deletePreset);
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    const preset = activePreset(presets, presetId);
    setName(preset?.name ?? "");
    setInstruction(preset?.instruction ?? "");
  }, [presets, presetId]);

  return (
    <div className="agent-setting">
      <label className="agent-setting">
        <span className="agent-setting-label">Preset</span>
        <select
          className="agent-select"
          data-testid="agent-preset"
          value={presetId ?? ""}
          onChange={(event) => setPreset(event.target.value || null)}
        >
          <option value="">Sin preset</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
      <p className="agent-setting-label">
        Cambiar de preset aplica su agente y modelo; la conversación activa se reinicia
      </p>
      <label className="agent-setting">
        <span className="agent-setting-label">Nombre del preset</span>
        <input
          className="agent-select"
          data-testid="agent-preset-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="agent-setting">
        <span className="agent-setting-label">Comportamiento</span>
        <textarea
          className="agent-select"
          data-testid="agent-preset-instruction"
          rows={4}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="button"
        data-testid="agent-preset-save"
        onClick={() => {
          if (!name.trim() || (instruction.trim() === "" && agent === null && model === null))
            return;
          savePreset({
            ...(presetId === null ? {} : { id: presetId }),
            name: name.trim(),
            instruction,
            agent,
            model,
          });
          setName("");
          setInstruction("");
          useUiStore.getState().setToast("Preset guardado");
        }}
        disabled={!name.trim() || (instruction.trim() === "" && agent === null && model === null)}
      >
        Guardar
      </button>
      <button
        type="button"
        className="button"
        data-testid="agent-preset-delete"
        disabled={presetId === null}
        onClick={() => {
          if (presetId !== null) {
            deletePreset(presetId);
            useUiStore.getState().setToast("Preset eliminado");
          }
        }}
      >
        Eliminar
      </button>
    </div>
  );
}
