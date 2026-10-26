import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import ChannelTool from "./channel-tool";

export const metadata: Metadata = {
  title: "YouTube Channel",
};

export default function ChannelPage() {
  return (
    <>
      <ToolHeader title="YouTube channel">
        Paste a channel link or @handle to list its uploads, newest first.
      </ToolHeader>
      <ChannelTool />
    </>
  );
}
