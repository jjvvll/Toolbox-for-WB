"use client";

import { usePathname } from "next/navigation";
import { TOOLS } from "@/lib/tools";

// Tools you look at for a long time get the dark manga panel (cream lines on near-black).
const DARK_TOOLS = new Set(["/color-palette"]);

/**
 * The panel every tool page sits in. Its watermark is the tool's Japanese name, drawn as a
 * faint outlined vertical title with a patch of screentone, like a manga page (see
 * .tool-panel in globals.css).
 */
export default function ToolPanel({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tool = TOOLS.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  const dark = !!tool && DARK_TOOLS.has(tool.href);
  return (
    <div data-jp={tool?.jp ?? "道具箱"} className={`tool-panel glass-panel mt-4 rounded-3xl p-4 shadow-sm sm:p-8 ${dark ? "manga-dark" : ""}`}>
      {children}
    </div>
  );
}
