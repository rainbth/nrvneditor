import { describe, expect, it } from "vitest";
import { blockContextItems } from "../../src/lib/context-menu-items";

describe("blockContextItems", () => {
  it("mantiene labels y orden y respeta permisos", () => {
    const x = blockContextItems({ canEdit: false, agentAvailable: false, operations: true });
    expect(x.map((i) => i.label)).toEqual([
      "Cortar",
      "Copiar",
      "Pegar",
      "Seleccionar todo",
      "Revisar selección",
      "Comentar bloque",
      "Versiones",
      "Pedir al agente…",
      "Extender narrativa",
      "Reducir narrativa",
      "Mover arriba",
      "Mover abajo",
      "Duplicar bloque",
      "Eliminar bloque",
    ]);
    expect(x.map((i) => i.disabled)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(x.map((i) => i.shortcut)).toEqual([
      "⌘X",
      "⌘C",
      "⌘V",
      "⌘A",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "⌘⇧↑",
      "⌘⇧↓",
      "⌘D",
      "⌘⌫",
    ]);
  });
  it("deshabilita operaciones bloqueadas por pendiente, markdown y límites", () => {
    const top = blockContextItems({
      canEdit: true,
      agentAvailable: true,
      operations: true,
      atTop: true,
    });
    expect(top.slice(10, 14).map((i) => i.disabled)).toEqual([true, false, false, false]);
    const pending = blockContextItems({
      canEdit: true,
      agentAvailable: true,
      operations: true,
      pending: true,
    });
    expect(pending.slice(10, 14).every((i) => i.disabled)).toBe(true);
  });
  it("deshabilita operaciones protegidas y solo el movimiento junto a un pendiente", () => {
    const protectedItems = blockContextItems({
      canEdit: true,
      agentAvailable: true,
      operations: true,
      protected: true,
    });
    expect(protectedItems.slice(10, 14).every((item) => item.disabled)).toBe(true);

    const previousPending = blockContextItems({
      canEdit: true,
      agentAvailable: true,
      operations: true,
      prevPending: true,
    });
    expect(previousPending.slice(10, 14).map((item) => item.disabled)).toEqual([
      true,
      false,
      false,
      false,
    ]);

    const nextPending = blockContextItems({
      canEdit: true,
      agentAvailable: true,
      operations: true,
      nextPending: true,
    });
    expect(nextPending.slice(10, 14).map((item) => item.disabled)).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });
  it("separa los permisos de clipboard de la edición del bloque", () => {
    const items = blockContextItems({
      canEdit: true,
      canClipboard: false,
      agentAvailable: true,
    });
    expect(items.slice(0, 4).map((item) => item.disabled)).toEqual([true, true, true, false]);
  });
  it("asigna intenciones y habilita comentar únicamente con un bloque", () => {
    const items = blockContextItems({ canEdit: false, agentAvailable: true, operations: true });
    expect(items.find((item) => item.action === "comment")).toMatchObject({
      group: "review",
      disabled: false,
    });
    expect(items.filter((item) => item.group === "write")).toHaveLength(4);
    expect(items.filter((item) => item.action === "review")).toHaveLength(1);
    expect(items.filter((item) => item.group === "block")).toHaveLength(4);
  });

  it("habilita las acciones narrativas solo con elegibilidad y bloque no ocupado", () => {
    const enabled = blockContextItems({
      canEdit: true,
      agentAvailable: true,
      operations: true,
      narrative: { canExtend: true, canReduce: true },
    });
    expect(enabled.find((item) => item.action === "extend-narrative")).toMatchObject({
      label: "Extender narrativa",
      disabled: false,
    });
    const blocked = blockContextItems({
      canEdit: true,
      agentAvailable: true,
      operations: true,
      narrative: {
        canExtend: false,
        canReduce: false,
        extendReason: "Solo disponible en párrafos, citas e ítems de lista",
        reduceReason: "Solo disponible en párrafos, citas e ítems de lista",
      },
    });
    expect(blocked.find((item) => item.action === "reduce-narrative")).toMatchObject({
      disabled: true,
      title: "Solo disponible en párrafos, citas e ítems de lista",
    });
    const busy = blockContextItems({
      canEdit: true,
      agentAvailable: true,
      operations: true,
      narrative: { canExtend: true, canReduce: true, busyKind: "extend" },
    });
    expect(busy.find((item) => item.action === "extend-narrative")).toMatchObject({
      label: "Escribiendo…",
      disabled: true,
    });
  });

  it("bloquea acciones narrativas si el agente no está listo u ocupado", () => {
    const unavailable = blockContextItems({
      canEdit: true,
      agentAvailable: false,
      operations: true,
      narrative: { canExtend: true, canReduce: true },
    });
    expect(unavailable.find((item) => item.action === "extend-narrative")).toMatchObject({
      disabled: true,
      title: "Conecta el agente para usarlo",
    });
    expect(unavailable.find((item) => item.action === "reduce-narrative")).toMatchObject({
      disabled: true,
      title: "Conecta el agente para usarlo",
    });

    const agentBusy = blockContextItems({
      canEdit: true,
      agentAvailable: true,
      operations: true,
      narrative: { canExtend: true, canReduce: true, agentBusy: true },
    });
    expect(agentBusy.find((item) => item.action === "extend-narrative")).toMatchObject({
      disabled: true,
      title: "El agente está respondiendo; espera a que termine",
    });

    const rewriting = blockContextItems({
      canEdit: true,
      agentAvailable: true,
      operations: true,
      narrative: { canExtend: true, canReduce: true, busyKind: "extend" },
    });
    expect(rewriting.find((item) => item.action === "reduce-narrative")).toMatchObject({
      title: "Ya hay una reescritura en curso",
    });
  });
});
