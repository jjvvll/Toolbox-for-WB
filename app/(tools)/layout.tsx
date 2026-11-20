import NoteWindowLoader from "@/components/note-window-loader";
import ToolPanel from "@/components/tool-panel";
import ToolTabs, { ToolRails } from "@/components/tool-tabs";

export default function ToolsLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 sm:px-8 sm:py-8">
      {/* Every tool, so you can switch without going back to the dashboard: side rails on
          wide screens, a row of tabs above the page otherwise. */}
      <ToolRails />
      <ToolTabs />
      {/* A solid manga panel keeps tools readable over the background art. */}
      <ToolPanel>{children}</ToolPanel>
      {/* The open note floats above every tool until it's closed. */}
      <NoteWindowLoader />
    </main>
  );
}
