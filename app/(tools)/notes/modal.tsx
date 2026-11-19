"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { dialogClass, lightDismiss } from "@/components/ask-dialog";

/**
 * A native modal <dialog>. The browser makes the page behind it inert, keeps Tab inside it,
 * closes it on Esc (and the back gesture), and puts focus back on the button that opened it.
 * Clicking outside closes it too. `onClose` runs however it closes; unmounting it closes it.
 */
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
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener("close", handleClose);
    const stopDismiss = lightDismiss(dialog);
    return () => {
      // Removed first, so closing it on unmount doesn't call onClose a second time.
      dialog.removeEventListener("close", handleClose);
      stopDismiss();
      if (dialog.open) dialog.close();
    };
  }, []);

  if (typeof document === "undefined") return null;

  // Portalled into <body>: a modal dialog sits in the top layer anyway, but one inside a hidden
  // (display: none) part of the page wouldn't show.
  return createPortal(
    <dialog
      ref={ref}
      aria-label={label}
      {...({ closedby: "any" } as object)}
      className={`${dialogClass} mt-[10vh] max-h-[80vh] w-[calc(100%-2rem)] open:flex flex-col overflow-hidden ${className}`}
    >
      {children}
    </dialog>,
    document.body,
  );
}
