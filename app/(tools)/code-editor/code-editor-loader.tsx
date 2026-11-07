"use client";

import dynamic from "next/dynamic";

// Browser-only: the Monaco editor needs the DOM, and files are read from localStorage on first render.
const CodeEditorTool = dynamic(() => import("./code-editor-tool"), {
  ssr: false,
  loading: () => <p className="mt-6 text-sm text-zinc-500">Loading…</p>,
});

export default function CodeEditorLoader() {
  return <CodeEditorTool />;
}
