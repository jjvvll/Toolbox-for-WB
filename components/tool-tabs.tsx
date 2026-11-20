"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore, type Ref } from "react";
import { LOG_EVENT, newErrorCount } from "@/lib/error-log";
import { TOOLS, TOOL_GROUPS, type Tool, type ToolGroup } from "@/lib/tools";

// New errors since the Error Log was last opened, updated as errors arrive.
const subscribeLog = (fn: () => void) => {
  window.addEventListener(LOG_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(LOG_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
};
const useNewErrors = () => useSyncExternalStore(subscribeLog, newErrorCount, () => 0);

const toolsIn = (group: ToolGroup) => TOOLS.filter((t) => t.group === group);
const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

// The side rails need the margins beside the centered tool page (72rem wide), so they only show
// from 1520px wide (min-[1520px]); narrower screens get the top bar. The class names are written
// out in full because Tailwind only generates classes it finds spelled out in the source.

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function ErrorBadge({ tool, count }: { tool: Tool; count: number }) {
  if (tool.href !== "/error-log" || !count) return null;
  return (
    <span className="manga-sticker ml-auto" title={`${count} new`}>
      {count}
    </span>
  );
}

// Manga style: white labels on the ink nav; the current tool is a red block, slanted.
const itemClass = (active: boolean) =>
  `flex items-center gap-2 px-2.5 py-2 text-sm font-bold transition-colors duration-[120ms] ${
    active ? "-skew-x-10 bg-[var(--red-strong)] text-white [&>*]:skew-x-10" : "text-white/85 hover:bg-white/10 hover:text-[var(--yellow)]"
  }`;

/** The ink panel the tool links sit on. */
const navPanel = "border-[3px] border-[var(--ink)] bg-[var(--ink)] shadow-[4px_4px_0_var(--red)]";

function ToolLink({
  tool,
  active,
  errors,
  linkRef,
  wrap,
  compact = false,
}: {
  tool: Tool;
  active: boolean;
  errors: number;
  linkRef?: Ref<HTMLAnchorElement>;
  wrap: boolean;
  /** Tighter in the laptop grid, with long names cut short (the full name is in the tooltip). */
  compact?: boolean;
}) {
  return (
    <Link
      ref={linkRef}
      href={tool.href}
      aria-current={active ? "page" : undefined}
      title={`${tool.name}: ${tool.description}`}
      className={`${itemClass(active)} ${wrap ? "" : "whitespace-nowrap"} ${compact ? "lg:px-2 lg:py-1.5 lg:text-[13px]" : ""}`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">{tool.icon}</span>
      <span className={wrap ? "min-w-0 leading-tight" : compact ? "lg:min-w-0 lg:truncate" : ""}>{tool.name}</span>
      <ErrorBadge tool={tool} count={errors} />
    </Link>
  );
}

/**
 * Tool navigation above each tool page: a row of tabs, grouped like the side rails.
 * On narrow screens it scrolls sideways with the current tool scrolled into view.
 * Hidden on wide screens, where the side rails take over.
 */
export default function ToolTabs() {
  const pathname = usePathname();
  const errors = useNewErrors();
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    // Phones and tablets: one pinned row that scrolls sideways. Laptops (lg): every tool at once,
    // website tools on the left half and media on the right, like the side rails.
    <nav aria-label="Tools" className={`${navPanel} sticky top-2 z-30 p-1.5 lg:static min-[1520px]:hidden`}>
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:thin] lg:grid lg:grid-cols-[auto_1fr_1fr] lg:items-stretch lg:overflow-visible">
        <li className="shrink-0">
          <Link href="/" title="Dashboard" className={itemClass(false)}>
            <DashboardIcon />
            <span className="sr-only sm:not-sr-only lg:sr-only xl:not-sr-only">Dashboard</span>
          </Link>
        </li>
        {TOOL_GROUPS.map((g) => (
          <li key={g.id} className="flex shrink-0 gap-1 lg:min-w-0">
            <span aria-hidden className="my-1.5 w-[3px] shrink-0 bg-[var(--paper)]" />
            <ul className="flex gap-1 lg:grid lg:min-w-0 lg:flex-1 lg:grid-cols-3 lg:gap-0.5" aria-label={g.label}>
              {toolsIn(g.id).map((tool) => {
                const active = isActive(pathname, tool.href);
                return (
                  <li key={tool.href} className="shrink-0 lg:min-w-0">
                    <ToolLink tool={tool} active={active} errors={errors} linkRef={active ? activeRef : undefined} wrap={false} compact />
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** One side rail: a group of tools in a pinned column beside the tool page (wide screens only). */
function Rail({ side, group, withDashboard }: { side: "left" | "right"; group: (typeof TOOL_GROUPS)[number]; withDashboard?: boolean }) {
  const pathname = usePathname();
  const errors = useNewErrors();
  return (
    <nav
      aria-label={group.label}
      className={`${navPanel} fixed top-6 z-30 hidden max-h-[calc(100vh-3rem)] w-[clamp(10.5rem,calc((100vw-72rem)/2-2.5rem),15rem)] flex-col gap-1 overflow-y-auto p-2 [scrollbar-color:var(--ink-soft)_transparent] min-[1520px]:flex ${
        side === "left" ? "left-4" : "right-4"
      }`}
    >
      {withDashboard && (
        <>
          <Link href="/" className={itemClass(false)}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">
              <DashboardIcon />
            </span>
            Dashboard
          </Link>
          <span aria-hidden className="mx-2 my-1 h-[3px] bg-[var(--paper)]" />
        </>
      )}
      <span className="flex flex-col px-2.5 pb-1 pt-1.5">
        <span className="font-[family-name:var(--font-display)] text-[12px] tracking-wide text-white">{group.label}</span>
        <span className="manga-jp text-[var(--yellow)]">{group.jp}</span>
      </span>
      <ul className="flex flex-col gap-0.5">
        {toolsIn(group.id).map((tool) => (
          <li key={tool.href}>
            <ToolLink tool={tool} active={isActive(pathname, tool.href)} errors={errors} wrap />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Both side rails: website & writing tools on the left, image & video tools on the right. */
export function ToolRails() {
  return (
    <>
      <Rail side="left" group={TOOL_GROUPS[0]} withDashboard />
      <Rail side="right" group={TOOL_GROUPS[1]} />
    </>
  );
}
