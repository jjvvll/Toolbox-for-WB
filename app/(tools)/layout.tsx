import NoteWindowLoader from "@/components/note-window-loader";
import ToolTabs, { ToolRails } from "@/components/tool-tabs";

export default function ToolsLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 sm:px-8 sm:py-8">
      {/* Every tool, so you can switch without going back to the dashboard: side rails on
          wide screens, a row of tabs above the page otherwise. */}
      <ToolRails />
      <ToolTabs />
      {/* Frosted panel keeps tools readable over the background art. */}
      <div className="glass-panel mt-4 rounded-3xl p-4 shadow-sm sm:p-8">{children}</div>
      {/* The open note floats above every tool until it's closed. */}
      <NoteWindowLoader />
    </main>
  );
}
