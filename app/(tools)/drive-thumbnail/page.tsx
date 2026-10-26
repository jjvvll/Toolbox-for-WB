import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import DriveThumbnailTool from "./drive-thumbnail-tool";

export const metadata: Metadata = {
  title: "Drive Video Thumbnail",
};

export default function DriveThumbnailPage() {
  return (
    <>
      <ToolHeader title="Drive video thumbnail">
        Paste a Google Drive video link to preview and download its thumbnail.
        The file must be shared as “Anyone with the link”.
      </ToolHeader>
      <DriveThumbnailTool />
    </>
  );
}
