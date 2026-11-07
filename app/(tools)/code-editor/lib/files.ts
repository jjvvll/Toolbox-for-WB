export type CodeFile = { name: string; content: string };

const STORAGE_KEY = "code-editor:files";
const VARS_KEY = "code-editor:preview-vars";
const USE_PALETTE_KEY = "code-editor:use-palette";

const STARTER: CodeFile[] = [
  {
    name: "index.html",
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My page</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <h1>Hello!</h1>
    <p>Edit this page and watch the preview update.</p>
  </body>
</html>
`,
  },
  {
    name: "style.css",
    content: `body {
  margin: 2rem;
  font-family: system-ui, sans-serif;
}

h1 {
  color: #2563eb;
}
`,
  },
];

export const isHtml = (name: string) => /\.html$/i.test(name);
export const languageOf = (name: string) => (isHtml(name) ? "html" : "css");

/** Returns what's wrong with a file name, or null if it can be used. Files live in one flat folder. */
export function nameProblem(name: string, files: CodeFile[], renaming?: string): string | null {
  if (!/^[\w.-]+\.(html|css)$/i.test(name)) {
    return "Use a name ending in .html or .css, with only letters, numbers, dots, dashes, and underscores.";
  }
  const lower = name.toLowerCase();
  const taken = files.some((f) => f.name.toLowerCase() === lower && f.name !== renaming);
  return taken ? `There's already a file called ${name}.` : null;
}

export function loadFiles(): CodeFile[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      Array.isArray(saved) &&
      saved.length > 0 &&
      saved.every((f) => typeof f?.name === "string" && typeof f?.content === "string")
    ) {
      return saved;
    }
  } catch {
    // Unreadable or blocked storage: start from the sample files.
  }
  return STARTER;
}

export function loadPreviewVars(): Record<string, string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(VARS_KEY) ?? "null");
    if (saved && typeof saved === "object" && Object.values(saved).every((v) => typeof v === "string")) {
      return saved as Record<string, string>;
    }
  } catch {
    // Unreadable or blocked storage: no values set.
  }
  return {};
}

export function savePreviewVars(vars: Record<string, string>) {
  try {
    localStorage.setItem(VARS_KEY, JSON.stringify(vars));
  } catch {
    // Convenience only: the values just won't survive a reload.
  }
}

export function loadUsePalette(): boolean {
  try {
    return localStorage.getItem(USE_PALETTE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveUsePalette(on: boolean) {
  try {
    localStorage.setItem(USE_PALETTE_KEY, on ? "on" : "off");
  } catch {
    // Convenience only: the choice just won't survive a reload.
  }
}

/** Returns false when the browser refused the write (storage full or blocked). */
export function saveFiles(files: CodeFile[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
    return true;
  } catch {
    return false;
  }
}
