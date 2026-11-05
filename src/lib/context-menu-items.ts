export type BlockContextAction =
  | "cut"
  | "copy"
  | "paste"
  | "select-all"
  | "ask-agent"
  | "extend-narrative"
  | "reduce-narrative"
  | "comment"
  | "versions"
  | "review"
  | "move-up"
  | "move-down"
  | "duplicate"
  | "delete";
export interface BlockContextItem {
  action: BlockContextAction;
  label: string;
  disabled: boolean;
  shortcut?: string;
  tone?: "danger";
  title?: string;
  group: "write" | "review" | "block";
}
export function blockContextItems({
  canEdit,
  canClipboard = canEdit,
  agentAvailable,
  operations = false,
  pending = false,
  markdown = false,
  atTop = false,
  atBottom = false,
  protected: isProtected = false,
  prevPending = false,
  nextPending = false,
  prevProtected = false,
  nextProtected = false,
  narrative = { canExtend: false, canReduce: false },
}: {
  canEdit: boolean;
  canClipboard?: boolean;
  agentAvailable: boolean;
  operations?: boolean;
  pending?: boolean;
  markdown?: boolean;
  atTop?: boolean;
  atBottom?: boolean;
  protected?: boolean;
  prevPending?: boolean;
  nextPending?: boolean;
  prevProtected?: boolean;
  nextProtected?: boolean;
  narrative?: {
    canExtend: boolean;
    canReduce: boolean;
    extendReason?: string | null;
    reduceReason?: string | null;
    busyKind?: "extend" | "reduce" | null;
    agentBusy?: boolean;
  };
}): BlockContextItem[] {
  return [
    {
      action: "cut",
      label: "Cortar",
      disabled: !canClipboard,
      title: !canClipboard ? "No hay texto seleccionado" : undefined,
      shortcut: "⌘X",
      group: "write",
    },
    {
      action: "copy",
      label: "Copiar",
      disabled: !canClipboard,
      title: !canClipboard ? "No hay texto seleccionado" : undefined,
      shortcut: "⌘C",
      group: "write",
    },
    {
      action: "paste",
      label: "Pegar",
      disabled: !canClipboard,
      title: !canClipboard ? "No hay texto seleccionado" : undefined,
      shortcut: "⌘V",
      group: "write",
    },
    {
      action: "select-all",
      label: "Seleccionar todo",
      disabled: !canEdit,
      title: !canEdit ? "No hay bloque activo" : undefined,
      shortcut: "⌘A",
      group: "write",
    },
    {
      action: "review",
      label: "Revisar selección",
      disabled: !operations || !agentAvailable,
      title: !agentAvailable ? "Conecta el agente para usarlo" : undefined,
      group: "review",
    },
    {
      action: "comment",
      label: "Comentar bloque",
      disabled: !operations,
      title: !operations ? "No hay bloque seleccionado" : undefined,
      group: "review",
    },
    {
      action: "versions",
      label: "Versiones",
      disabled: !operations,
      title: !operations ? "No hay bloque seleccionado" : undefined,
      group: "review",
    },
    {
      action: "ask-agent",
      label: "Pedir al agente…",
      disabled: !agentAvailable,
      title: !agentAvailable ? "Conecta el agente para usarlo" : undefined,
      group: "review",
    },
    {
      action: "extend-narrative",
      label: narrative.busyKind === "extend" ? "Escribiendo…" : "Extender narrativa",
      disabled:
        !agentAvailable ||
        narrative.agentBusy === true ||
        !narrative.canExtend ||
        narrative.busyKind != null,
      title: !agentAvailable
        ? "Conecta el agente para usarlo"
        : narrative.agentBusy === true
          ? "El agente está respondiendo; espera a que termine"
          : narrative.busyKind === "extend"
            ? "Escribiendo…"
            : narrative.busyKind != null
              ? "Ya hay una reescritura en curso"
              : !narrative.canExtend
                ? (narrative.extendReason ?? "No disponible en este bloque")
                : undefined,
      group: "review",
    },
    {
      action: "reduce-narrative",
      label: narrative.busyKind === "reduce" ? "Escribiendo…" : "Reducir narrativa",
      disabled:
        !agentAvailable ||
        narrative.agentBusy === true ||
        !narrative.canReduce ||
        narrative.busyKind != null,
      title: !agentAvailable
        ? "Conecta el agente para usarlo"
        : narrative.agentBusy === true
          ? "El agente está respondiendo; espera a que termine"
          : narrative.busyKind === "reduce"
            ? "Escribiendo…"
            : narrative.busyKind != null
              ? "Ya hay una reescritura en curso"
              : !narrative.canReduce
                ? (narrative.reduceReason ?? "No disponible en este bloque")
                : undefined,
      group: "review",
    },
    ...(operations
      ? [
          {
            action: "move-up" as const,
            group: "block" as const,
            label: "Mover arriba",
            disabled:
              !canEdit ||
              pending ||
              markdown ||
              atTop ||
              isProtected ||
              prevPending ||
              prevProtected,
            shortcut: "⌘⇧↑",
            title:
              !canEdit ||
              pending ||
              markdown ||
              atTop ||
              isProtected ||
              prevPending ||
              prevProtected
                ? "No se puede mover: primer/último bloque, pendiente o protegido"
                : undefined,
          },
          {
            action: "move-down" as const,
            group: "block" as const,
            label: "Mover abajo",
            disabled:
              !canEdit ||
              pending ||
              markdown ||
              atBottom ||
              isProtected ||
              nextPending ||
              nextProtected,
            shortcut: "⌘⇧↓",
            title:
              !canEdit ||
              pending ||
              markdown ||
              atBottom ||
              isProtected ||
              nextPending ||
              nextProtected
                ? "No se puede mover: primer/último bloque, pendiente o protegido"
                : undefined,
          },
          {
            action: "duplicate" as const,
            group: "block" as const,
            label: "Duplicar bloque",
            disabled: !canEdit || pending || markdown || isProtected,
            shortcut: "⌘D",
            title:
              !canEdit || pending || markdown || isProtected
                ? "No se puede editar este bloque (pendiente o protegido)"
                : undefined,
          },
          {
            action: "delete" as const,
            group: "block" as const,
            label: "Eliminar bloque",
            disabled: !canEdit || pending || markdown || isProtected,
            shortcut: "⌘⌫",
            tone: "danger" as const,
            title:
              !canEdit || pending || markdown || isProtected
                ? "No se puede editar este bloque (pendiente o protegido)"
                : undefined,
          },
        ]
      : []),
  ];
}
