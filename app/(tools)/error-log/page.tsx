import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import ErrorLogTool from "./error-log-tool";

export const metadata: Metadata = {
  title: "Error Log",
};

export default function ErrorLogPage() {
  return (
    <>
      <ToolHeader title="Error log">
        Errors from every tool, kept in this browser until you clear them: script errors, failed requests,
        pages and stylesheets that couldn&apos;t be read, stopped spelling checks and failed rewrites. Repeats are
        grouped, and API keys are removed.
      </ToolHeader>
      <ErrorLogTool />
    </>
  );
}
