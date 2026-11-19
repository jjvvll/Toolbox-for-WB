"use client";

import dynamic from "next/dynamic";

// The floating note window: IndexedDB and the editor only exist in the browser.
// It lives in the tools layout, so it stays open while you switch tools.
const NoteWindow = dynamic(() => import("@/app/(tools)/notes/note-window"), { ssr: false });

export default function NoteWindowLoader() {
  return <NoteWindow />;
}
