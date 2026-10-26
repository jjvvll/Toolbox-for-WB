import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold tracking-tight">Toolbox</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Enter the password to continue.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
