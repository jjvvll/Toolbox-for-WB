import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import FolderThumbnailsLoader from "./folder-thumbnails-loader";

export const metadata: Metadata = {
  title: "Folder Thumbnails",
};

export default function FolderThumbnailsPage() {
  return (
    <>
      <ToolHeader title="Folder thumbnails">
        Open a folder to generate cover images for every video and PDF inside it, including subfolders.
      </ToolHeader>
      <FolderThumbnailsLoader />
    </>
  );
}
