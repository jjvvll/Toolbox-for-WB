import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import CodeEditorLoader from "./code-editor-loader";

export const metadata: Metadata = {
  title: "Code Editor",
};

export default function CodeEditorPage() {
  return (
    <>
      <ToolHeader title="Code Editor">
        Write HTML and CSS with a live preview. Your files are saved in this browser. Scripts don&apos;t run in the
        preview, and local images won&apos;t load, so use full image URLs.
      </ToolHeader>
      <CodeEditorLoader />
    </>
  );
}
