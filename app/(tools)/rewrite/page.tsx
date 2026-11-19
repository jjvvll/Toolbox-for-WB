import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import RewriteTool from "./rewrite-tool";

export const metadata: Metadata = {
  title: "AI Rewrite",
};

export default function RewritePage() {
  return (
    <>
      <ToolHeader title="AI rewrite">
        Paste text, pick a style, and copy the result: fix grammar, make it grammatically sound,
        formal or polite. Uses your own Gemini or Claude API key.
      </ToolHeader>
      <RewriteTool />
    </>
  );
}
