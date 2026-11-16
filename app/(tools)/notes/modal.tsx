"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function Modal({
  onClose,
  label,
  children,
  className = "max-w-lg",
}: {
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  // Rendered into <body>: the tools sit inside a frosted panel, and a backdrop
  // filter makes its element the box that `fixed` children are placed in, so a
  // modal left in place would cover the whole panel instead of the screen.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh] text-foreground backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`flex max-h-[80vh] w-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-background shadow-2xl dark:border-zinc-800 ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
