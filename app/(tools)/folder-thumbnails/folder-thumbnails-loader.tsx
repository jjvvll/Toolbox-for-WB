"use client";

import dynamic from "next/dynamic";

// Browser-only: folder access, <video> decoding, and pdf.js all need the DOM.
const FolderThumbnailsTool = dynamic(() => import("./folder-thumbnails-tool"), {
  ssr: false,
  loading: () => <p className="mt-6 text-sm text-zinc-500">Loading…</p>,
});

export default function FolderThumbnailsLoader() {
  return <FolderThumbnailsTool />;
}
