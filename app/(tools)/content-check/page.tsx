import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import ContentCheckTool from "./content-check-tool";

export const metadata: Metadata = {
  title: "Content Checker",
};

export default function ContentCheckPage() {
  return (
    <>
      <ToolHeader title="Content checker">
        Paste a site link and your copy to see which lines are on the site, which were changed,
        and which are missing. Every page in the site&apos;s menu is read.
      </ToolHeader>
      <ContentCheckTool />
    </>
  );
}
