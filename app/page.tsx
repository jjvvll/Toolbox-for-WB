import Link from "next/link";
import { TOOLS } from "@/lib/tools";

export default function Dashboard() {
  return (
    // From md up the content sits in a left column so the background art on the right stays visible.
    <main className="w-full flex-1 px-4 py-12 sm:px-8 sm:py-16 md:w-[52vw] md:min-w-[34rem] md:max-w-[46rem] md:pl-[4vw] md:pr-0">
      <header className="glass-panel flex items-start justify-between gap-4 rounded-2xl p-5 sm:p-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Toolbox</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Small utilities for media, links, and formatting. Most run entirely in
            your browser.
          </p>
        </div>
        <form action="/api/logout" method="post" className="shrink-0">
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 bg-background/60 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
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
              className="group flex h-full flex-col gap-4 glass-panel rounded-2xl p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-zinc-900/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:shadow-black/40"
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${tool.accent}`}
              >
                {tool.icon}
              </span>
              <span className="flex flex-1 flex-col gap-1">
                <span className="flex items-center justify-between font-medium">
                  {tool.name}
                  <span
                    aria-hidden
                    className="text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                  >
                    →
                  </span>
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {tool.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
