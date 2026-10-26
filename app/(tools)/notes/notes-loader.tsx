"use client";

import dynamic from "next/dynamic";

// IndexedDB and the editor only exist in the browser, so skip server rendering.
const NotesApp = dynamic(() => import("./notes-app"), {
  ssr: false,
  loading: () => <p className="mt-8 text-sm text-zinc-500">Loading notes…</p>,
});

export default function NotesLoader() {
  return <NotesApp />;
}
