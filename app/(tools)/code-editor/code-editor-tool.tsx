"use client";

import { askConfirm } from "@/components/ask-dialog";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import JSZip from "jszip";
import { errorClass, inputClass } from "@/components/ui";
import {
  isHtml,
  languageOf,
  loadFiles,
  loadPreviewVars,
  loadUsePalette,
  nameProblem,
  saveFiles,
  savePreviewVars,
  saveUsePalette,
  type CodeFile,
} from "./lib/files";
import { buildPreview, undefinedVars, type PreviewVars } from "./lib/preview";
import { PALETTE_STORAGE_KEY, parseSavedRoot } from "../color-palette/lib/saved-root";

// Keep in step with the monaco-editor version in package.json (used here for types only).
loader.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.57.0/min/vs" } });

const PREVIEW_DELAY_MS = 300;
/** Page width used by the "Desktop" preview, which is scaled down to fit the pane. */
const DESKTOP_WIDTH = 1280;

const button =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";
const iconButton =
  "rounded px-1 text-xs text-zinc-500 hover:bg-zinc-200 hover:text-foreground dark:hover:bg-zinc-800";

/** Which name is being typed in the explorer: a new file, or a rename of an existing one. */
type NameEdit = { renaming: string | null; value: string };

/** Fires when the palette tool saves in another tab, so the preview follows it live. */
function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readSavedPalette() {
  try {
    return localStorage.getItem(PALETTE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function firstHtml(files: CodeFile[]) {
  return files.find((f) => isHtml(f.name))?.name ?? null;
}

export default function CodeEditorTool() {
  const [files, setFiles] = useState<CodeFile[]>(loadFiles);
  const [active, setActive] = useState(() => firstHtml(files) ?? files[0].name);
  // The page shown while a CSS file is open.
  const [lastHtml, setLastHtml] = useState(() => firstHtml(files));
  const [nameEdit, setNameEdit] = useState<NameEdit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [editorFailed, setEditorFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const [monaco, setMonaco] = useState<Monaco | null>(null);
  const previewScroll = useRef({ x: 0, y: 0 });

  // The app is light-only (manga style), so the editor and preview are too.
  const dark = false;

  const current = files.find((f) => f.name === active) ?? files[0];
  const previewFile =
    (isHtml(current.name) ? current : files.find((f) => f.name === lastHtml)) ??
    files.find((f) => isHtml(f.name)) ??
    null;
  const previewName = previewFile?.name ?? null;

  const [typedVars, setTypedVars] = useState<PreviewVars>(loadPreviewVars);
  const [usePalette, setUsePalette] = useState(loadUsePalette);
  const savedPalette = useSyncExternalStore(subscribeStorage, readSavedPalette, () => null);
  const paletteRoot = useMemo(() => parseSavedRoot(savedPalette), [savedPalette]);
  const paletteVars = useMemo(() => (usePalette ? paletteRoot?.vars : undefined) ?? {}, [usePalette, paletteRoot]);
  // Palette values win: a variable it provides has no box in the list, so a typed value couldn't be seen or changed.
  const vars = useMemo(() => ({ ...typedVars, ...paletteVars }), [typedVars, paletteVars]);

  const [previewDoc, setPreviewDoc] = useState(() =>
    previewFile ? buildPreview(previewFile.content, files, vars) : "",
  );
  const unresolvedVars = previewFile ? undefinedVars(previewFile.content, files) : [];
  const missingVars = unresolvedVars.filter((name) => !(name in paletteVars));
  const fromPalette = unresolvedVars.filter((name) => name in paletteVars);

  const [desktop, setDesktop] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const scale = stage.width / DESKTOP_WIDTH;

  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setStage({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  // Next keeps visited pages alive but hidden, running effect cleanups when one is hidden. <Editor> disposes
  // Monaco in its cleanup and never recreates it, so give it a new key to mount fresh when the page returns.
  const [editorKey, setEditorKey] = useState(0);
  useEffect(() => () => setEditorKey((key) => key + 1), []);

  // The loader's promise rejects if the CDN can't be reached; <Editor> alone would keep showing its loading state.
  useEffect(() => {
    loader.init().catch(() => setEditorFailed(true));
  }, []);

  // Rebuild the preview shortly after typing stops, keeping the scroll position.
  const shownPreview = useRef(previewName);
  useEffect(() => {
    if (!previewFile) return;
    const timer = setTimeout(() => {
      const win = iframeRef.current?.contentWindow;
      const samePage = shownPreview.current === previewFile.name;
      previewScroll.current = samePage && win ? { x: win.scrollX, y: win.scrollY } : { x: 0, y: 0 };
      shownPreview.current = previewFile.name;
      setPreviewDoc(buildPreview(previewFile.content, files, vars));
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [files, previewFile, vars]);

  // Monaco keeps a model per file name; drop those of files that were deleted or renamed.
  // Parent effects run after <Editor>'s, so it has already moved off any model removed here.
  useEffect(() => {
    if (!monaco) return;
    const names = new Set(files.map((f) => f.name));
    for (const model of monaco.editor.getModels()) {
      if (model.uri.scheme === "file" && !names.has(model.uri.path.replace(/^\//, ""))) model.dispose();
    }
  }, [files, monaco]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function commit(next: CodeFile[]) {
    setFiles(next);
    setSaveFailed(!saveFiles(next));
  }

  function open(name: string) {
    setActive(name);
    if (isHtml(name)) setLastHtml(name);
  }

  function submitName(e: FormEvent) {
    e.preventDefault();
    if (!nameEdit) return;
    const name = nameEdit.value.trim();
    const { renaming } = nameEdit;
    if (renaming === name) {
      setNameEdit(null);
      return;
    }
    const problem = nameProblem(name, files, renaming ?? undefined);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setNameEdit(null);
    if (renaming) {
      commit(files.map((f) => (f.name === renaming ? { ...f, name } : f)));
      if (lastHtml === renaming) setLastHtml(isHtml(name) ? name : null);
      if (active === renaming) open(name);
    } else {
      commit([...files, { name, content: "" }]);
      open(name);
    }
  }

  async function remove(name: string) {
    if (!(await askConfirm({ title: `Delete ${name}?`, message: "This can't be undone.", confirmLabel: "Delete", danger: true }))) return;
    const next = files.filter((f) => f.name !== name);
    commit(next);
    if (active === name) open(firstHtml(next) ?? next[0].name);
  }

  async function importFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    const usable = picked.filter((f) => /^[\w.-]+\.(html|css)$/i.test(f.name));
    const skipped = picked.length - usable.length;
    setError(
      skipped ? `Skipped ${skipped} file${skipped === 1 ? "" : "s"}: names must end in .html or .css, with no spaces.` : null,
    );
    if (usable.length === 0) return;

    const incoming = await Promise.all(usable.map(async (f) => ({ name: f.name, content: await f.text() })));
    const isSame = (a: CodeFile, b: CodeFile) => a.name.toLowerCase() === b.name.toLowerCase();
    const replaced = files.filter((f) => incoming.some((i) => isSame(f, i)));
    if (replaced.length && !(await askConfirm({ title: `Replace ${replaced.map((f) => f.name).join(", ")}?`, message: "The imported files replace the ones with the same name.", confirmLabel: "Replace", danger: true }))) return;

    // Before commit: setValue fires onChange, which saves from the old list, so commit must run last.
    for (const file of incoming) {
      monaco?.editor.getModels().find((m: MonacoEditor.ITextModel) => m.uri.path === `/${file.name}`)?.setValue(file.content);
    }
    const next = [...files.filter((f) => !incoming.some((i) => isSame(f, i))), ...incoming];
    commit(next);
    open(incoming[0].name);
  }

  async function downloadZip() {
    const zip = new JSZip();
    for (const file of files) zip.file(file.name, file.content);
    const blob = await zip.generateAsync({ type: "blob" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "site.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current?.requestFullscreen();
  }

  const nameInput = nameEdit && (
    <form onSubmit={submitName}>
      <input
        autoFocus
        aria-label={nameEdit.renaming ? `New name for ${nameEdit.renaming}` : "New file name"}
        placeholder="page.html or theme.css"
        value={nameEdit.value}
        onChange={(e) => setNameEdit({ ...nameEdit, value: e.target.value })}
        onBlur={() => {
          setNameEdit(null);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setNameEdit(null);
            setError(null);
          }
        }}
        className={`${inputClass} !px-2 !py-1 !text-xs`}
      />
    </form>
  );

  return (
    <div
      ref={shellRef}
      className={`flex flex-col gap-3 ${fullscreen ? "h-screen bg-background p-3" : "mt-6"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button}
          onClick={() => editorRef.current?.getAction("editor.action.formatDocument")?.run()}
        >
          Format
        </button>
        <label className={`${button} cursor-pointer focus-within:ring-2 focus-within:ring-blue-500/40`}>
          Import files
          <input type="file" multiple accept=".html,.css" onChange={importFiles} className="sr-only" />
        </label>
        <button type="button" className={button} onClick={downloadZip}>
          Download .zip
        </button>
        <button type="button" className={`${button} ml-auto`} onClick={toggleFullscreen}>
          {fullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </div>

      {saveFailed && (
        <p className={errorClass}>
          This browser couldn&apos;t save your latest changes. Download a .zip so you don&apos;t lose them.
        </p>
      )}
      {error && <p className={errorClass}>{error}</p>}

      <div
        className={`grid min-h-0 gap-3 lg:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)] ${
          fullscreen ? "flex-1 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1" : "lg:h-[70vh]"
        }`}
      >
        <nav
          aria-label="Files"
          className="flex min-h-0 flex-col gap-2 overflow-auto rounded-xl border border-zinc-200 bg-background p-2 dark:border-zinc-800"
        >
          <button
            type="button"
            className="rounded-md px-2 py-1 text-left text-xs font-medium text-blue-600 hover:bg-zinc-100 dark:text-blue-400 dark:hover:bg-zinc-900"
            onClick={() => {
              setError(null);
              setNameEdit({ renaming: null, value: "" });
            }}
          >
            + New file
          </button>
          {nameEdit && !nameEdit.renaming && nameInput}
          <ul className="flex flex-col gap-0.5">
            {files.map((file) =>
              nameEdit?.renaming === file.name ? (
                <li key={file.name}>{nameInput}</li>
              ) : (
                <li
                  key={file.name}
                  className={`group flex items-center rounded-md text-sm ${
                    file.name === current.name
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate px-2 py-1 text-left"
                    aria-current={file.name === current.name ? "true" : undefined}
                    title={file.name}
                    onClick={() => open(file.name)}
                  >
                    {file.name}
                  </button>
                  <span className="flex shrink-0 pr-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      className={iconButton}
                      aria-label={`Rename ${file.name}`}
                      title="Rename"
                      onClick={() => {
                        setError(null);
                        setNameEdit({ renaming: file.name, value: file.name });
                      }}
                    >
                      ✎
                    </button>
                    {files.length > 1 && (
                      <button
                        type="button"
                        className={iconButton}
                        aria-label={`Delete ${file.name}`}
                        title="Delete"
                        onClick={() => remove(file.name)}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div
          className={`min-h-0 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 ${
            fullscreen ? "" : "h-[60vh] lg:h-auto"
          }`}
        >
          {editorFailed ? (
            <p className={`${errorClass} m-3`}>
              The editor couldn&apos;t load. Check your internet connection and reload the page.
            </p>
          ) : (
            <Editor
              key={editorKey}
              keepCurrentModel
              path={current.name}
              language={languageOf(current.name)}
              // Not `value`: <Editor> would write each render's text back, erasing keys typed since that render.
              // This only seeds a file's model, and importFiles updates models that already exist.
              defaultValue={current.content}
              theme={dark ? "vs-dark" : "light"}
              saveViewState
              loading={<p className="text-sm text-zinc-500">Loading editor…</p>}
              onMount={(editor, m) => {
                editorRef.current = editor;
                setMonaco(m);
              }}
              onChange={(value) =>
                commit(files.map((f) => (f.name === current.name ? { ...f, content: value ?? "" } : f)))
              }
              options={{
                automaticLayout: true,
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                tabSize: 2,
                wordWrap: "on",
              }}
            />
          )}
        </div>

        <div
          className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 ${
            fullscreen ? "" : "h-[60vh] lg:h-auto"
          }`}
        >
          <div className="flex items-center gap-2 border-b border-zinc-200 bg-background px-3 py-1 text-xs text-zinc-500 dark:border-zinc-800">
            <p className="min-w-0 flex-1 truncate">Preview{previewName ? `: ${previewName}` : ""}</p>
            <div role="group" aria-label="Preview width" className="flex shrink-0 gap-0.5">
              {[
                { label: "Fit", on: !desktop },
                { label: "Desktop", on: desktop },
              ].map(({ label, on }) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDesktop(label === "Desktop")}
                  className={`rounded px-2 py-0.5 font-medium ${
                    on ? "bg-blue-600 text-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 bg-background px-3 py-1.5 text-xs dark:border-zinc-800">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={usePalette}
                disabled={!paletteRoot}
                onChange={(e) => {
                  setUsePalette(e.target.checked);
                  saveUsePalette(e.target.checked);
                }}
                className="accent-blue-600"
              />
              Use palette :root{paletteRoot ? ` (${paletteRoot.templateLabel})` : ""}
            </label>
            {fromPalette.length > 0 && (
              <ul aria-label="Variables from the palette used by this page" className="flex flex-wrap gap-1">
                {fromPalette.map((name) => (
                  <li
                    key={name}
                    title={`${name}: ${paletteVars[name]}`}
                    className="h-3.5 w-3.5 rounded-sm border border-black/20"
                    style={{ background: paletteVars[name] }}
                  />
                ))}
              </ul>
            )}
            <Link href="/color-palette" target="_blank" className="ml-auto text-blue-600 hover:underline dark:text-blue-400">
              {paletteRoot ? "Edit palette" : "Set up a palette"}
            </Link>
          </div>

          {missingVars.length > 0 && (
            <details open className="max-h-48 overflow-auto border-b border-zinc-200 bg-background px-3 py-2 text-xs dark:border-zinc-800">
              <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">
                {missingVars.length} CSS variable{missingVars.length === 1 ? " isn't" : "s aren't"} defined here
              </summary>
              <p className="mt-1 text-zinc-500">
                They aren&apos;t in your palette either. Enter values to see them here, or the CSS fallbacks are used.
                These values only affect the preview and aren&apos;t added to your files.
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {missingVars.map((name) => (
                  <label key={name} className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate" title={name}>
                      {name}
                    </code>
                    <input
                      value={typedVars[name] ?? ""}
                      placeholder="#222222"
                      onChange={(e) => {
                        const next = { ...typedVars, [name]: e.target.value };
                        setTypedVars(next);
                        savePreviewVars(next);
                      }}
                      className={`${inputClass} !w-28 shrink-0 !px-2 !py-1 !text-xs`}
                    />
                  </label>
                ))}
              </div>
            </details>
          )}

          <div ref={stageRef} className="min-h-0 flex-1 overflow-hidden bg-white">
            {previewName ? (
              // No allow-scripts, so nothing in the page can run. allow-same-origin only lets
              // this component read and restore the scroll position.
              <iframe
                ref={iframeRef}
                title="Preview"
                sandbox="allow-same-origin"
                srcDoc={previewDoc}
                onLoad={() =>
                  iframeRef.current?.contentWindow?.scrollTo(previewScroll.current.x, previewScroll.current.y)
                }
                style={
                  desktop && scale > 0
                    ? {
                        width: DESKTOP_WIDTH,
                        height: stage.height / scale,
                        transform: `scale(${scale})`,
                        transformOrigin: "0 0",
                      }
                    : { width: "100%", height: "100%" }
                }
                className="block bg-white"
              />
            ) : (
              <p className="h-full bg-background p-4 text-sm text-zinc-500">Add an HTML file to see a preview.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
