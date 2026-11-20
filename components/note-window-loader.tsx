"use client";

import dynamic from "next/dynamic";

// The floating note window: IndexedDB and the editor only exist in the browser.
// It lives in the tools layout, but only shows on the page the note was opened from (Notes).
const NoteWindow = dynamic(() => import("@/app/(tools)/notes/note-window"), { ssr: false });

export default function NoteWindowLoader() {
  return <NoteWindow />;
}
