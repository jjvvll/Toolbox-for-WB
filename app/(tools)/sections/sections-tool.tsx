"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import CopyButton from "@/components/copy-button";
import { PALETTE_STORAGE_KEY } from "../color-palette/lib/saved-root";
import Modal from "../notes/modal";
import { buttonChoices, buttonCount, withButtons, type ButtonCount } from "./lib/buttons";
import { KINDS, STYLES } from "./lib/catalog";
import { COLUMNS, ROWS, positionLabel, withPosition, type Position } from "./lib/position";
import { buildPreviewDoc, readTheme, type PreviewTheme, type SectionKind } from "./lib/preview";
import { fillFor, type Audience, type Length, type Snippet } from "./lib/shared";

/** Widths the previews are laid out at. Cards always show the desktop layout, scaled down. */
const VIEWPORTS = { desktop: 1280, tablet: 820, mobile: 390 } as const;
type Device = keyof typeof VIEWPORTS;

/** How many buttons a design shows: its choices, as built, and the one picked (null for as built). */
type Buttons = { choices: ButtonCount[]; built: number; value: ButtonCount | null };

/** A design ready to copy. `position` is undefined for sections that can't be positioned. */
type Item = { key: string; snippet: Snippet; position?: Position | null; buttons: Buttons };

const AUDIENCES: { id: Audience; label: string; detail: string }[] = [
  { id: "agent", label: "Individual", detail: "Agent Name, with a Learn More button to /about" },
  { id: "team", label: "Team", detail: "Team Name, with a Meet The Team button to /team" },
];

const LENGTHS: { id: Length; label: string; detail: string }[] = [
  { id: "short", label: "Short", detail: "Short: a headline with a paragraph or two, or a few brief items." },
  {
    id: "long",
    label: "Long",
    detail: "Long: several paragraphs, broken up with subheadings, images or a quote.",
  },
];

