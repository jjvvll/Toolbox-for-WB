// The palette tool's saved :root, also read by the Code Editor's preview.

import {
  ROOT_DEFAULTS,
  TEMPLATES,
  autoRoot,
  rootEntries,
  type PoolMode,
  type RootValues,
  type TemplateId,
  type TextCase,
} from "./color";

export const PALETTE_STORAGE_KEY = "color-palette:v1";

type SavedRootFields = {
  palette?: { hex: string; active?: boolean }[];
  mode?: PoolMode;
  /** Missing in data saved before the :root variables, which is re-assigned from the palette. */
  values?: RootValues;
  template?: TemplateId;
  textCase?: TextCase;
};

/** The colors used for styling: every palette color that hasn't been switched off. */
export const activeHex = (list: { hex: string; active?: boolean }[]) =>
  list.filter((s) => s.active !== false).map((s) => s.hex);

export function savedRootValues(saved: SavedRootFields | null): RootValues {
  if (saved?.values) return saved.values;
  const used = activeHex(saved?.palette ?? []);
  return used.length ? autoRoot(used, saved?.mode ?? "neutrals") : ROOT_DEFAULTS;
}

/** The palette tool's current variables, from the raw saved value. Null if nothing usable is saved. */
export function parseSavedRoot(raw: string | null): { templateLabel: string; vars: Record<string, string> } | null {
  try {
    const saved: SavedRootFields | null = JSON.parse(raw ?? "null");
    if (!saved || typeof saved !== "object") return null;
    const template = TEMPLATES.find((t) => t.id === saved.template) ?? TEMPLATES[0];
    const entries = rootEntries(template.id, savedRootValues(saved), saved.textCase ?? "uppercase");
    return { templateLabel: template.label, vars: Object.fromEntries(entries) };
  } catch {
    return null;
  }
}
