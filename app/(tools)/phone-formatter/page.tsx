import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import PhoneFormatterTool from "./phone-formatter-tool";

export const metadata: Metadata = {
  title: "Phone Formatter",
};

export default function PhoneFormatterPage() {
  return (
    <>
      <ToolHeader title="Phone formatter">
        Paste a US phone number in any format and pick how it should look.
      </ToolHeader>
      <PhoneFormatterTool />
    </>
  );
}
