import path from "node:path";
import { DENY_ALL_PERMISSIONS } from "./opencode-mode";

export interface SessionClientLike {
  session: {
    create(input: unknown): Promise<{ id: string }>;
    update(input: {
      sessionID: string;
      permissions: ReadonlyArray<{
        action: string;
        resource: string;
        effect: "allow" | "deny" | "ask";
      }>;
    }): Promise<void>;
    remove?(input: { sessionID: string }): Promise<void>;
  };
}

export interface RestrictedSessionInput {
  directory: string;
  agent: string;
  model?: { providerID: string; id: string };
  title?: string;
}

export interface RestrictedSessionOptions {
  /** Carpeta de datos de nrvn, usada para normalizar rutas no válidas. */
  userDataDir: string;
}

/**
 * Normaliza el directorio que pide el renderer a una ruta absoluta que el
 * servicio local acepte. Los borradores sin workspace (`__untitled__`), las
 * cadenas vacías y las rutas relativas caen en la carpeta de sesiones de nrvn.
 * Es pura para poder probarla sin Electron.
 */
export function normalizeSessionDirectory(directory: string, userDataDir: string): string {
  const trimmed = directory.trim();
  if (trimmed.length === 0 || trimmed === "__untitled__" || !path.isAbsolute(trimmed)) {
    return path.join(userDataDir, "opencode", "sessions");
  }
  return path.normalize(trimmed);
}

const SESSION_CREATION_HINT =
  "Comprueba que el servicio local esté actualizado y que la carpeta de sesiones exista.";

/**
 * Traduce un fallo de creación de sesión a un error accionable con la ruta y el
 * modo, sin exponer credenciales. Añade una pista cuando el servicio responde
 * con un error de estado o con una ruta no absoluta.
 */
export function sessionCreationError(
  directory: string,
  runtime: string | null,
  error: unknown,
): Error {
  const mode = runtime === "local" ? "local" : runtime === "embedded" ? "embebido" : "desconocido";
  const detail = error instanceof Error ? error.message : "Error desconocido";
  const hint =
    /(?:UnexpectedStatus|(?:HTTP|status(?: code)?)[^\d]{0,5}500|Path is not absolute)/i.test(detail)
      ? ` ${SESSION_CREATION_HINT}`
      : "";
  return new Error(
    `No se pudo crear la sesión del agente en ${directory} (modo ${mode}). ${detail}${hint}`,
  );
}

/**
 * Crea una sesión en el servicio local y la restringe con un ruleset que deniega
 * toda herramienta. Normaliza siempre el directorio (aunque el caller ya lo
 * haya hecho) para que `location.directory` sea absoluto. Si `session.update`
 * falla, elimina la sesión best-effort y propaga el error: nunca se devuelve una
 * sesión sin restringir.
 */
export async function createRestrictedSession(
  client: SessionClientLike,
  input: RestrictedSessionInput,
  options: RestrictedSessionOptions,
): Promise<{ sessionID: string }> {
  const directory = normalizeSessionDirectory(input.directory, options.userDataDir);
  const session = await client.session.create({
    location: { directory },
    agent: input.agent,
    model: input.model,
    title: input.title,
  });

  try {
    await client.session.update({
      sessionID: session.id,
      permissions: DENY_ALL_PERMISSIONS,
    });
  } catch (error) {
    try {
      await client.session.remove?.({ sessionID: session.id });
    } catch {
      // El borrado es best-effort; el error original es el que importa.
    }
    throw error;
  }

  return { sessionID: session.id };
}
