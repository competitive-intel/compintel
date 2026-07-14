import { katex } from "@mdit/plugin-katex";
import MarkdownIt from "markdown-it";
import { useEffect, useMemo, useState } from "react";

import "katex/dist/katex.min.css";

import { cn } from "../lib/utils";

type CodeRenderer = (code: string, language: string) => string;

export function MarkdownContent({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const [highlight, setHighlight] = useState<CodeRenderer | null>(null);

  useEffect(() => {
    let active = true;
    void import("../lib/syntax-highlighter").then(
      async ({ getSyntaxHighlighter, highlightCode }) => {
        const highlighter = await getSyntaxHighlighter();
        if (active) {
          setHighlight(
            () => (code: string, language: string) =>
              highlightCode(highlighter, code, language),
          );
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const html = useMemo(
    () => createRenderer(highlight).render(children),
    [children, highlight],
  );

  return (
    <div
      className={cn("markdown-content", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function createRenderer(highlight: CodeRenderer | null): MarkdownIt {
  return new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    highlight:
      highlight === null
        ? undefined
        : (code, language) => highlight(code, language),
  }).use(katex, {
    delimiters: "all",
    throwOnError: false,
  });
}
