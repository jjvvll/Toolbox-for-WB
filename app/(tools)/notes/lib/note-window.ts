// Which note is open in the floating note window, and on which page. The window lives
// in the tools layout but only shows on the page it was opened on.
// Kept in localStorage so the window also comes back after a reload.

import { useSyncExternalStore } from "react";

export type WindowState = {
  /** The open note, or null when the window is closed. */
  id: string | null;
  minimized: boolean;
  /** A wider window, for long notes. */
  wide: boolean;
  /**
   * The page the note was opened on. The window only shows there: switching to another
   * tool hides it, and going back brings it back as it was.
   */
  path: string | null;
};

const KEY = "notes:window";
const EVENT = "notes:window";
const CLOSED: WindowState = { id: null, minimized: false, wide: false, path: null };

let cache: { raw: string | null; state: WindowState } = { raw: null, state: CLOSED };

function read(): WindowState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // storage blocked
  }
  if (raw !== cache.raw) {
    let state = CLOSED;
    try {
      const v = JSON.parse(raw ?? "null");
      if (v && typeof v === "object") {
        state = { id: typeof v.id === "string" ? v.id : null, minimized: !!v.minimized, wide: !!v.wide, path: typeof v.path === "string" ? v.path : null };
      }
    } catch {
      // unreadable: closed
    }
    cache = { raw, state };
  }
  return cache.state;
}

function write(state: WindowState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage blocked: the window still works until the page closes
    cache = { raw: JSON.stringify(state), state };
  }
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
};

export const useNoteWindow = () => useSyncExternalStore(subscribe, read, () => CLOSED);

export const openNote = (id: string) => write({ ...read(), id, minimized: false, path: window.location.pathname });
export const closeNoteWindow = () => write({ ...read(), id: null, minimized: false });
export const setMinimized = (minimized: boolean) => write({ ...read(), minimized });
export const setWide = (wide: boolean) => write({ ...read(), wide });
