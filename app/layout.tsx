import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AnimeSceneLoader from "@/components/anime-scene-loader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Toolbox", template: "%s · Toolbox" },
  description: "Small utilities for media, links, and formatting.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AnimeSceneLoader />
        {children}
      </body>
    </html>
  );
}
