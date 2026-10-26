import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import YouTubeTool from "./youtube-tool";

export const metadata: Metadata = {
  title: "YouTube Video",
};

export default function YouTubePage() {
  return (
    <>
      <ToolHeader title="YouTube video">
        Paste a watch, youtu.be, or Shorts link to get its thumbnail, title, and
        an autoplay embed link.
      </ToolHeader>
      <YouTubeTool />
    </>
  );
}
