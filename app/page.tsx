import Link from "next/link";
import { TOOLS } from "@/lib/tools";

export default function Dashboard() {
  return (
    // From md up the content sits in a left column so the background art on the right stays visible.
    <main className="w-full flex-1 px-4 py-12 sm:px-8 sm:py-16 md:w-[52vw] md:min-w-[34rem] md:max-w-[46rem] md:pl-[4vw] md:pr-0">
      {/* The hero panel: speed lines behind, the title on a white patch so it stays readable. */}
      <header className="manga-speed flex items-start justify-between gap-4 border-4 border-[var(--ink)] p-5 shadow-[var(--shadow-hard)] sm:p-6">
        <div className="max-w-2xl bg-[var(--panel)] py-1 pr-3">
          <h1 className="text-3xl tracking-tight sm:text-4xl">
            Tool<span className="text-[var(--red)]">box</span>
          </h1>
          <p className="manga-jp mt-0.5 text-[13px]">道具箱</p>
          <p className="mt-2 text-[var(--ink-soft)]">
            Small utilities for media, links, and formatting. Most run entirely in
            your browser.
          </p>
        </div>
        <form action="/api/logout" method="post" className="shrink-0">
          <button
            type="submit"
            className="border-2 border-zinc-900 bg-[var(--panel)] px-3 py-1.5 font-[family-name:var(--font-display)] text-sm shadow-[3px_3px_0_var(--ink)] transition-[transform,box-shadow,background-color] duration-[120ms] hover:bg-[var(--yellow)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            Log out
          </button>
        </form>
      </header>

      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="group flex h-full flex-col gap-4 border-[3px] border-[var(--ink)] bg-[var(--panel)] p-5 shadow-[var(--shadow-hard)] transition-[transform,box-shadow] duration-[120ms] hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[7px_7px_0_var(--red)]"
            >
              <span className="flex h-11 w-11 items-center justify-center border-[3px] border-[var(--ink)] bg-[var(--paper)] [&_svg]:h-[22px] [&_svg]:w-[22px]">
                {tool.icon}
              </span>
              <span className="flex flex-1 flex-col gap-1">
                <span className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-[family-name:var(--font-display)] text-[16px]">{tool.name}</span>{" "}
                    <span className="manga-jp">{tool.jp}</span>
                  </span>
                  <span
                    aria-hidden
                    className="transition-transform duration-[120ms] group-hover:translate-x-[3px] group-hover:text-[var(--red)]"
                  >
                    →
                  </span>
                </span>
                <span className="text-sm text-[var(--ink-soft)]">{tool.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
