import { Plugin } from "@opencode/plugin";

/** ID estable del agente de nrvn. */
export const NRVN_AGENT_ID = "nrvn-editor";

/** ID estable del plugin que desactiva todos los servidores MCP. */
export const DISABLE_MCP_PLUGIN_ID = "nrvn-disable-mcp";

/**
 * Prompt de sistema del agente `nrvn-editor`.
 *
 * El parser de propuestas (otro módulo) espera exclusivamente bloques con los
 * marcadores `<<<NRVN_BLOCK key="...">>>` … `<<<NRVN_END>>>`. El agente no debe
 * usar herramientas ni explicar: sólo devolver los bloques editados.
 */
export const NRVN_SYSTEM_PROMPT = [
  "Eres el editor de Markdown de nrvn. Recibes una instrucción y el contenido exacto de uno o varios bloques del documento.",
  "Edita únicamente la selección indicada. No añadas preámbulos, explicaciones, listas de pasos ni comentarios.",
  "Devuelve SOLO bloques con este formato exacto, uno tras otro, sin texto fuera de ellos:",
  '<<<NRVN_BLOCK key="clave-del-bloque">>>',
  "contenido nuevo del bloque",
  "<<<NRVN_END>>>",
  "Preserva el Markdown válido (encabezados, listas, tablas, citas, enlaces y fences) y el idioma del documento.",
  "No uses herramientas, ni shell, ni lectura de archivos: trabaja sólo con el texto recibido.",
  "Si no puedes proponer un cambio, devuelve exactamente: <<<NRVN_NO_CHANGE>>>",
].join("\n");

/**
 * Permisos del agente en el formato de configuración V1 que el host 2.2.x
 * migra en runtime. `normalizeAction` traduce `bash` → `shell` y
 * `task` → `subagent`; el resto de claves son los nombres de herramienta.
 * Las reglas se anexan a los defaults y, como la evaluación es `findLast`,
 * el `deny` gana sobre el `allow: *` por defecto.
 */
export const NRVN_AGENT_PERMISSIONS = {
  "*": "deny",
  edit: "deny",
  bash: "deny",
  read: "deny",
  glob: "deny",
  grep: "deny",
  webfetch: "deny",
  websearch: "deny",
  task: "deny",
  question: "deny",
  browser: "deny",
  external_directory: "deny",
} as const;

/**
 * Acciones de herramienta que nrvn conoce y debe ver denegadas en un agente
 * seguro. Se deriva de `NRVN_AGENT_PERMISSIONS` sin el comodín.
 */
export const NRVN_KNOWN_TOOL_ACTIONS = Object.keys(NRVN_AGENT_PERMISSIONS).filter(
  (action): action is Exclude<keyof typeof NRVN_AGENT_PERMISSIONS, "*"> => action !== "*",
);

export interface PermissionRule {
  action: string;
  resource: string;
  effect: string;
}

/**
 * Indica si un conjunto de reglas de permiso (formato V2: `action`/`resource`/
 * `effect`) deniega todas las herramientas conocidas. La evaluación es
 * `findLast`: la última regla que casa con la acción (o el comodín `*`) decide.
 */
export function hasNoToolsPermissions(rules: PermissionRule[]): boolean {
  const effective = (action: string): string | undefined => {
    for (let index = rules.length - 1; index >= 0; index -= 1) {
      const rule = rules[index];
      if (rule.action !== action && rule.action !== "*") continue;
      if (rule.resource !== "*" && rule.resource !== "**" && rule.resource !== "") continue;
      return rule.effect;
    }
    return undefined;
  };
  return NRVN_KNOWN_TOOL_ACTIONS.every((action) => effective(action) === "deny");
}

export interface AgentConfig {
  $schema: string;
  agent: Record<
    string,
    {
      description: string;
      mode: "primary";
      prompt: string;
      permission: Record<string, "allow" | "deny" | "ask">;
    }
  >;
}

/**
 * Configuración inyectada en `OpenCode.create({ config: { content } })`.
 *
 * OJO (verificado con probe empírico contra @opencode/sdk 2.2.3): el host
 * decodifica el contenido con el schema V1, donde el prompt de sistema es
 * `prompt` y las reglas son el mapa `permission`. Los campos `system` y
 * `permissions` del schema V2 se ignoran en este camino.
 */
export function buildAgentConfig(): AgentConfig {
  return {
    $schema: "https://opencode.ai/config.json",
    agent: {
      [NRVN_AGENT_ID]: {
        description: "Editor de Markdown de nrvn. Propone reemplazos de bloques.",
        mode: "primary",
        prompt: NRVN_SYSTEM_PROMPT,
        permission: { ...NRVN_AGENT_PERMISSIONS },
      },
    },
  };
}

/** Plugin que desactiva todos los MCP configurados por el usuario. */
export const disableMcpPlugin = Plugin.define({
  id: DISABLE_MCP_PLUGIN_ID,
  async setup(context) {
    await context.mcp.transform((mcp) => {
      for (const [name] of mcp.list()) {
        mcp.update(name, (config) => {
          config.disabled = true;
        });
      }
    });
  },
});
