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
        Client notes in a grid: links (front end, client folder, briefing, onboarding), main ticket notes and opportunity notes, with a highlighter for key words. Open a note and it stays open while you use other tools. Saved in this browser and to your database.
        Press Ctrl+K to search.
      </ToolHeader>
      <NotesLoader />
    </>
  );
}
