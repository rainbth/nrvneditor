import type { RenderFont } from "../../../electron/types";
import { useUiStore } from "../../store/ui";

const FONTS: Array<{ value: RenderFont; label: string }> = [
  { value: "lato", label: "Lato" },
  { value: "newsreader", label: "Newsreader" },
  { value: "system", label: "Sistema" },
];

/** Pie de la hoja en modo Markdown: números de línea y fuente de render. */
export function EditorFooter() {
  const lineNumbers = useUiStore((state) => state.lineNumbers);
  const renderFont = useUiStore((state) => state.renderFont);
  const toggleLineNumbers = useUiStore((state) => state.toggleLineNumbers);
  const setRenderFont = useUiStore((state) => state.setRenderFont);

  return (
    <footer className="editor-footer" data-testid="editor-footer">
      <button
        type="button"
        className="editor-footer-toggle"
        data-testid="line-numbers-toggle"
        aria-pressed={lineNumbers}
        onClick={toggleLineNumbers}
      >
        Números de línea
      </button>
      <label className="editor-footer-font">
        <span>Fuente de render</span>
        <select
          value={renderFont}
          onChange={(event) => setRenderFont(event.target.value as RenderFont)}
        >
          {FONTS.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </label>
    </footer>
  );
}
