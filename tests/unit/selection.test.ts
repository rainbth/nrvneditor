import { beforeEach, describe, expect, it } from "vitest";
import { splitBlocks } from "../../src/lib/blocks";
import { selectedBlocks, selectedIndexes, useSelectionStore } from "../../src/store/selection";

const MARKDOWN = [
  "# Guía",
  "",
  "## Escritura",
  "",
  "Primer párrafo.",
  "",
  "Segundo párrafo.",
  "",
  "### Detalle",
  "",
  "Tercer párrafo.",
  "",
  "## Referencias",
  "",
  "Cuarto párrafo.",
].join("\n");

const blocks = splitBlocks(MARKDOWN);
const snapshot = () => {
  const state = useSelectionStore.getState();
  return { anchor: state.anchor, focus: state.focus, mode: state.mode };
};

describe("selection store", () => {
  beforeEach(() => {
    useSelectionStore.setState({ anchor: null, focus: null, mode: "none" });
  });

  it("selecciona exactamente el bloque clicado", () => {
    useSelectionStore.getState().selectBlock(2);
    expect(selectedIndexes(snapshot(), blocks)).toEqual([2]);
    expect(snapshot()).toEqual({ anchor: 2, focus: 2, mode: "block" });
  });

  it("expande un heading a su sección hasta el siguiente heading de nivel ≤", () => {
    // 0: # Guía, 1: ## Escritura, 2..3: párrafos, 4: ### Detalle, 5: párrafo,
    // 6: ## Referencias (cierra la sección).
    useSelectionStore.getState().selectSection(1);
    expect(selectedIndexes(snapshot(), blocks)).toEqual([1, 2, 3, 4, 5]);
    expect(selectedBlocks(snapshot(), blocks).every((block) => block.key.length > 0)).toBe(true);
  });

  it("extiende el rango hacia delante sin huecos", () => {
    useSelectionStore.getState().selectBlock(2);
    useSelectionStore.getState().extendTo(4);
    expect(selectedIndexes(snapshot(), blocks)).toEqual([2, 3, 4]);
    expect(snapshot().mode).toBe("range");
  });

  it("extiende el rango hacia atrás manteniendo el ancla original", () => {
    useSelectionStore.getState().selectBlock(4);
    useSelectionStore.getState().extendTo(1);
    expect(selectedIndexes(snapshot(), blocks)).toEqual([1, 2, 3, 4]);
    expect(snapshot()).toEqual({ anchor: 4, focus: 1, mode: "range" });
  });

  it("sin ancla, extendTo selecciona el bloque destino en lugar de un rango", () => {
    useSelectionStore.getState().extendTo(3);
    expect(snapshot()).toEqual({ anchor: 3, focus: 3, mode: "block" });
    expect(selectedIndexes(snapshot(), blocks)).toEqual([3]);
  });

  it("clear deja el estado vacío y sin contexto", () => {
    useSelectionStore.getState().selectBlock(2);
    useSelectionStore.getState().clear();
    expect(snapshot()).toEqual({ anchor: null, focus: null, mode: "none" });
    expect(selectedIndexes(snapshot(), blocks)).toEqual([]);
    expect(selectedBlocks(snapshot(), blocks)).toEqual([]);
  });

  it("selectIndexRange fija ancla y foco normalizados con mode range", () => {
    useSelectionStore.getState().selectIndexRange(2, 5);
    expect(snapshot()).toEqual({ anchor: 2, focus: 5, mode: "range" });
    expect(selectedIndexes(snapshot(), blocks)).toEqual([2, 3, 4, 5]);
  });

  it("selectIndexRange acepta el rango invertido", () => {
    useSelectionStore.getState().selectIndexRange(5, 2);
    expect(snapshot()).toEqual({ anchor: 2, focus: 5, mode: "range" });
    expect(selectedIndexes(snapshot(), blocks)).toEqual([2, 3, 4, 5]);
  });

  it("selectIndexRange con índices iguales usa mode block", () => {
    useSelectionStore.getState().selectIndexRange(3, 3);
    expect(snapshot()).toEqual({ anchor: 3, focus: 3, mode: "block" });
    expect(selectedIndexes(snapshot(), blocks)).toEqual([3]);
  });

  it("selectIndexRange clampa índices negativos y respeta el mode explícito", () => {
    useSelectionStore.getState().selectIndexRange(-4, 1);
    expect(snapshot()).toEqual({ anchor: 0, focus: 1, mode: "range" });
    useSelectionStore.getState().selectIndexRange(2, 2, "range");
    expect(snapshot()).toEqual({ anchor: 2, focus: 2, mode: "range" });
  });

  it("selectBlockRange selecciona por claves desde el estado del store", () => {
    useSelectionStore.getState().selectBlockRange(blocks[2].key, blocks[4].key, blocks);
    expect(snapshot()).toEqual({ anchor: 2, focus: 4, mode: "range" });
  });
});
