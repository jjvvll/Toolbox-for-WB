import Link from "next/link";

export default function ToolsLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 sm:px-8 sm:py-8">
      <Link
        href="/"
        className="glass-panel inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-zinc-700 hover:text-foreground dark:text-zinc-300"
      >
        <span aria-hidden>←</span> Back to dashboard
      </Link>
      {/* Frosted panel keeps tools readable over the background art. */}
      <div className="glass-panel mt-4 rounded-3xl p-4 shadow-sm sm:p-8">{children}</div>
    </main>
  );
}
