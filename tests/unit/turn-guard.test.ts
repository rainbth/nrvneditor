import { describe, expect, it } from "vitest";
import { isStaleTurnEvent } from "../../electron/lib/turn-guard";

describe("isStaleTurnEvent", () => {
  it("marca obsoleto un evento anterior al prompt", () => {
    expect(isStaleTurnEvent(999, 1000)).toBe(true);
  });

  it("no marca obsoleto un evento del mismo instante o posterior", () => {
    expect(isStaleTurnEvent(1000, 1000)).toBe(false);
    expect(isStaleTurnEvent(1001, 1000)).toBe(false);
  });

  it("sin marca del evento no se puede afirmar que sea obsoleto", () => {
    expect(isStaleTurnEvent(undefined, 1000)).toBe(false);
  });

  it("sin prompt de referencia no se descarta el evento", () => {
    expect(isStaleTurnEvent(999, undefined)).toBe(false);
  });
});
