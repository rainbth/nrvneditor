import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import type { TokenStyle } from "../../lib/shiki";
import { highlightToTokens, type TokenLine } from "../../lib/shiki";
import { useUiStore } from "../../store/ui";

export interface CodeBlockProps {
  code: string;
  lang?: string;
}

function useResolvedTheme(): "light" | "dark" {
  const theme = useUiStore((state) => state.theme);
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

function fontStyleOf(fontStyle: number | undefined): "normal" | "italic" | undefined {
  if (fontStyle === undefined) return undefined;
  return (fontStyle & 1) === 1 ? "italic" : "normal";
}

function fontWeightOf(fontStyle: number | undefined): "bold" | undefined {
  if (fontStyle === undefined) return undefined;
  return (fontStyle & 2) === 2 ? "bold" : undefined;
}

/** Pinta líneas/tokens con claves estables basadas en el offset acumulado. */
function tokenLines(tokens: TokenLine[]) {
  let offset = 0;
  return tokens.map((line) => {
    const lineKey = `line-${offset}`;
    const spans = line.map((token) => {
      const key = `token-${offset}`;
      offset += token.content.length;
      return <TokenSpans key={key} token={token} />;
    });
    offset += 1; // salto de línea
    return (
      <span className="code-line" key={lineKey}>
        {spans}
      </span>
    );
  });
}

function TokenSpans({ token }: { token: TokenStyle }) {
  return (
    <span
      style={{
        color: token.color,
        fontStyle: fontStyleOf(token.fontStyle),
        fontWeight: fontWeightOf(token.fontStyle),
      }}
    >
      {token.content}
    </span>
  );
}

/** Bloque de código con resaltado Shiki por tokens (sin HTML crudo). */
export function CodeBlock({ code, lang }: CodeBlockProps) {
  const theme = useResolvedTheme();
  const [tokens, setTokens] = useState<TokenLine[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTokens(null);
    void highlightToTokens(code, lang, theme)
      .then((next) => {
        if (!cancelled) setTokens(next);
      })
      .catch(() => {
        if (!cancelled) setTokens(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang, theme]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const onCopy = () => {
    void navigator.clipboard
      .writeText(code)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <div className="code-block-wrap">
      <div className="code-block-head">
        <span className="code-lang">{lang ?? "text"}</span>
        <button
          type="button"
          className="code-copy"
          onClick={onCopy}
          aria-label={copied ? "Copiado" : "Copiar código"}
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          <span>{copied ? "Copiado" : "Copiar"}</span>
        </button>
      </div>
      <pre className="code-block" data-lang={lang ?? "text"}>
        <code>{tokens === null ? code : tokenLines(tokens)}</code>
      </pre>
    </div>
  );
}
