import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import AuditTool from "./audit-tool";

export const metadata: Metadata = {
  title: "Audit",
};

export default function AuditPage() {
  return (
    <>
      <ToolHeader title="Audit">
        QA for Luxury Presence sites. Paste any page of a site to check every page in its menu: SEO titles and
        descriptions, broken pages, redirects, phone/email links, dead links and spelling. Then search the whole site
        for links, words, colors and letter case. Pages are always read fresh, and nothing is saved.
      </ToolHeader>
      <AuditTool />
    </>
  );
}
