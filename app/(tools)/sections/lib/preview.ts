// Builds the page each preview iframe shows: the snippet inside a stand-in for
// the real site's section, with the palette tool's colors and fonts applied.

import { ROOT_DEFAULTS, rootEntries } from "../../color-palette/lib/color";
import { DEFAULT_FONT, cssFamily, googleFontsUrl, pairFor, type FontChoice } from "../../color-palette/lib/fonts";
import { parseSavedRoot } from "../../color-palette/lib/saved-root";

/** Headings, profiles, and the two kinds of content section: text only, and text with images. */
export type SectionKind = "opening" | "profile" | "text" | "media";

export type PreviewTheme = {
  /** CSS variables for :root, colors first. */
  vars: Record<string, string>;
  fontsUrl: string;
  /** False when the palette tool has nothing saved and the sample colors are used. */
  fromPalette: boolean;
  templateLabel: string;
};

/** The palette tool's saved colors and fonts, or its starting sample if nothing is saved. */
export function readTheme(rawSavedPalette: string | null): PreviewTheme {
  const saved = parseSavedRoot(rawSavedPalette);
  let font: FontChoice = DEFAULT_FONT;
  try {
    font = JSON.parse(rawSavedPalette ?? "null")?.font ?? DEFAULT_FONT;
  } catch {
    // Unreadable save: keep the default pairing.
  }
  const pair = pairFor(font);
  return {
    vars: {
      ...(saved?.vars ?? Object.fromEntries(rootEntries("visionary", ROOT_DEFAULTS, "uppercase"))),
      "--global-primary-font-family": cssFamily(pair.heading),
      "--global-secondary-font-family": cssFamily(pair.body),
      "--global-body-font-size": "16px",
      "--global-h2-font-size": "48px",
    },
    fontsUrl: googleFontsUrl([pair]),
    fromPalette: !!saved,
    templateLabel: saved?.templateLabel ?? "Visionary",
  };
}

/** The theme's own button colors, which every section button starts from. */
export const THEME_BUTTON_CSS = `.button-style-2{color:var(--accent-button)!important;background-color:var(--primary-light)!important;border-color:var(--primary-light)!important}
.button-style-2:hover{color:var(--primary-light)!important;background-color:transparent!important;border-color:var(--primary-light)!important}`;

// The parts of the site theme that decide how a pasted section looks, taken
// from the live theme stylesheet: resets, heading and body type, the base
// button, and the theme's own button colors that sections have to override.
const THEME_CSS = `
*{box-sizing:border-box}
html{font-family:sans-serif;line-height:1.666;-webkit-font-smoothing:antialiased}
body{margin:0;padding:0;overflow-x:hidden;word-wrap:break-word;background:#fff;color:#000;font-family:var(--global-secondary-font-family);font-size:var(--global-body-font-size,14px);font-weight:400;line-height:1.714286}
blockquote,figure,h1,h2,h3,h4,h5,h6,ol,p,ul{margin:0 0 1.666rem;padding:0}
h1,h2,h3,h4,h5,h6{color:inherit;text-rendering:optimizeLegibility;font-family:var(--global-primary-font-family);text-transform:var(--text-case)!important}
h2{font-size:var(--global-h2-font-size);font-weight:400;line-height:1.166667}
@media(max-width:767px){h2{font-size:28px;line-height:1.357143}}
a{background-color:transparent;color:inherit;text-decoration:none}
img{border:0;vertical-align:middle;max-width:100%}
.lp-btn{background:transparent;border:1px solid;border-radius:0;box-shadow:none;color:#fff;cursor:pointer;display:inline-block;flex-shrink:0;font-size:14px;font-weight:700;line-height:24px;min-width:128px;outline:none;padding:10px 20px;position:relative;text-align:center;text-decoration:none;text-transform:uppercase;transition:all .3s;vertical-align:middle}
@media(hover:hover) and (pointer:fine){
.lp-btn:after{border-right:0 solid;border-top:0 solid;content:"";display:inline-block;height:0;line-height:1;margin-left:0;position:relative;top:-1px;transform:rotate(45deg);transition:width .3s,height .3s,margin .3s,border .2s;vertical-align:middle;width:0}
.lp-btn:hover:after{border-right-width:2px;border-top-width:2px;height:9px;margin-left:2px;width:9px}
}
${THEME_BUTTON_CSS}
.container,.lp-container{margin-left:auto;margin-right:auto;padding-left:20px;padding-right:20px;width:100%}
@media(min-width:992px){.container,.lp-container{padding-left:30px;padding-right:30px}}
@media(min-width:1150px){.container,.lp-container{max-width:1130px}}
.lp-title-group{margin:0 auto 32px;max-width:860px;text-align:center}
@media(max-width:767px){.lp-title-group{margin-bottom:16px}}
.lp-pre-line{white-space:pre-line}
`;

