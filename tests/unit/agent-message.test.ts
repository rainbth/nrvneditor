import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AgentThreadMessage } from "../../electron/types";
import { AgentMessage, cleanAssistantText } from "../../src/components/agent/AgentMessage";

describe("AgentMessage noChange", () => {
  it("muestra «Sin cambios propuestos.» cuando el turno termina vacío", () => {
    const message: AgentThreadMessage = {
      id: "m1",
      role: "assistant",
      text: "<<<NRVN_NO_CHANGE>>>",
      createdAt: 1,
      status: "done",
    };
    const html = renderToStaticMarkup(createElement(AgentMessage, { message, noChange: true }));
    expect(html).toContain("Sin cambios propuestos.");
    expect(html).toContain('data-testid="agent-no-change"');
  });

  it("no muestra el aviso si hay error o el mensaje sigue en streaming", () => {
    const errorMessage: AgentThreadMessage = {
      id: "m2",
      role: "assistant",
      text: "",
      createdAt: 2,
      status: "done",
      error: "falló",
    };
    const errorHtml = renderToStaticMarkup(
      createElement(AgentMessage, { message: errorMessage, noChange: true }),
    );
    expect(errorHtml).not.toContain("Sin cambios propuestos.");

    const streaming: AgentThreadMessage = {
      ...errorMessage,
      status: "streaming",
      error: undefined,
    };
    const streamingHtml = renderToStaticMarkup(
      createElement(AgentMessage, { message: streaming, noChange: true }),
    );
    expect(streamingHtml).not.toContain("Sin cambios propuestos.");
  });
});

describe("AgentMessage resumen de documento", () => {
  it("muestra tal cual el resumen persistido, sin duplicar el documento", () => {
    const message: AgentThreadMessage = {
      id: "m3",
      role: "assistant",
      text: "Propuesta de documento completo lista. Revísala en la tarjeta.",
      createdAt: 3,
      status: "done",
    };
    const html = renderToStaticMarkup(createElement(AgentMessage, { message }));
    expect(html).toContain("Propuesta de documento completo lista. Revísala en la tarjeta.");
    expect(html).not.toContain("Cientos de líneas");
  });

  it("muestra «Documento completo aplicado.» solo si el hilo lo contiene", () => {
    const applied: AgentThreadMessage = {
      id: "m5",
      role: "assistant",
      text: "Documento completo aplicado.",
      createdAt: 5,
      status: "done",
    };
    expect(renderToStaticMarkup(createElement(AgentMessage, { message: applied }))).toContain(
      "Documento completo aplicado.",
    );

    const proposal: AgentThreadMessage = { ...applied, id: "m6", text: "Propuesta lista." };
    const html = renderToStaticMarkup(createElement(AgentMessage, { message: proposal }));
    expect(html).not.toContain("Documento completo aplicado.");
  });

  it("mantiene el streaming visible mientras llega", () => {
    const message: AgentThreadMessage = {
      id: "m4",
      role: "assistant",
      text: "Escribiendo el documento…",
      createdAt: 4,
      status: "streaming",
    };
    const html = renderToStaticMarkup(createElement(AgentMessage, { message, streaming: true }));
    expect(html).toContain("Escribiendo el documento…");
    expect(html).not.toContain("Propuesta de documento completo lista");
  });
});

describe("cleanAssistantText", () => {
  it("elimina los marcadores del contrato y conserva el Markdown interno", () => {
    const raw = [
      "Voy a proponer un cambio:",
      "",
      '<<<NRVN_BLOCK key="intro">>>',
      "## Título nuevo",
      "",
      "- uno",
      "- dos",
      "<<<NRVN_END>>>",
    ].join("\n");

    expect(cleanAssistantText(raw)).toBe(
      ["Voy a proponer un cambio:", "", "## Título nuevo", "", "- uno", "- dos"].join("\n"),
    );
  });

  it("tolera espacios y comillas simples en los marcadores", () => {
    const raw = "<<< NRVN_BLOCK key = 'a' >>>\nHola\n<<< NRVN_END >>>";
    expect(cleanAssistantText(raw)).toBe("Hola");
  });

  it("elimina el marcador de no cambio", () => {
    expect(cleanAssistantText("Listo.\n\n<<<NRVN_NO_CHANGE>>>")).toBe("Listo.");
  });

  it("elimina el marcador de documento completo", () => {
    expect(cleanAssistantText("<<<NRVN_DOCUMENT>>>\n# Hola\n<<<NRVN_END>>>")).toBe("# Hola");
  });

  it("devuelve cadena vacía si solo había marcadores", () => {
    expect(cleanAssistantText('<<<NRVN_BLOCK key="a">>>\n<<<NRVN_END>>>')).toBe("");
  });
});
