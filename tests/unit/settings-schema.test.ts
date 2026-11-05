import { describe, expect, it } from "vitest";
import { settingsPatchSchema } from "../../electron/ipc";
import { settingsSchema } from "../../electron/types";

describe("settingsSchema · presets y alcance de sesión", () => {
  it("acepta zoom en settingsPatchSchema de IPC y valida el rango permitido", () => {
    expect(settingsPatchSchema.parse({ render: { zoom: 130 } })).toEqual({ render: { zoom: 130 } });
    expect(settingsPatchSchema.safeParse({ render: { zoom: 49 } }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ render: { zoom: 201 } }).success).toBe(false);
  });
  it("usa defaults para presets, preset activo y alcance de sesión", () => {
    const parsed = settingsSchema.parse({});

    expect(parsed.agent.presets).toEqual([]);
    expect(parsed.agent.preset).toBeNull();
    expect(parsed.agent.sessionScope).toBe("document");
    expect(parsed.render.zoom).toBe(100);
  });

  it("valida el zoom de página entre 50 y 200", () => {
    expect(settingsSchema.safeParse({ render: { zoom: 50 } }).success).toBe(true);
    expect(settingsSchema.safeParse({ render: { zoom: 200 } }).success).toBe(true);
    expect(settingsSchema.safeParse({ render: { zoom: 49 } }).success).toBe(false);
    expect(settingsSchema.safeParse({ render: { zoom: 201 } }).success).toBe(false);
  });

  it("conserva un preset válido", () => {
    const preset = {
      id: "writer",
      name: "Writer",
      agent: null,
      model: null,
      instruction: "Write clearly",
    };
    const parsed = settingsSchema.parse({ agent: { presets: [preset] } });

    expect(parsed.agent.presets).toEqual([preset]);
  });

  it("rechaza un alcance de sesión inválido", () => {
    expect(() => settingsSchema.parse({ agent: { sessionScope: "file" } })).toThrow();
  });

  it("rechaza un id de preset vacío", () => {
    expect(() =>
      settingsSchema.parse({
        agent: {
          presets: [{ id: "", name: "Writer", agent: null, model: null, instruction: "" }],
        },
      }),
    ).toThrow();
  });
});
