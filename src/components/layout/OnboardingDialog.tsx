import { runCommand } from "../../lib/commands";
import { useUiStore } from "../../store/ui";
import { useWorkspaceStore } from "../../store/workspace";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";

export const ONBOARDING_STEPS = [
  "Abre una carpeta con tus documentos .md.",
  "Haz clic en un párrafo o sección para seleccionar el área de trabajo.",
  "Pide un cambio al agente y acepta, rechaza o pide ajustes sobre el diff.",
];

export function OnboardingDialog() {
  const open = useUiStore((state) => state.onboardingOpen);
  const dismiss = useUiStore((state) => state.dismissOnboarding);
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && dismiss()}>
      <DialogContent className="onboarding-dialog" data-testid="onboarding-dialog">
        <DialogTitle>Bienvenido a nrvn</DialogTitle>
        <DialogDescription>
          Un editor local de Markdown donde el agente propone y tú decides.
        </DialogDescription>
        <ol className="onboarding-steps">
          {ONBOARDING_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="onboarding-note">
          Puedes volver a ver esta guía desde la barra superior (Guía rápida) o desde Ayuda en el
          menú de macOS. Para pedir cambios al agente, conecta OpenCode desde el panel derecho.
        </p>
        <div className="onboarding-actions">
          <DialogClose asChild>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void useWorkspaceStore.getState().openFolder()}
            >
              Abrir carpeta
            </button>
          </DialogClose>
          <DialogClose asChild>
            <button type="button" className="button" onClick={() => runCommand("new-document")}>
              Empezar con un borrador
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
