import { useCallback, useEffect, useRef } from "react";

/**
 * Batches partial updates and saves them after `delay` ms of quiet.
 * Pending changes are flushed on unmount (e.g. switching notes) and when the tab is hidden or closed.
 */
export function useAutosave<T extends object>(save: (patch: Partial<T>) => unknown, delay = 500) {
  const saveRef = useRef(save);
  const pending = useRef<Partial<T> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    saveRef.current = save;
  });

  /** Saves now; resolves once the save has finished. */
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!pending.current) return;
    const patch = pending.current;
    pending.current = null;
    await saveRef.current(patch);
  }, []);

  const queue = useCallback(
    (patch: Partial<T>) => {
      pending.current = { ...pending.current, ...patch };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return { queue, flush };
}
