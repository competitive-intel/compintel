import { useEffect, useRef } from "react";

import { useTheme } from "../lib/theme";
import { cn } from "../lib/utils";
import { Textarea } from "./ui/textarea";

export function CodeEditor({
  id,
  value,
  onChange,
  ariaLabel,
  className,
  height = 448,
  required = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  height?: number;
  required?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<
    import("monaco-editor").editor.IStandaloneCodeEditor | undefined
  >(undefined);
  const onChangeRef = useRef(onChange);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  const valueRef = useRef(value);

  onChangeRef.current = onChange;
  themeRef.current = theme;
  valueRef.current = value;

  useEffect(() => {
    if (import.meta.env.MODE === "test" || containerRef.current === null)
      return;

    let active = true;
    let contentSubscription: { dispose: () => void } | undefined;

    void import("../lib/monaco").then(async ({ getMonaco }) => {
      const monaco = await getMonaco();
      if (!active || containerRef.current === null) return;

      const editor = monaco.editor.create(containerRef.current, {
        value: valueRef.current,
        language: "cpp",
        theme: themeRef.current === "dark" ? "github-dark" : "github-light",
        automaticLayout: true,
        ariaLabel,
        fontSize: 14,
        lineHeight: 22,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 2,
      });
      editorRef.current = editor;
      contentSubscription = editor.onDidChangeModelContent(() => {
        onChangeRef.current(editor.getValue());
      });
    });

    return () => {
      active = false;
      contentSubscription?.dispose();
      editorRef.current?.dispose();
      editorRef.current = undefined;
    };
  }, [ariaLabel]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor !== undefined && editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  useEffect(() => {
    if (editorRef.current === undefined) return;
    void import("../lib/monaco").then(({ getMonaco }) =>
      getMonaco().then((monaco) => {
        monaco.editor.setTheme(
          theme === "dark" ? "github-dark" : "github-light",
        );
      }),
    );
  }, [theme]);

  if (import.meta.env.MODE === "test") {
    return (
      <Textarea
        id={id}
        className={className}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-label={ariaLabel}
        spellCheck={false}
        required={required}
      />
    );
  }

  return (
    <div
      id={id}
      ref={containerRef}
      className={cn(
        "overflow-hidden rounded-md border bg-background",
        className,
      )}
      style={{ height }}
      data-required={required || undefined}
    />
  );
}
