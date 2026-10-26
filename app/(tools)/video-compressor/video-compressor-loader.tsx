"use client";

import dynamic from "next/dynamic";

// Browser-only: folder access, WebCodecs, and ffmpeg.wasm all need the DOM.
const VideoCompressorTool = dynamic(() => import("./video-compressor-tool"), {
  ssr: false,
  loading: () => <p className="mt-6 text-sm text-zinc-500">Loading…</p>,
});

export default function VideoCompressorLoader() {
  return <VideoCompressorTool />;
}
