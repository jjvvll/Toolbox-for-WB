import type { Metadata, Viewport } from "next";
import { Dela_Gothic_One, Geist, Geist_Mono, Zen_Kaku_Gothic_New } from "next/font/google";
import AnimeSceneLoader from "@/components/anime-scene-loader";
import ErrorCapture from "@/components/error-capture";
import SyncAgent from "@/components/sync-agent";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Manga style: Dela Gothic One for headings, numbers, buttons and badges; Zen Kaku Gothic New
// for everything else (and the Japanese labels).
const dela = Dela_Gothic_One({
  variable: "--font-dela",
  weight: "400",
  subsets: ["latin"],
});

const zen = Zen_Kaku_Gothic_New({
  variable: "--font-zen",
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Toolbox", template: "%s · Toolbox" },
  description: "Small utilities for media, links, and formatting.",
};

// The manga style is light only: built-in controls (scrollbars, selects…) stay light too.
export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${dela.variable} ${zen.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ErrorCapture />
        <SyncAgent />
        <AnimeSceneLoader />
        {children}
      </body>
    </html>
  );
}