/** Fires when the palette tool saves in another tab, so the previews follow it live. */
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

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A zero width means the element is momentarily not laid out; keeping the last real
    // width stops the previews from being torn down and reloaded.
    const observer = new ResizeObserver(([entry]) => setWidth((w) => entry.contentRect.width || w));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
    active
      ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300"
      : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500"
  }`;

/** One level of the library's filters: a label, then its choices. */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function SectionsTool() {
  // The levels, outermost first: the style set, the kind of section, then either who it's
  // for (sections that name someone) or how much copy it holds (content sections).
  const [styleId, setStyleId] = useState(STYLES[0].id);
  const [kind, setKind] = useState<SectionKind>("opening");
  const [audience, setAudience] = useState<Audience>("agent");
  const [length, setLength] = useState<Length>("short");
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Where each heading sits over the photo, by design. Unset means as designed.
  const [positions, setPositions] = useState<Record<string, Position | null>>({});
  // How many buttons each design shows, by design. Unset means as built.
  const [buttonCounts, setButtonCounts] = useState<Record<string, ButtonCount | null>>({});

  const savedPalette = useSyncExternalStore(subscribeStorage, readSavedPalette, () => null);
  const theme = useMemo(() => readTheme(savedPalette), [savedPalette]);

  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0];
  const currentKind = KINDS.find((k) => k.id === kind)!;
  const currentAudience = AUDIENCES.find((a) => a.id === audience)!;
  const currentLength = LENGTHS.find((l) => l.id === length)!;
  const byLength = currentKind.choice === "length";
  const items = useMemo(
    () =>
      style.sections[kind]
        .filter((snippet) => !byLength || snippet.length === length)
        .map((snippet): Item => {
          const key = `${style.id}-${kind}-${snippet.id}`;
          const value = buttonCounts[key] ?? null;
          const buttons = { choices: buttonChoices(snippet, kind), built: buttonCount(snippet, kind), value };
          const counted = withButtons(snippet, kind, value);
          const filled = { ...counted, html: fillFor(counted.html, audience) };
          // Only headings sit over a photo; the rest are full-width sections of their own.
          if (kind !== "opening") return { key, snippet: filled, buttons };
          const position = positions[key] ?? null;
          return { key, snippet: withPosition(filled, position), position, buttons };
        }),
    [style, kind, audience, byLength, length, positions, buttonCounts],
  );
  const setPosition = (key: string, position: Position | null) =>
    setPositions((all) => ({ ...all, [key]: position }));
  const setButtons = (key: string, count: ButtonCount | null) =>
    setButtonCounts((all) => ({ ...all, [key]: count }));
  const open = items.find((item) => item.key === openKey) ?? null;

  return (
    <div className="mt-8 flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <FilterRow label="Style">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={style.id === s.id}
              title={s.hint}
              onClick={() => {
                setStyleId(s.id);
                setOpenKey(null);
              }}
              className={chip(style.id === s.id)}
            >
              {s.label}{" "}
              <span className="font-normal opacity-70">
                {KINDS.reduce((total, k) => total + s.sections[k.id].length, 0)}
              </span>
            </button>
          ))}
        </FilterRow>

        <FilterRow label="Section">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => {
                setKind(k.id);
                setOpenKey(null);
              }}
              className={chip(kind === k.id)}
            >
              {k.label} <span className="font-normal opacity-70">{style.sections[k.id].length}</span>
            </button>
          ))}
        </FilterRow>

        {byLength ? (
          <FilterRow label="Length">
            {LENGTHS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={length === l.id}
                title={l.detail}
                onClick={() => {
                  setLength(l.id);
                  setOpenKey(null);
                }}
                className={chip(length === l.id)}
              >
                {l.label}{" "}
                <span className="font-normal opacity-70">
                  {style.sections[kind].filter((snippet) => snippet.length === l.id).length}
                </span>
              </button>
            ))}
          </FilterRow>
        ) : (
          <FilterRow label="For">
            {AUDIENCES.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={audience === a.id}
                title={a.detail}
                onClick={() => setAudience(a.id)}
                className={chip(audience === a.id)}
              >
                {a.label}
              </button>
            ))}
          </FilterRow>
        )}
      </div>

      <div className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
        <h2 className="text-base font-medium text-foreground">
          {style.label} <span className="text-zinc-400">/</span> {currentKind.label}{" "}
          <span className="text-zinc-400">/</span>{" "}
          {byLength ? currentLength.label : currentAudience.label}{" "}
          <span className="font-normal text-zinc-500">{items.length} designs</span>
        </h2>
        <p>
          {style.hint} {currentKind.hint}
          {byLength && ` ${currentLength.detail}`}
        </p>
        <p>
          Click a preview to see it full size and on a phone. The text, links and images are
          placeholders to replace after pasting.
        </p>
        <p>
          Use the Buttons choice on a design to show two buttons, one, or none before copying. The
          HTML and CSS change to match: removed buttons take their CSS with them.
        </p>
        {kind === "opening" && (
          <p>
            Use the grid on a design to choose where it sits over the photo, such as bottom left or
            center, before copying. The position is added to its CSS; left and right apply on
            desktop, and every design centers itself on tablets and phones.
          </p>
        )}
        <p className="text-xs text-zinc-500">
          {theme.fromPalette
            ? `Previews use your ${theme.templateLabel} colors and fonts from the `
            : "Previews use sample colors. Save a palette to see your own, in the "}
          <Link href="/color-palette" className="text-blue-600 hover:underline dark:text-blue-400">
            Color Palette tool
          </Link>
          . The CSS only ever uses the palette&apos;s :root variables, so it follows each site&apos;s
          own colors.
        </p>
      </div>

      <ul className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {items.map((item, i) => (
          <Card
            key={item.key}
            index={i + 1}
            kind={kind}
            snippet={item.snippet}
            position={item.position}
            onPosition={(position) => setPosition(item.key, position)}
            buttons={item.buttons}
            onButtons={(count) => setButtons(item.key, count)}
            theme={theme}
            onOpen={() => setOpenKey(item.key)}
          />
        ))}
      </ul>

      {open && (
        <Detail
          kind={kind}
          snippet={open.snippet}
          position={open.position}
          onPosition={(position) => setPosition(open.key, position)}
          buttons={open.buttons}
          onButtons={(count) => setButtons(open.key, count)}
          theme={theme}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
}

/**
 * A 3 by 3 grid for where a heading sits over the photo. Picking the selected
 * cell again goes back to the design's own position.
 */
function PositionPicker({
  value,
  onChange,
  fullWidth = false,
}: {
  value: Position | null;
  onChange: (position: Position | null) => void;
  /** Full-width designs only move up and down. */
  fullWidth?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Position over the photo"
      className="grid shrink-0 grid-cols-3 gap-0.5 rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
    >
      {ROWS.flatMap((y) =>
        COLUMNS.map((x) => {
          const active = value?.x === x && value.y === y;
          const disabled = fullWidth && x !== "center";
          const label = positionLabel({ x, y });
          return (
            <button
              key={`${y}-${x}`}
              type="button"
              aria-pressed={active}
              aria-label={label}
              title={disabled ? "This design spans the full width" : label}
              disabled={disabled}
              onClick={() => onChange(active ? null : { x, y })}
              className={`flex size-4 items-center justify-center rounded-sm transition-colors disabled:opacity-30 ${
                active
                  ? "bg-blue-600"
                  : "enabled:hover:bg-zinc-200 dark:enabled:hover:bg-zinc-800"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${active ? "bg-white" : "bg-zinc-400 dark:bg-zinc-500"}`}
              />
            </button>
          );
        }),
      )}
    </div>
  );
}

/**
 * How many buttons a design shows: none, one or two. Picking the number it was built
 * with goes back to it as built.
 */
function ButtonPicker({ buttons, onChange }: { buttons: Buttons; onChange: (count: ButtonCount | null) => void }) {
  if (!buttons.choices.length) return null;
  const current = buttons.value ?? buttons.built;
  return (
    <div role="group" aria-label="Buttons" className="flex shrink-0 items-center gap-1.5">
      <span className="text-xs text-zinc-500">Buttons</span>
      <div className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
        {buttons.choices.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={current === n}
            title={n === 0 ? "No buttons" : n === 1 ? "One button" : "Two buttons"}
            onClick={() => onChange(n === buttons.built ? null : n)}
            className={`min-w-6 rounded-sm px-1.5 text-xs font-medium tabular-nums transition-colors ${
              current === n
                ? "bg-blue-600 text-white"
                : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

const positionText = (position: Position | null) =>
  position ? positionLabel(position) : "As designed";

function Card({
  index,
  kind,
  snippet,
  position,
  onPosition,
  buttons,
  onButtons,
  theme,
  onOpen,
}: {
  index: number;
  kind: SectionKind;
  snippet: Snippet;
  position?: Position | null;
  onPosition: (position: Position | null) => void;
  buttons: Buttons;
  onButtons: (count: ButtonCount | null) => void;
  theme: PreviewTheme;
  onOpen: () => void;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  // Previews are only built once they're close to the screen: sixty pages at once is a lot.
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setNear(true),
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, ref]);

  const doc = useMemo(
    () => (near ? buildPreviewDoc(kind, snippet.html, snippet.css, theme) : null),
    [near, kind, snippet, theme],
  );

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-background dark:border-zinc-800">
      <div ref={ref} className="relative bg-zinc-100 dark:bg-zinc-900">
        {doc && width > 0 ? (
          <PreviewFrame doc={doc} viewport={VIEWPORTS.desktop} width={width} title={snippet.name} />
        ) : (
          <div className="h-60" />
        )}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${snippet.name}`}
          className="absolute inset-0 cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div className="mr-auto">
          <p className="text-sm font-medium">
            <span className="mr-2 font-normal tabular-nums text-zinc-400">
              {String(index).padStart(2, "0")}
            </span>
            {snippet.name}
          </p>
          {position !== undefined && (
            <p className="text-xs text-zinc-500">Position: {positionText(position)}</p>
          )}
        </div>
        <ButtonPicker buttons={buttons} onChange={onButtons} />
        {position !== undefined && (
          <PositionPicker value={position} onChange={onPosition} fullWidth={snippet.fullWidth} />
        )}
        <CopyButton text={snippet.html} label="Copy HTML" />
        <CopyButton text={snippet.css} label="Copy CSS" />
      </div>
    </li>
  );
}

/**
 * The snippet's page in an iframe laid out `viewport` px wide and scaled down to
 * fit `width`. The frame grows to the height of its content, so nothing scrolls.
 */
function PreviewFrame({
  doc,
  viewport,
  width,
  title,
  interactive = false,
}: {
  doc: string;
  viewport: number;
  width: number;
  title: string;
  interactive?: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const scale = Math.min(1, width / viewport);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const body = frame.contentDocument?.body;
      if (body) setHeight(body.offsetHeight);
    };
    // Runs for every page the frame loads; fonts arriving later change the height again.
    const onLoad = () => {
      observer?.disconnect();
      const body = frame.contentDocument?.body;
      if (!body) return;
      measure();
      observer = new ResizeObserver(measure);
      observer.observe(body);
    };
    frame.addEventListener("load", onLoad);
    if (frame.contentDocument?.readyState === "complete") onLoad();
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, []);

  return (
    <div
      className="mx-auto overflow-hidden"
      style={{ width: viewport * scale, height: height ? height * scale : 240 }}
    >
      {/* No allow-scripts, so nothing in the page can run. allow-same-origin only lets
          this component measure the page's height. */}
      <iframe
        ref={frameRef}
        title={title}
        sandbox="allow-same-origin"
        srcDoc={doc}
        tabIndex={interactive ? 0 : -1}
        className="block origin-top-left border-0"
        style={{
          width: viewport,
          height: Math.max(height, 1),
          transform: `scale(${scale})`,
          pointerEvents: interactive ? "auto" : "none",
        }}
      />
    </div>
  );
}

function Detail({
  kind,
  snippet,
  position,
  onPosition,
  buttons,
  onButtons,
  theme,
  onClose,
}: {
  kind: SectionKind;
  snippet: Snippet;
  position?: Position | null;
  onPosition: (position: Position | null) => void;
  buttons: Buttons;
  onButtons: (count: ButtonCount | null) => void;
  theme: PreviewTheme;
  onClose: () => void;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [stageRef, stageWidth] = useElementWidth<HTMLDivElement>();
  const doc = useMemo(
    () => buildPreviewDoc(kind, snippet.html, snippet.css, theme),
    [kind, snippet, theme],
  );

  return (
    <Modal onClose={onClose} label={snippet.name} className="max-w-6xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="mr-auto font-medium">{snippet.name}</h2>
        {position !== undefined && (
          <div className="mr-2 flex items-center gap-2">
            <span className="text-xs text-zinc-500">Position: {positionText(position)}</span>
            <PositionPicker value={position} onChange={onPosition} fullWidth={snippet.fullWidth} />
          </div>
        )}
        <ButtonPicker buttons={buttons} onChange={onButtons} />
        {(Object.keys(VIEWPORTS) as Device[]).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={device === d}
            onClick={() => setDevice(d)}
            className={`${chip(device === d)} capitalize`}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-1 rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-900"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div ref={stageRef} className="bg-zinc-100 dark:bg-zinc-900">
          {stageWidth > 0 && (
            <PreviewFrame
              doc={doc}
              viewport={VIEWPORTS[device]}
              width={stageWidth}
              title={`${snippet.name} preview`}
              interactive
            />
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
          <CodeBlock label="HTML" code={snippet.html} />
          <CodeBlock label="CSS" code={snippet.css} />
        </div>
      </div>
    </Modal>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <span className="text-xs font-medium tracking-wide text-zinc-500">{label}</span>
        <CopyButton text={code} label={`Copy ${label}`} />
      </div>
      <pre className="max-h-96 overflow-auto p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
