"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Starts saving notes and the error log to the database in the background, on every page
 * (so changes keep going out wherever you are). Loaded after the page, and not on the
 * login page.
 */
export default function SyncAgent() {
  const pathname = usePathname();
  const active = !pathname.startsWith("/login");
  useEffect(() => {
    if (!active) return;
    import("@/app/(tools)/notes/lib/sync").then((m) => m.startSync()).catch(() => {});
  }, [active]);
  return null;
}
