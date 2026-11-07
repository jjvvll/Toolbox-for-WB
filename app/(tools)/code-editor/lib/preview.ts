import type { CodeFile } from "./files";

/** Values for CSS variables the project uses but doesn't define (e.g. theme variables from the real site). */
export type PreviewVars = Record<string, string>;

const isCss = (file: CodeFile) => /\.css$/i.test(file.name);

/**
 * Turns an HTML file into a self-contained document for the preview iframe. Stylesheet links
 * that point at a project file are replaced by that file's CSS. HTML that links none of them,
 * such as a pasted section, gets every project CSS file so snippets work without a <head>.
 */
export function buildPreview(html: string, files: CodeFile[], vars: PreviewVars = {}): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const addStyle = (css: string) => {
    const style = doc.createElement("style");
    style.textContent = css;
    return style;
  };

  let linkedAny = false;
  for (const link of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
    const href = link.getAttribute("href") ?? "";
    const name = href.replace(/^\.\//, "").replace(/[?#].*$/, "").toLowerCase();
    const file = files.find((f) => f.name.toLowerCase() === name);
    if (file) {
      linkedAny = true;
      link.replaceWith(addStyle(file.content));
    }
  }
  if (!linkedAny) {
    for (const file of files.filter(isCss)) doc.head.append(addStyle(file.content));
  }

  // First in <head>, so a definition in the project's own CSS still wins.
  const declarations = Object.entries(vars)
    .filter(([, value]) => value.trim())
    .map(([name, value]) => `${name}: ${value};`);
  if (declarations.length) doc.head.prepend(addStyle(`:root { ${declarations.join(" ")} }`));

  // Keep real links styled as links, but stop them replacing the preview: the iframe sandbox
  // blocks new windows, so a click does nothing. In-page #anchors keep working.
  for (const link of doc.querySelectorAll("a[href]")) {
    if (!link.getAttribute("href")?.startsWith("#")) link.setAttribute("target", "_blank");
  }

  // A full document without a doctype is quirks mode in a real browser, so keep that. A snippet
  // will end up inside someone's standards-mode page, so preview it in standards mode.
  const isSnippet = !/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(html);
  return (doc.doctype || isSnippet ? "<!doctype html>" : "") + doc.documentElement.outerHTML;
}

/** CSS variables that are read with var() somewhere in the page but never defined in it. */
export function undefinedVars(html: string, files: CodeFile[]): string[] {
  const source = [html, ...files.filter(isCss).map((f) => f.content)].join("\n");
  const defined = new Set(Array.from(source.matchAll(/(--[\w-]+)\s*:/g), (m) => m[1]));
  const used = new Set(Array.from(source.matchAll(/var\(\s*(--[\w-]+)/g), (m) => m[1]));
  return [...used].filter((name) => !defined.has(name));
}
