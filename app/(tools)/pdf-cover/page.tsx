import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import PdfCoverTool from "./pdf-cover-tool";

export const metadata: Metadata = {
  title: "PDF Cover",
};

export default function PdfCoverPage() {
  return (
    <>
      <ToolHeader title="PDF cover images">
        Pick one or more PDFs. Page 1 of each is rendered to an image in your
        browser — nothing is uploaded.
      </ToolHeader>
      <PdfCoverTool />
    </>
  );
}
