import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import SectionsTool from "./sections-tool";

export const metadata: Metadata = {
  title: "Section Library",
};

export default function SectionsPage() {
  return (
    <>
      <ToolHeader title="Section library">
        Ready-made homepage headings, profile sections and content layouts for real estate sites.
        Pick a style and a section, then copy a design&apos;s HTML and CSS.
      </ToolHeader>
      <SectionsTool />
    </>
  );
}
