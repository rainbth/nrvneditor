import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createRestrictedSession,
  normalizeSessionDirectory,
  type SessionClientLike,
  sessionCreationError,
} from "../../electron/lib/opencode-session";

function fakeClient(overrides: { updateError?: Error } = {}) {
  const create = vi.fn(async (_input: unknown) => ({ id: "ses_1" }));
  const update = vi.fn(
    async (_input: {
      sessionID: string;
      permissions: ReadonlyArray<{
        action: string;
        resource: string;
        effect: "allow" | "deny" | "ask";
      }>;
    }) => {
      if (overrides.updateError !== undefined) throw overrides.updateError;
    },
  );
  const remove = vi.fn(async (_input: { sessionID: string }) => undefined);
  const client: SessionClientLike = { session: { create, update, remove } };
  return { client, create, update, remove };
}

const OPTIONS = { userDataDir: "/tmp/ud" };

describe("createRestrictedSession", () => {
  it("crea la sesión y aplica el ruleset deny exacto", async () => {
    const fake = fakeClient();
    const result = await createRestrictedSession(
      fake.client,
      {
        directory: "/tmp/ws",
        agent: "build",
        model: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
        title: "Prueba",
      },
      OPTIONS,
    );

    expect(result).toEqual({ sessionID: "ses_1" });
    expect(fake.create).toHaveBeenCalledWith({
      location: { directory: "/tmp/ws" },
      agent: "build",
      model: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
      title: "Prueba",
    });
    expect(fake.update).toHaveBeenCalledTimes(1);
    expect(fake.update).toHaveBeenCalledWith({
      sessionID: "ses_1",
      permissions: [{ action: "*", resource: "*", effect: "deny" }],
    });
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it("si update falla elimina la sesión best-effort y propaga el error", async () => {
    const failure = new Error("update rechazado");
    const fake = fakeClient({ updateError: failure });

    await expect(
      createRestrictedSession(
        fake.client,
        {
          directory: "/tmp/ws",
          agent: "build",
        },
        OPTIONS,
      ),
    ).rejects.toThrow("update rechazado");

    expect(fake.remove).toHaveBeenCalledWith({ sessionID: "ses_1" });
  });
});

/** Cliente que reproduce el 500 del servicio: exige un directorio absoluto. */
function strictClient() {
  const create = vi.fn(async (input: unknown) => {
    const directory = (input as { location: { directory: string } }).location.directory;
    if (directory === "__untitled__" || !path.isAbsolute(directory)) {
      throw new Error(`Path is not absolute: ${directory}`);
    }
    return { id: "ses_abs" };
  });
  const update = vi.fn(async () => undefined);
  const client: SessionClientLike = { session: { create, update } };
  return { client, create, update };
}

describe("normalizeSessionDirectory", () => {
  it("resuelve el borrador sin título a la carpeta de sesiones", () => {
    expect(normalizeSessionDirectory("__untitled__", "/tmp/ud")).toBe("/tmp/ud/opencode/sessions");
  });

  it("resuelve rutas relativas a la carpeta de sesiones", () => {
    expect(normalizeSessionDirectory("notas", "/tmp/ud")).toBe("/tmp/ud/opencode/sessions");
  });

  it("resuelve cadenas vacías a la carpeta de sesiones", () => {
    expect(normalizeSessionDirectory("   ", "/tmp/ud")).toBe("/tmp/ud/opencode/sessions");
  });

  it("conserva las rutas absolutas normalizadas", () => {
    expect(normalizeSessionDirectory("/tmp/workspace", "/tmp/ud")).toBe(
      path.normalize("/tmp/workspace"),
    );
  });

  it("es determinista", () => {
    expect(normalizeSessionDirectory("__untitled__", "/tmp/ud")).toBe(
      normalizeSessionDirectory("__untitled__", "/tmp/ud"),
    );
  });
});

describe("sessionCreationError", () => {
  it("incluye ruta, modo y detalle original", () => {
    const error = sessionCreationError("/tmp/sesiones", "local", new Error("boom"));
    expect(error.message).toContain("/tmp/sesiones");
    expect(error.message).toContain("modo local");
    expect(error.message).toContain("boom");
  });

  it("usa modo embebido y desconocido", () => {
    expect(sessionCreationError("/x", "embedded", new Error("e")).message).toContain(
      "modo embebido",
    );
    expect(sessionCreationError("/x", null, new Error("e")).message).toContain("modo desconocido");
  });

  it("añade una pista accionable ante errores de estado o ruta no absoluta", () => {
    const details = [
      "UnexpectedStatus",
      "UnexpectedStatus: 500",
      "HTTP 500",
      "status code 500",
      "Path is not absolute: x",
    ];
    for (const detail of details) {
      expect(sessionCreationError("/x", "local", new Error(detail)).message).toContain(
        "Comprueba que el servicio local esté actualizado",
      );
    }
    expect(sessionCreationError("/x", "local", new Error("otra cosa")).message).not.toContain(
      "Comprueba que el servicio local",
    );
  });

  it("no confunde un 500 dentro de una ruta con un error de estado", () => {
    const error = sessionCreationError(
      "/tmp/500/x",
      "local",
      new Error("/tmp/500/x no está disponible"),
    );
    expect(error.message).not.toContain("Comprueba que el servicio local");
  });
});

describe("regresión: ruta sin normalizar rompe session.create", () => {
  it("normaliza __untitled__ dentro de createRestrictedSession y crea en la carpeta de sesiones", async () => {
    const fake = strictClient();

    const result = await createRestrictedSession(
      fake.client,
      { directory: "__untitled__", agent: "build" },
      { userDataDir: "/tmp/ud" },
    );

    expect(result).toEqual({ sessionID: "ses_abs" });
    expect(fake.create).toHaveBeenCalledTimes(1);
    expect(fake.create).toHaveBeenCalledWith(
      expect.objectContaining({ location: { directory: "/tmp/ud/opencode/sessions" } }),
    );
  });
});
