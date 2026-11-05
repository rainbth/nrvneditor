import { describe, expect, it } from "vitest";
import { clearTokenCache, highlightToTokens } from "../../src/lib/shiki";

function plain(tokens: { content: string }[][]): string {
  return tokens.map((line) => line.map((token) => token.content).join("")).join("\n");
}

describe("shiki tokens", () => {
  it("resalta TypeScript en tokens con color y sin HTML", async () => {
    const tokens = await highlightToTokens("const answer: number = 42;", "ts", "light");
    expect(tokens.length).toBe(1);
    expect(plain(tokens)).toBe("const answer: number = 42;");
    expect(tokens[0].some((token) => token.color !== undefined)).toBe(true);
  });

  it("devuelve texto plano para lenguajes desconocidos", async () => {
    const tokens = await highlightToTokens("uno\ndos", "inventado", "dark");
    expect(plain(tokens)).toBe("uno\ndos");
    expect(tokens.every((line) => line.every((token) => token.color === undefined))).toBe(true);
  });

  it("cachea por tema + lenguaje + contenido", async () => {
    clearTokenCache();
    const first = await highlightToTokens("let x = 1;", "ts", "dark");
    const second = await highlightToTokens("let x = 1;", "ts", "dark");
    expect(second).toBe(first);
  });
});
