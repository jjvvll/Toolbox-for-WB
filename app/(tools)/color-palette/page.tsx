import type { Metadata } from "next";
import ToolHeader from "@/components/tool-header";
import ColorPaletteLoader from "./color-palette-loader";

export const metadata: Metadata = {
  title: "Color Palette",
};

export default function ColorPalettePage() {
  return (
    <>
      <ToolHeader title="Color palette">
        Pull a palette from a screenshot, preview it on light and dark themes, and copy the :root for your template. Everything stays in your browser.
      </ToolHeader>
      <ColorPaletteLoader />
    </>
  );
}
