import cpp from "@shikijs/langs/cpp";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import { createHighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import wasm from "shiki/wasm";

export const codeThemes = {
  dark: "github-dark",
  light: "github-light",
} as const;

export type SyntaxHighlighter = Awaited<ReturnType<typeof createHighlighter>>;

const highlighterPromise = createHighlighter();

export function getSyntaxHighlighter(): Promise<SyntaxHighlighter> {
  return highlighterPromise;
}

export function normalizeCodeLanguage(language: string): "cpp" | "text" {
  const normalized = language.trim().toLowerCase();
  return normalized === "cpp" || normalized === "c++" || normalized === "cxx"
    ? "cpp"
    : "text";
}

export function highlightCode(
  highlighter: SyntaxHighlighter,
  code: string,
  language = "cpp",
): string {
  return highlighter.codeToHtml(code, {
    lang: normalizeCodeLanguage(language),
    themes: codeThemes,
    defaultColor: "light",
  });
}

function createHighlighter() {
  return createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [cpp],
    engine: createOnigurumaEngine(wasm),
  });
}
