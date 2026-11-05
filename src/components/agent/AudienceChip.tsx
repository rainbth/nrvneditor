import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { TARGET_AUDIENCES, targetAudienceName } from "../../lib/audiences";
import { useAgentStore } from "../../store/agent";
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../ui/menu";

export function AudienceChip() {
  const targetAudience = useAgentStore((state) => state.targetAudience);
  const helpId = useId();
  return (
    <div className="agent-audience-chip" data-testid="audience-chip">
      <span className="agent-audience-label">Para quién escribo</span>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            className="agent-audience-trigger"
            aria-label={`Para quién escribo: ${targetAudienceName(targetAudience)}`}
            aria-describedby={helpId}
          >
            {targetAudienceName(targetAudience)}
            <ChevronDown size={12} aria-hidden="true" />
          </button>
        </MenuTrigger>
        <MenuContent align="start">
          <MenuLabel>Audiencia de la conversación</MenuLabel>
          <MenuRadioGroup
            value={targetAudience ?? "general"}
            onValueChange={(value) => useAgentStore.getState().setTargetAudience(value)}
          >
            {TARGET_AUDIENCES.map((target) => (
              <MenuRadioItem key={target.id} value={target.id}>
                {target.name}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      <span id={helpId} className="sr-only">
        Para quién escribes · modula el tono, no critica
      </span>
    </div>
  );
}
