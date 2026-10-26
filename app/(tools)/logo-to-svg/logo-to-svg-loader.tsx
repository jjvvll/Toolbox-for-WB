"use client";

import dynamic from "next/dynamic";

// Browser-only: canvas pixel access and the tracing worker need the DOM.
const LogoToSvgTool = dynamic(() => import("./logo-to-svg-tool"), {
  ssr: false,
  loading: () => <p className="mt-6 text-sm text-zinc-500">Loading…</p>,
});

export default function LogoToSvgLoader() {
  return <LogoToSvgTool />;
}
