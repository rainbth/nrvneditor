import { createHighlighterCore, type HighlighterCore, type ThemedToken } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import css from "shiki/langs/css.mjs";
import html from "shiki/langs/html.mjs";
import js from "shiki/langs/js.mjs";
import json from "shiki/langs/json.mjs";
import jsx from "shiki/langs/jsx.mjs";
import markdown from "shiki/langs/markdown.mjs";
import python from "shiki/langs/python.mjs";
import shell from "shiki/langs/shell.mjs";
import sql from "shiki/langs/sql.mjs";
import ts from "shiki/langs/ts.mjs";
import tsx from "shiki/langs/tsx.mjs";
import yaml from "shiki/langs/yaml.mjs";
import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";
import { sha256Hex } from "./hash";

/** Un token ya resuelto, listo para pintarse como `<span>`. */
export interface TokenStyle {
  content: string;
  color?: string;
  /** Bits de `FontStyle` de Shiki: 1 = itálica, 2 = negrita, 4 = subrayado. */
  fontStyle?: number;
}

export type TokenLine = TokenStyle[];

export type ShikiTheme = "light" | "dark";

const THEME_NAME: Record<ShikiTheme, string> = {
  light: "github-light",
  dark: "github-dark",
};

const CACHE_LIMIT = 200;

const ALIASES: Record<string, string> = {
  sh: "bash",
  zsh: "bash",
  shellscript: "bash",
  console: "bash",
  yml: "yaml",
  md: "markdown",
  mdx: "markdown",
  jsx: "jsx",
  tsx: "tsx",
  typescript: "ts",
  javascript: "js",
  py: "python",
  html5: "html",
  svg: "html",
};

/**
 * Singleton perezoso con bundle fino: sólo los 13 lenguajes de la lista y los dos
 * temas. Se usa el motor de expresiones regulares en JavaScript en lugar de
 * Oniguruma/WASM para que `script-src 'self'` no bloquee WebAssembly.
 */
let highlighterPromise: Promise<HighlighterCore> | null = null;

export function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [ts, tsx, js, jsx, json, bash, shell, python, css, html, markdown, yaml, sql],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

const cache = new Map<string, TokenLine[]>();

function cacheGet(key: string): TokenLine[] | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  // FIFO real: al reutilizar, no se reordena.
  return hit;
}

function cacheSet(key: string, value: TokenLine[]): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, value);
}

function normalizeLang(lang: string | undefined): string | null {
  if (!lang) return null;
  const cleaned = lang.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (cleaned.length === 0) return null;
  return ALIASES[cleaned] ?? cleaned;
}

function styleOf(token: ThemedToken): TokenStyle {
  const style: TokenStyle = { content: token.content };
  if (token.color !== undefined) style.color = token.color;
  if (token.fontStyle !== undefined) style.fontStyle = token.fontStyle;
  return style;
}

function plainLines(code: string): TokenLine[] {
  return code.split("\n").map((line) => (line.length === 0 ? [] : [{ content: line }]));
}

/**
 * Resalta `code` y devuelve líneas de tokens. Nunca genera HTML: la UI pinta
 * `<span>` de React a partir de esta estructura.
 */
export async function highlightToTokens(
  code: string,
  lang: string | undefined,
  theme: ShikiTheme,
): Promise<TokenLine[]> {
  let highlighter: HighlighterCore;
  try {
    highlighter = await getHighlighter();
  } catch {
    return plainLines(code);
  }

  const requested = normalizeLang(lang);
  if (requested === null || !highlighter.getLoadedLanguages().includes(requested)) {
    return plainLines(code);
  }

  const key = `${theme}|${requested}|${sha256Hex(code).slice(0, 16)}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  try {
    const result = highlighter.codeToTokens(code, {
      lang: requested,
      theme: THEME_NAME[theme],
    });
    const lines = result.tokens.map((line) => line.map(styleOf));
    cacheSet(key, lines);
    return lines;
  } catch {
    return plainLines(code);
  }
}

/** Solo para tests: vacía la caché de tokens. */
export function clearTokenCache(): void {
  cache.clear();
}
