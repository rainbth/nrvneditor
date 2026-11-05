import { describe, expect, it } from "vitest";
import { buildPrompt, type PromptContext } from "../../src/lib/prompt";

describe("buildPrompt", () => {
  it("genera el prompt exacto con archivo, ruta, bloques e instrucción", () => {
    const context: PromptContext = {
      path: "guia-estilo.md",
      headingTrail: ["Guía de estilo", "Escritura"],
      blocks: [
        { key: "Guía de estilo › Escritura#heading:0", type: "heading", raw: "## Escritura" },
        {
          key: "Guía de estilo › Escritura#paragraph:0",
          type: "paragraph",
          raw: "Escribe con frases cortas.",
        },
      ],
      instruction: "Hazlo más conciso.",
    };

    expect(buildPrompt(context)).toBe(
      `Eres el agente editor de nrvn. Propones cambios sobre bloques Markdown concretos.
Revisor y audiencia son conceptos distintos. El revisor es un ayudante con un rol concreto que critica el texto; la audiencia es el destinatario del texto (para quién se escribe), modula el tono y no critica.

Archivo: guia-estilo.md
Ruta: Guía de estilo › Escritura
Bloques: 2

<<<NRVN_BLOCK key="Guía de estilo › Escritura#heading:0">>>
## Escritura
<<<NRVN_END>>>

<<<NRVN_BLOCK key="Guía de estilo › Escritura#paragraph:0">>>
Escribe con frases cortas.
<<<NRVN_END>>>

Reglas de fidelidad:
- Intervención mínima: cambia solo lo que el requerimiento exige.
- Conserva la voz y el registro del autor.
- Conserva la longitud aproximada y el ritmo.
- Conserva la estructura y el formato Markdown del bloque.
- No reescribas lo que ya funciona; no modernices el estilo.
- No introduzcas vocabulario que el autor no usaría.
- Si dudas entre dos opciones, elige la que menos se aleje del original.

Contrato de salida:
- Responde solo con bloques usando <<<NRVN_BLOCK key="...">>>, el Markdown completo del bloque y <<<NRVN_END>>>.
- Usa exactamente las claves proporcionadas; no inventes bloques.
- Preserva el Markdown: títulos, listas, tablas, fences y sangría.
- No expliques nada, no uses herramientas y no añadas texto fuera de los bloques.
- Si no propones cambios, responde solo <<<NRVN_NO_CHANGE>>>.

Instrucción:
Hazlo más conciso.`,
    );
  });

  it("solo incluye los bloques recibidos (la selección), nunca el documento completo", () => {
    const selectedRaw = "Este párrafo está seleccionado.";
    const unselectedRaw = "Este párrafo NO debe aparecer en el prompt.";
    const prompt = buildPrompt({
      path: null,
      headingTrail: [],
      blocks: [{ key: "Documento#paragraph:0", type: "paragraph", raw: selectedRaw }],
      instruction: "Acorta.",
    });

    expect(prompt).toContain("Archivo: Borrador sin título");
    expect(prompt).toContain("Ruta: Documento");
    expect(prompt).toContain(selectedRaw);
    expect(prompt).not.toContain(unselectedRaw);
    expect(prompt).toContain("Bloques: 1");
  });

  it("incluye la propuesta rechazada antes de la instrucción", () => {
    const unselectedRaw = "Párrafo no incluido en la petición.";
    const prompt = buildPrompt({
      path: "guia-estilo.md",
      headingTrail: ["Guía de estilo"],
      blocks: [{ key: "Guía de estilo#paragraph:0", type: "paragraph", raw: "Texto actual." }],
      previousProposal: {
        blocks: [
          {
            key: "Guía de estilo#paragraph:0",
            before: "Texto actual.",
            after: "Texto propuesto.",
          },
        ],
      },
      instruction: "Hazlo más breve.",
    });

    expect(prompt).toContain("Propuesta anterior (rechazada):");
    expect(prompt).toContain("- key: Guía de estilo#paragraph:0");
    expect(prompt).toContain("  antes:\n  Texto actual.");
    expect(prompt).toContain("  después:\n  Texto propuesto.");
    expect(prompt.indexOf("Propuesta anterior (rechazada):")).toBeLessThan(
      prompt.indexOf("Instrucción:"),
    );
    expect(prompt).not.toContain(unselectedRaw);

    const withoutPrevious = buildPrompt({
      path: "guia-estilo.md",
      headingTrail: ["Guía de estilo"],
      blocks: [{ key: "Guía de estilo#paragraph:0", type: "paragraph", raw: "Texto actual." }],
      instruction: "Hazlo más breve.",
    });
    expect(withoutPrevious).not.toContain("Propuesta anterior (rechazada):");
  });
});
