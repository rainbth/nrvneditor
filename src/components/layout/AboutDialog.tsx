import { nrvn } from "../../lib/ipc";
import { useUiStore } from "../../store/ui";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";

const FEATURES = [
  "Editor Markdown con autoguardado",
  "Modos Render y Markdown con tamaños Carta, A4, Ancha y Web",
  "Árbol de workspace y outline",
  "Agente IA (OpenCode) por documento",
  "Personas/audiencias con propuestas y críticas",
  "Comentarios por bloque",
  "Variante desde revisión (a partir de una crítica)",
  "Metadatos e importación/exportación",
  "Temas claro/oscuro y fuentes Lato/Newsreader/Sistema",
];

export function AboutDialog() {
  const open = useUiStore((state) => state.aboutOpen);
  const setAboutOpen = useUiStore((state) => state.setAboutOpen);
  return (
    <Dialog open={open} onOpenChange={setAboutOpen}>
      <DialogContent className="about-dialog" data-testid="about-dialog">
        <DialogTitle>Acerca de nrvn</DialogTitle>
        <DialogDescription>Editor local de Markdown con agentes.</DialogDescription>
        <dl className="about-meta">
          <div className="about-row">
            <dt>Versión</dt>
            <dd data-testid="about-version">{nrvn.app.version}</dd>
          </div>
          <div className="about-row">
            <dt>Commit</dt>
            <dd data-testid="about-commit" title={nrvn.app.commit}>
              {nrvn.app.commit.slice(0, 7)}
            </dd>
          </div>
          <div className="about-row">
            <dt>Electron</dt>
            <dd>{nrvn.app.electronVersion}</dd>
          </div>
          <div className="about-row">
            <dt>Plataforma</dt>
            <dd>{nrvn.app.platform}</dd>
          </div>
        </dl>
        <section className="about-features" data-testid="about-features" aria-label="Funciones">
          <h3>Funciones</h3>
          <ul>
            {FEATURES.map((feature) => (
              <li data-testid="about-feature" key={feature}>
                {feature}
              </li>
            ))}
          </ul>
        </section>
        <section
          className="about-legal"
          data-testid="about-legal"
          aria-label="Licencia y avisos legales"
        >
          <h3>Licencia y avisos legales</h3>
          <p>
            Licencia MIT (open source). Los textos completos (<code>LICENSE</code>,{" "}
            <code>NOTICE</code> y <code>COPYRIGHT</code>) se incluyen con la app en{" "}
            <code>Contents/Resources</code>. Titular: rainbrth.
          </p>
        </section>
        <div className="about-actions">
          <DialogClose asChild>
            <button type="button" className="button button-primary">
              Cerrar
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