// The opening section: a hero image under a dark overlay, with the description
// centered in it. The photo is drawn with gradients so nothing has to download.
const OPENING_CSS = `
.video-section{position:relative;color:#fff;overflow:hidden}
.hero-photo{position:absolute;inset:0;background:
  radial-gradient(90% 60% at 72% 30%,rgba(255,214,170,.55),transparent 62%),
  radial-gradient(70% 50% at 18% 80%,rgba(40,58,52,.55),transparent 70%),
  linear-gradient(180deg,#5f7d99 0%,#9fb0b8 38%,#b8a890 56%,#6a6a58 76%,#3a3d34 100%)}
.overlay-component{position:absolute;inset:0;background-color:rgba(0,0,0,.4)}
.opening-with-search{position:relative;--top-padding:110px;--bottom-padding:30px;display:flex;width:100%;flex-direction:column;min-height:680px;padding-top:var(--top-padding);padding-bottom:var(--bottom-padding)}
.opening-with-search p,.center-block p{margin-bottom:10px}
.opening-with-search .center-block{flex:1 0 auto;display:flex;align-items:center;justify-content:center;flex-direction:column}
.opening-with-search .bottom-spacer{position:relative;z-index:0;flex:1 0 0%;max-height:calc(var(--top-padding) - var(--bottom-padding))}
.opening-with-search .opening-description{letter-spacing:.1em;margin-bottom:15px}
.opening-with-search .opening-button{margin:0 15px}
.opening-with-search .lp-title-group{max-width:100%}
`;

const PROFILE_CSS = `
.solid-section{background-color:var(--primary-light-bg);color:#000}
.boxed-text__description{text-align:center}
`;

// A profile or content section is pasted into a plain boxed-text section.
const boxedText = (html: string) =>
  `<section class="solid-section"><div class="boxed-text redesign"><div class="lp-container">` +
  `<div class="boxed-text__description">${html}</div></div></div></section>`;

const HOSTS: Record<SectionKind, (html: string) => string> = {
  opening: (html) =>
    `<section class="video-section"><div class="hero-photo"></div><div class="overlay-component"></div>` +
    `<div class="redesign opening-with-search"><div class="center-block"><div class="container lp-container">` +
    `<div class="lp-title-group"><div class="opening-description feature lp-pre-line">${html}</div></div>` +
    `</div></div><div class="bottom-spacer"></div></div></section>`,
  profile: boxedText,
  text: boxedText,
  media: boxedText,
};

const svgUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** A stand-in drawn locally, so previews don't wait on the placeholder image service. */
function placeholderImage(width: number, height: number, label: string): string {
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  if (/logo/i.test(label)) {
    const size = Math.min(height * 0.42, width * 0.2);
    return svgUrl(
      `${open}<text x="50%" y="50%" fill="#fff" font-family="Georgia,serif" font-size="${size}" letter-spacing="${size * 0.18}" text-anchor="middle" dominant-baseline="central">LOGO</text></svg>`,
    );
  }
  const backdrop =
    `${open}<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d3d9de"/><stop offset="1" stop-color="#bcc4cb"/></linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#g)"/>`;
  // Any other picture: a sun over hills.
  if (/^image/i.test(label)) {
    const at = (x: number, y: number) => `${width * x} ${height * y}`;
    return svgUrl(
      `${backdrop}<circle cx="${width * 0.72}" cy="${height * 0.3}" r="${Math.min(width, height) * 0.08}" fill="#eef1f3"/>` +
        `<path d="M${at(0, 1)} L${at(0, 0.82)} L${at(0.3, 0.5)} L${at(0.52, 0.76)} L${at(0.7, 0.6)} L${at(1, 0.88)} L${at(1, 1)}Z" fill="#a9b1b9"/></svg>`,
    );
  }
  // One figure for a portrait, three for a team or a wide banner photo.
  const figure = (cx: number, r: number, fill: string) =>
    `<circle cx="${cx}" cy="${height * 0.4 - r * 0.2}" r="${r}" fill="${fill}"/>` +
    `<path d="M${cx - r * 2.3} ${height} C${cx - r * 2.3} ${height * 0.4 + r * 1.3} ${cx + r * 2.3} ${height * 0.4 + r * 1.3} ${cx + r * 2.3} ${height}Z" fill="${fill}"/>`;
  const r = Math.min(width, height) * 0.16;
  const figures =
    width / height > 1.4 || /team/i.test(label)
      ? figure(width * 0.3, r * 0.85, "#a9b1b9") + figure(width * 0.7, r * 0.85, "#a9b1b9") + figure(width * 0.5, r, "#959ea8")
      : figure(width * 0.5, r, "#959ea8");
  return svgUrl(`${backdrop}${figures}</svg>`);
}

const PLACEHOLDER_URL = /https:\/\/placehold\.co\/(\d+)x(\d+)[^"\s]*?\?text=([^"&\s]*)/g;

/** A complete document for the preview iframe. */
export function buildPreviewDoc(kind: SectionKind, html: string, css: string, theme: PreviewTheme): string {
  const root = Object.entries(theme.vars)
    .map(([name, value]) => `${name}:${value};`)
    .join("");
  const body = html.replace(PLACEHOLDER_URL, (_, width: string, height: string, label: string) =>
    placeholderImage(Number(width), Number(height), label),
  );
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    // The sandbox blocks new windows, so links in a preview go nowhere instead of replacing it.
    `<base target="_blank">` +
    `<link rel="stylesheet" href="${theme.fontsUrl.replace(/&/g, "&amp;")}">` +
    `<style>:root{${root}}</style><style>${THEME_CSS}${kind === "opening" ? OPENING_CSS : PROFILE_CSS}</style>` +
    `<style>${css}</style></head><body>${HOSTS[kind](body)}</body></html>`
  );
}
