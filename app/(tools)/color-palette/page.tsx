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
        Pull a palette from a screenshot, then try it on dark, light, and color-block layouts. Everything stays in your browser.
      </ToolHeader>
      <ColorPaletteLoader />
    </>
  );
}
