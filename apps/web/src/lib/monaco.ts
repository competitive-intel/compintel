import { shikiToMonaco } from "@shikijs/monaco";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

import { getSyntaxHighlighter } from "./syntax-highlighter";

let initialization: Promise<typeof monaco> | undefined;

export function getMonaco(): Promise<typeof monaco> {
  initialization ??= initializeMonaco();
  return initialization;
}

async function initializeMonaco(): Promise<typeof monaco> {
  globalThis.MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };

  if (!monaco.languages.getLanguages().some(({ id }) => id === "cpp")) {
    monaco.languages.register({ id: "cpp" });
  }

  shikiToMonaco(await getSyntaxHighlighter(), monaco);
  return monaco;
}
