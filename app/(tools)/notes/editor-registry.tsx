"use client";

// The text editors of the open note register here, so the highlights checklist beside
// the note window can list every highlighted word and cross it out in its editor.

import type { Editor } from "@tiptap/react";
import { createContext, useContext, useEffect } from "react";

export type RegisteredEditor = { id: string; label: string; editor: Editor };

export class EditorRegistry {
  private entries = new Map<string, RegisteredEditor>();
  private listeners = new Set<() => void>();
  private version = 0;

  register(entry: RegisteredEditor) {
    this.entries.set(entry.id, entry);
    const onUpdate = () => this.emit();
    entry.editor.on("update", onUpdate);
    this.emit();
    return () => {
      entry.editor.off("update", onUpdate);
      if (this.entries.get(entry.id) === entry) this.entries.delete(entry.id);
      this.emit();
    };
  }

  /** Registered editors in the order they appear on the page. */
  list(): RegisteredEditor[] {
    return [...this.entries.values()]
      .filter((e) => !e.editor.isDestroyed)
      .sort((a, b) => (a.editor.view.dom.compareDocumentPosition(b.editor.view.dom) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
}

export const EditorRegistryContext = createContext<EditorRegistry | null>(null);

/** Registers an editor while it's mounted (does nothing outside a registry). */
export function useRegisterEditor(editor: Editor | null, id: string | undefined, label: string | undefined) {
  const registry = useContext(EditorRegistryContext);
  useEffect(() => {
    if (!registry || !editor || !id) return;
    return registry.register({ id, label: label ?? id, editor });
  }, [registry, editor, id, label]);
}
