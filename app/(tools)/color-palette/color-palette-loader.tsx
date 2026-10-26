"use client";

import dynamic from "next/dynamic";

// Client-only: reads the saved palette from localStorage on first render and uses canvas.
const ColorPaletteTool = dynamic(() => import("./color-palette-tool"), {
  ssr: false,
  loading: () => <p className="mt-6 text-sm text-zinc-500">Loading…</p>,
});

export default function ColorPaletteLoader() {
  return <ColorPaletteTool />;
}
