import { useEffect, useState } from "react";

import { cn } from "../lib/utils";

export function CodeHighlight({
  code,
  language = "cpp",
  className,
  label,
}: {
  code: string;
  language?: string;
  className?: string;
  label?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void import("../lib/syntax-highlighter").then(
      async ({ getSyntaxHighlighter, highlightCode }) => {
        const highlighter = await getSyntaxHighlighter();
        if (active) setHtml(highlightCode(highlighter, code, language));
      },
    );
    return () => {
      active = false;
    };
  }, [code, language]);

  if (html === null) {
    return (
      <pre
        className={cn(
          "max-h-160 overflow-auto rounded-md border bg-muted p-4 font-mono text-xs leading-6 text-foreground sm:p-6 sm:text-sm",
          className,
        )}
        aria-label={label}
      >
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className={cn("code-highlight", className)}
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
