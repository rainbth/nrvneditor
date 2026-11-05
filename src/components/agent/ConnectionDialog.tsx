import type { RefObject } from "react";
import { nrvn } from "../../lib/ipc";
import { useAgentStore } from "../../store/agent";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { AgentBehaviorSettings } from "./AgentSettings";
import { ConnectionDialogBody } from "./ConnectionDialogBody";

export interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Elemento que abrió el dialog: recupera el foco al cerrar. */
  triggerRef: RefObject<HTMLElement | null>;
}

const PROVIDERS_URL = "https://opencode.ai/docs/providers/";

/** Dialog modal «Conexión y cuenta» conectado al store del agente. */
export function ConnectionDialog({ open, onOpenChange, triggerRef }: ConnectionDialogProps) {
  const catalog = useAgentStore((state) => state.catalog);
  const agent = useAgentStore((state) => state.agent);
  const model = useAgentStore((state) => state.model);
  const status = useAgentStore((state) => state.status);
  const mode = useAgentStore((state) => state.mode);
  const account = useAgentStore((state) => state.account);
  const oauth = useAgentStore((state) => state.oauth);
  const busy = useAgentStore((state) => state.busy);
  const setAgent = useAgentStore((state) => state.setAgent);
  const setModel = useAgentStore((state) => state.setModel);
  const setMode = useAgentStore((state) => state.setMode);
  const retry = useAgentStore((state) => state.retry);
  const startOAuth = useAgentStore((state) => state.startOAuth);
  const cancelOAuth = useAgentStore((state) => state.cancelOAuth);

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="connection-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <DialogTitle>Conexión y cuenta</DialogTitle>
        <DialogDescription className="sr-only">
          Estado de la conexión con OpenCode, cuenta, proveedores y ajustes avanzados.
        </DialogDescription>
        <ConnectionDialogBody
          behavior={<AgentBehaviorSettings />}
          mode={mode}
          agent={agent}
          model={model}
          status={status}
          catalog={catalog}
          account={account}
          oauth={oauth}
          busy={busy}
          onModeChange={setMode}
          onAgentChange={setAgent}
          onModelChange={setModel}
          onReconnect={() => void retry()}
          onStartOAuth={() => void startOAuth()}
          onCancelOAuth={() => void cancelOAuth()}
          onOpenExternal={(url) => void nrvn.app.openExternal(url || PROVIDERS_URL)}
          onClose={close}
        />
      </DialogContent>
    </Dialog>
  );
}
