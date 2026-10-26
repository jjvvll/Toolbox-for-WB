import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import LogoToSvgLoader from "./logo-to-svg-loader";

export const metadata: Metadata = {
  title: "Logo to SVG",
};

export default function LogoToSvgPage() {
  return (
    <>
      <ToolHeader title="Logo to SVG">
        Convert a PNG or JPG logo into a clean, editable SVG. Tracing runs in your browser; the image is never uploaded.
      </ToolHeader>
      <LogoToSvgLoader />
    </>
  );
}
