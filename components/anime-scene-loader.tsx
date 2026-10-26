"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

// Client-only: reads saved settings from localStorage on first render.
const AnimeScene = dynamic(() => import("./anime-scene"), { ssr: false });

export default function AnimeSceneLoader() {
  // The picture API needs a signed-in session, so the login page stays plain.
  if (usePathname() === "/login") return null;
  return <AnimeScene />;
}
