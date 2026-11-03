"use client";

import dynamic from "next/dynamic";

// Browser-only: canvas, the face-detection wasm, and pointer dragging need the DOM.
const HeadshotTool = dynamic(() => import("./headshot-tool"), {
  ssr: false,
  loading: () => <p className="mt-6 text-sm text-zinc-500">Loading…</p>,
});

export default function HeadshotLoader() {
  return <HeadshotTool />;
}
