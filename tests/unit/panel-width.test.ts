import { describe, expect, it } from "vitest";
import {
  clampAgentWidth,
  DEFAULT_AGENT_WIDTH,
  MAX_AGENT_WIDTH,
  MIN_AGENT_WIDTH,
} from "../../src/lib/panel-width";

describe("clampAgentWidth", () => {
  it("respeta el mínimo de 320", () => {
    expect(clampAgentWidth(100, 1400)).toBe(MIN_AGENT_WIDTH);
    expect(clampAgentWidth(-50, 1400)).toBe(MIN_AGENT_WIDTH);
  });

  it("respeta el máximo absoluto de 640", () => {
    expect(clampAgentWidth(900, 1800)).toBe(MAX_AGENT_WIDTH);
  });

  it("limita al 50% del viewport cuando es menor que 640", () => {
    expect(clampAgentWidth(600, 900)).toBe(450);
    expect(clampAgentWidth(600, 1000)).toBe(500);
    expect(clampAgentWidth(420, 900)).toBe(420);
  });

  it("mantiene el mínimo en viewports muy estrechos", () => {
    expect(clampAgentWidth(500, 500)).toBe(MIN_AGENT_WIDTH);
  });

  it("redondea al píxel entero", () => {
    expect(clampAgentWidth(400.4, 1400)).toBe(400);
    expect(clampAgentWidth(400.6, 1400)).toBe(401);
  });

  it("usa el ancho por defecto para NaN y el máximo con viewport no finito", () => {
    expect(clampAgentWidth(Number.NaN, 1400)).toBe(DEFAULT_AGENT_WIDTH);
    expect(clampAgentWidth(Number.POSITIVE_INFINITY, 1400)).toBe(DEFAULT_AGENT_WIDTH);
    expect(clampAgentWidth(500, Number.NaN)).toBe(500);
  });
});
