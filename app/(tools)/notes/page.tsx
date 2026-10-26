import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import NotesLoader from "./notes-loader";

export const metadata: Metadata = {
  title: "Notes",
};

export default function NotesPage() {
  return (
    <>
      <ToolHeader title="Notes">
        Rich-text notes with folders, tags, and templates, saved only in this browser.
        Press Ctrl+K to search.
      </ToolHeader>
      <NotesLoader />
    </>
  );
}
