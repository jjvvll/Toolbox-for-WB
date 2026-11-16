// Homepage opening copy: what sits over the hero video or image. Each design is
// pasted into the opening section's description, with its CSS in the section's
// custom CSS.

import {
  ACCENT,
  BODY_FONT,
  CARD,
  CARD_TEXT,
  LIGHT,
  LINE_ON_DARK,
  box,
  formatCss,
  shade,
  wrap,
  type Snippet,
} from "./shared";

// ---------- HTML pieces ----------

export const PRE = `<p><span class="hero-pretitle">Brokerage Name</span></p>`;
// %NAME% and %FIRST% are filled in for an individual agent or a team.
export const TITLE = `<h2 class="hero-title">%NAME%</h2>`;
export const SUB = `<p class="hero-subtitle">Your Tagline Goes Here</p>`;

export const logo = (size = "400x140") =>
  `<img class="agent-logo" src="https://placehold.co/${size}/transparent/FFF?text=LOGO" alt="Logo" />`;

export const button = (style: string, label: string, href: string) =>
  `<a class="lp-btn button-style-2 opening-button opening-button--${style}" href="${href}"><span class="lp-btn__content">${label}</span></a>`;

export const FIND = "../home-search/listings";
export const SELL = "../home-valuation";

const buttonRow = (first = "outline", second = "filled") =>
  wrap("div", "buttons", button(first, "Find A Home", FIND), button(second, "Sell A Home", SELL));
const BUTTONS = buttonRow();

// ---------- CSS pieces ----------

type TextOptions = {
  /** Text color. */
  ink?: string;
  /** Title size on desktop, or false when the design has no title. */
  title?: string | false;
  titleSm?: string;
  /** Space under the title. */
  gap?: string;
  pre?: boolean;
  sub?: boolean;
};

export function text(options: TextOptions = {}): string {
  const { ink = LIGHT, title = "56px", titleSm = "35px", gap, pre = true, sub = true } = options;
  const rules: string[] = [];
  if (pre) {
    rules.push(
      `.hero-pretitle { display: block; color: ${ink}; font-family: ${BODY_FONT}; font-size: 13px; letter-spacing: 5px; text-transform: uppercase; margin-bottom: 16px }`,
    );
  }
  if (title) {
    rules.push(
      `.hero-title { color: ${ink}; font-size: ${title}; line-height: 1.08; margin: ${gap ? `0 0 ${gap}` : "0"} }`,
    );
  }
  if (sub) rules.push(`.hero-subtitle { color: ${ink}; margin: 0 0 28px; line-height: 1.6; opacity: 0.9 }`);
  const small = [
    pre && `.hero-pretitle { font-size: 11px; letter-spacing: 4px; margin-bottom: 12px }`,
    title && `.hero-title { font-size: ${titleSm} }`,
  ].filter(Boolean);
  if (small.length) rules.push(`@media (max-width: 768px) { ${small.join(" ")} }`);
  return rules.join("\n");
}

type ButtonOptions = {
  /** Button text and border color. */
  ink?: string;
  /** Text color on a filled button. */
  on?: string;
  align?: "center" | "flex-start" | "flex-end";
  width?: string;
  radius?: string;
  /** "accent" fills the second button with the button color instead of the text color. */
  fill?: "ink" | "accent";
  /** One button per row, full width. */
  stack?: boolean;
};

export function buttons(options: ButtonOptions = {}): string {
  const { ink = LIGHT, on = ACCENT, align = "center", width = "230px", radius, fill = "ink", stack = false } = options;
  const filled = fill === "accent" ? { bg: ACCENT, text: ink } : { bg: ink, text: on };
  const rules = [
    `/* Buttons */`,
    `.opening-button { transition: 0.3s ease; letter-spacing: 2.5px; font-weight: 600 !important; padding: 14px 22px; margin-inline: ${stack ? "0" : "5px"} !important; border: 2px solid ${ink}${radius ? `; border-radius: ${radius}` : ""} }`,
    `.opening-button::before, .opening-button::after { display: none }`,
    `.opening-button--outline { background-color: transparent !important; color: ${ink} !important; border-color: ${ink} !important }`,
    `.opening-button--outline:hover { background-color: ${ink} !important; color: ${on} !important; border-color: ${ink} !important }`,
    `.opening-button--filled { background-color: ${filled.bg} !important; color: ${filled.text} !important; border-color: ${filled.bg} !important }`,
    `.opening-button--filled:hover { background-color: transparent !important; color: ${ink} !important; border-color: ${ink} !important }`,
  ];
  if (stack) {
    rules.push(
      `.buttons { display: flex !important; flex-direction: column; align-items: stretch !important; gap: 12px }`,
      `.buttons a { width: 100% !important; text-decoration: none !important; text-decoration-color: transparent !important }`,
    );
  } else {
    rules.push(
      `.buttons { display: flex !important; justify-content: ${align} !important; align-items: center !important }`,
      `.buttons a { width: ${width} !important; text-decoration: none !important; text-decoration-color: transparent !important }`,
      `@media (max-width: 768px) { .buttons { flex-direction: column; gap: 10px } .buttons a { width: 100% !important; margin-inline: 0 !important } }`,
    );
  }
  return rules.join("\n");
}

const RESET = `section { padding-top: 0 !important; padding-bottom: 0 !important }`;
// The opening description keeps line breaks, so without this the HTML's own
// line breaks would show up as blank lines.
const ROOT = `.hero-copy { white-space: normal }`;

export function opening(id: string, name: string, html: string, ...css: string[]): Snippet {
  const snippet: Snippet = { id, name, html, css: formatCss([RESET, ROOT, ...css].join("\n")) };
  // A band stretched to the screen's edges has no side to move to.
  if (css.some((rules) => rules.includes("width: 100vw"))) snippet.fullWidth = true;
  // A design with one button can take a second in the other style, when its CSS has one.
  const styles = html.match(/opening-button--(filled|outline)/g) ?? [];
  if (styles.length === 1) {
    const other = styles[0].endsWith("filled") ? "outline" : "filled";
    if (snippet.css.includes(`.opening-button--${other}`)) {
      snippet.extraButton = { html: button(other, "Sell A Home", SELL), css: "" };
    }
  }
  return snippet;
}

/** A centered column of the given width. */
export const centered = (name: string, width: string, extra = "") =>
  `.hero-copy--${name} { max-width: ${width}; margin-inline: auto; padding-inline: 20px; text-align: center${extra} }`;

/** A full-width wrapper for left- or right-aligned copy that centers on phones. */
export const wide = (name: string, align: "left" | "right") =>
  `.hero-copy--${name} { max-width: 1200px; margin-inline: auto; padding-inline: 20px; text-align: ${align} }`;

export const centerOnPhones = (name: string, extra = "") =>
  `@media (max-width: 768px) { .hero-copy--${name} { text-align: center } ${extra} }`;

// ---------- The designs ----------

export const OPENINGS: Snippet[] = [
  opening(
    "split",
    "Split with divider",
    box("hero-copy hero-copy--split", box("hero-copy__lead", PRE, TITLE), box("hero-copy__aside", SUB, BUTTONS)),
    `.hero-copy--split { display: grid; grid-template-columns: 1.1fr 1fr; align-items: end; gap: 48px; max-width: 1200px; margin-inline: auto; padding-inline: 20px; text-align: left }
     .hero-copy__aside { border-left: 1px solid ${LIGHT}; padding-left: 32px }
     @media (max-width: 992px) { .hero-copy--split { grid-template-columns: 1fr; gap: 28px; align-items: start } .hero-copy__aside { border-left: 0; padding-left: 0 } }`,
    centerOnPhones("split"),
    text(),
    buttons({ align: "flex-start" }),
  ),

  opening(
    "centered",
    "Centered classic",
    box("hero-copy hero-copy--centered", PRE, TITLE, SUB, BUTTONS),
    centered("centered", "820px"),
    text({ title: "64px", gap: "20px" }),
    buttons(),
  ),

  opening(
    "lined",
    "Pretitle between lines",
    box("hero-copy hero-copy--lined", PRE, TITLE, SUB, BUTTONS),
    centered("lined", "860px"),
    text({ title: "60px", gap: "20px" }),
    `.hero-copy--lined .hero-pretitle { display: inline-flex; align-items: center; gap: 18px }
     .hero-copy--lined .hero-pretitle::before, .hero-copy--lined .hero-pretitle::after { content: ""; width: 48px; height: 1px; background: ${LIGHT} }
     @media (max-width: 768px) { .hero-copy--lined .hero-pretitle { gap: 12px } .hero-copy--lined .hero-pretitle::before, .hero-copy--lined .hero-pretitle::after { width: 24px } }`,
    buttons(),
  ),

  opening(
    "bar-left",
    "Left with accent bar",
    box("hero-copy hero-copy--bar-left", box("hero-copy__body", PRE, TITLE, SUB, BUTTONS)),
    wide("bar-left", "left"),
    `.hero-copy__body { max-width: 640px; padding-left: 32px; border-left: 3px solid ${ACCENT} }`,
    centerOnPhones(
      "bar-left",
      `.hero-copy__body { margin-inline: auto; padding: 24px 0 0; border-left: 0; border-top: 3px solid ${ACCENT} }`,
    ),
    text({ title: "60px", gap: "20px" }),
    buttons({ align: "flex-start" }),
  ),

  opening(
    "bar-right",
    "Right with accent bar",
    box("hero-copy hero-copy--bar-right", box("hero-copy__body", PRE, TITLE, SUB, BUTTONS)),
    wide("bar-right", "right"),
    `.hero-copy__body { max-width: 640px; margin-left: auto; padding-right: 32px; border-right: 3px solid ${ACCENT} }`,
    centerOnPhones(
      "bar-right",
      `.hero-copy__body { margin-inline: auto; padding: 24px 0 0; border-right: 0; border-top: 3px solid ${ACCENT} }`,
    ),
    text({ title: "60px", gap: "20px" }),
    buttons({ align: "flex-end" }),
  ),

  opening(
    "logo",
    "Logo and tagline",
    box("hero-copy hero-copy--logo", logo(), SUB, BUTTONS),
    centered("logo", "820px"),
    `.agent-logo { display: block; width: 400px; max-width: 80%; height: auto; margin: 0 auto 28px }`,
    text({ pre: false, title: false }),
    `.hero-subtitle { font-size: 14px; letter-spacing: 5px; text-transform: uppercase }`,
    buttons(),
  ),

  opening(
    "logo-rule",
    "Logo, rule and name",
    box("hero-copy hero-copy--logo-rule", logo(), `<div class="hero-rule"></div>`, TITLE, SUB, BUTTONS),
    centered("logo-rule", "820px"),
    `.agent-logo { display: block; width: 320px; max-width: 70%; height: auto; margin-inline: auto }
     .hero-rule { width: 72px; height: 1px; margin: 28px auto; background: ${LIGHT} }`,
    text({ pre: false, title: "34px", titleSm: "26px", gap: "12px" }),
    `.hero-title { font-weight: 300 !important; letter-spacing: 8px }`,
    buttons(),
  ),

  opening(
    "logo-split",
    "Logo beside the copy",
    box(
      "hero-copy hero-copy--logo-split",
      box("hero-copy__brand", logo("360x200")),
      box("hero-copy__aside", PRE, TITLE, SUB, BUTTONS),
    ),
    `.hero-copy--logo-split { display: grid; grid-template-columns: 1fr 1.2fr; align-items: center; gap: 56px; max-width: 1200px; margin-inline: auto; padding-inline: 20px; text-align: left }
     .hero-copy__brand { text-align: right }
     .agent-logo { width: 360px; max-width: 100%; height: auto }
     .hero-copy__aside { padding-left: 56px; border-left: 1px solid ${LIGHT} }
     @media (max-width: 992px) { .hero-copy--logo-split { grid-template-columns: 1fr; gap: 28px; text-align: center } .hero-copy__brand { text-align: center } .agent-logo { width: 280px } .hero-copy__aside { padding-left: 0; border-left: 0 } }`,
    text({ title: "44px", titleSm: "32px", gap: "16px" }),
    buttons({ align: "flex-start" }),
    `@media (max-width: 992px) { .buttons { justify-content: center !important } }`,
  ),

  opening(
    "framed",
    "Thin frame",
    box("hero-copy hero-copy--framed", PRE, TITLE, SUB, BUTTONS),
    `.hero-copy--framed { max-width: 780px; margin-inline: auto; padding: 56px 48px; border: 1px solid ${LIGHT}; text-align: center }
     @media (max-width: 768px) { .hero-copy--framed { padding: 40px 20px } }`,
    text({ gap: "20px" }),
    buttons(),
  ),

  opening(
    "double-frame",
    "Double frame",
    box("hero-copy hero-copy--double-frame", PRE, TITLE, SUB, BUTTONS),
    `.hero-copy--double-frame { position: relative; max-width: 780px; margin-inline: auto; padding: 64px 56px; border: 1px solid ${LIGHT}; text-align: center }
     .hero-copy--double-frame::after { content: ""; position: absolute; inset: 10px; border: 1px solid ${ACCENT}; pointer-events: none }
     @media (max-width: 768px) { .hero-copy--double-frame { padding: 48px 24px } }`,
    text({ gap: "20px" }),
    buttons(),
  ),

  opening(
    "glass",
    "Glass panel",
    box("hero-copy hero-copy--glass", PRE, TITLE, SUB, BUTTONS),
    `.hero-copy--glass { max-width: 740px; margin-inline: auto; padding: 56px 48px; background: ${shade(0.55)}; border: 1px solid ${LINE_ON_DARK}; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); text-align: center }
     @media (max-width: 768px) { .hero-copy--glass { padding: 40px 20px } }`,
    text({ title: "52px", gap: "20px" }),
    buttons(),
  ),

  opening(
    "panel-left",
    "Side panel",
    box("hero-copy hero-copy--panel-left", box("hero-copy__panel", PRE, TITLE, SUB, BUTTONS)),
    wide("panel-left", "left"),
    `.hero-copy__panel { max-width: 460px; padding: 48px 44px; background: ${shade(0.6)}; border-left: 3px solid ${ACCENT}; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px) }`,
    centerOnPhones(
      "panel-left",
      `.hero-copy__panel { margin-inline: auto; padding: 40px 24px; border-left: 0; border-top: 3px solid ${ACCENT} }`,
    ),
    text({ title: "44px", titleSm: "32px", gap: "16px" }),
    buttons({ stack: true }),
  ),

  opening(
    "card",
    "Solid card",
    box("hero-copy hero-copy--card", PRE, TITLE, SUB, BUTTONS),
    `.hero-copy--card { max-width: 700px; margin-inline: auto; padding: 52px 48px; background: ${CARD}; border-top: 3px solid ${ACCENT}; box-shadow: 0 24px 60px ${shade(0.35)}; text-align: center }
     @media (max-width: 768px) { .hero-copy--card { padding: 40px 20px } }`,
    text({ ink: CARD_TEXT, title: "48px", gap: "20px" }),
    buttons({ ink: CARD_TEXT, on: CARD }),
  ),

  opening(
    "row",
    "Name and buttons in a row",
    box("hero-copy hero-copy--row", box("hero-copy__lead", PRE, TITLE), BUTTONS),
    `.hero-copy--row { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; max-width: 1200px; margin-inline: auto; padding: 32px 20px 0; border-top: 1px solid ${LIGHT}; text-align: left }
     @media (max-width: 992px) { .hero-copy--row { flex-direction: column; align-items: center; gap: 28px; text-align: center } }
     @media (max-width: 768px) { .hero-copy--row .buttons { align-self: stretch } }`,
    text({ title: "52px", sub: false }),
    buttons(),
  ),

  opening(
    "display",
    "Oversized thin name",
    box("hero-copy hero-copy--display", PRE, TITLE, BUTTONS),
    centered("display", "1100px"),
    text({ title: "clamp(64px, 8vw, 112px)", titleSm: "40px", gap: "36px", sub: false }),
    `.hero-title { font-weight: 300 !important; letter-spacing: 10px; text-shadow: 0 4px 24px ${shade(0.4)} }
     @media (max-width: 768px) { .hero-title { letter-spacing: 4px; margin-bottom: 28px } }`,
    buttons(),
  ),

  opening(
    "stacked-name",
    "Two-line name",
    box(
      "hero-copy hero-copy--stacked-name",
      `<h2 class="hero-title"><span class="hero-title__first">%FIRST%</span> <span class="hero-title__last">Name</span></h2>`,
      SUB,
      BUTTONS,
    ),
    centered("stacked-name", "900px"),
    text({ pre: false, title: "96px", titleSm: "52px", gap: "24px" }),
    `.hero-title__first { display: block; margin-bottom: 10px; font-size: 26px; letter-spacing: 14px }
     .hero-title__last { display: block; line-height: 1 }
     @media (max-width: 768px) { .hero-title__first { font-size: 18px; letter-spacing: 8px } }`,
    buttons(),
  ),

  opening(
    "underline",
    "Accent underline",
    box("hero-copy hero-copy--underline", PRE, TITLE, SUB, BUTTONS),
    centered("underline", "820px"),
    text({ title: "60px" }),
    `.hero-title::after { content: ""; display: block; width: 72px; height: 3px; margin: 24px auto; background: ${ACCENT} }`,
    buttons(),
  ),

  opening(
    "pill",
    "Pill badge and buttons",
    box("hero-copy hero-copy--pill", PRE, TITLE, SUB, BUTTONS),
    centered("pill", "820px"),
    text({ title: "58px", gap: "20px" }),
    `.hero-pretitle { display: inline-block; padding: 8px 22px; border: 1px solid ${LIGHT}; border-radius: 999px; font-size: 12px; letter-spacing: 4px }`,
    buttons({ radius: "999px" }),
  ),

  opening(
    "links",
    "Underlined text links",
    box(
      "hero-copy hero-copy--links",
      PRE,
      TITLE,
      SUB,
      wrap("div", "buttons", button("link", "Find A Home", FIND), button("link", "Sell A Home", SELL)),
    ),
    wide("links", "left"),
    `.hero-copy--links .hero-subtitle { max-width: 520px }`,
    centerOnPhones("links", `.hero-copy--links .hero-subtitle { margin-inline: auto }`),
    text({ title: "64px", gap: "20px" }),
    `/* Buttons */
     .opening-button--link { min-width: 0; margin: 0 !important; padding: 6px 0; background-color: transparent !important; border: 0 !important; border-bottom: 1px solid ${LIGHT} !important; color: ${LIGHT} !important; font-weight: 600 !important; letter-spacing: 3px; transition: 0.3s ease }
     .opening-button--link::before, .opening-button--link::after { display: none }
     .opening-button--link:hover { color: ${ACCENT} !important; border-color: ${ACCENT} !important }
     .buttons { display: flex !important; justify-content: flex-start !important; gap: 40px }
     .buttons a { text-decoration: none !important; text-decoration-color: transparent !important }
     @media (max-width: 768px) { .buttons { justify-content: center !important; gap: 28px } }`,
  ),

  opening(
    "stack",
    "Stacked buttons",
    box("hero-copy hero-copy--stack", PRE, TITLE, SUB, BUTTONS),
    centered("stack", "440px"),
    text({ title: "52px", gap: "20px" }),
    buttons({ stack: true }),
  ),

  opening(
    "trio",
    "Three columns",
    box(
      "hero-copy hero-copy--trio",
      box("hero-copy__left", PRE, SUB),
      box("hero-copy__center", TITLE),
      box("hero-copy__right", BUTTONS),
    ),
    `.hero-copy--trio { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 40px; max-width: 1200px; margin-inline: auto; padding-inline: 20px }
     .hero-copy__left { text-align: right }
     .hero-copy__center { padding: 12px 40px; border-inline: 1px solid ${LIGHT}; text-align: center }
     .hero-copy__right { max-width: 230px }
     @media (max-width: 992px) { .hero-copy--trio { grid-template-columns: 1fr; gap: 24px; text-align: center } .hero-copy__left { text-align: center } .hero-copy__center { padding: 0; border: 0 } .hero-copy__right { width: 100%; margin-inline: auto } }
     @media (max-width: 768px) { .hero-copy__right { max-width: none } }`,
    text({ title: "52px" }),
    `.hero-copy__left .hero-subtitle { margin: 0 }`,
    buttons({ stack: true }),
  ),

  opening(
    "inline",
    "Brokerage beside the name",
    box(
      "hero-copy hero-copy--inline",
      box("hero-copy__heading", `<span class="hero-pretitle">Brokerage Name</span>`, TITLE),
      SUB,
      BUTTONS,
    ),
    centered("inline", "1000px"),
    `.hero-copy__heading { display: flex; align-items: stretch; justify-content: center; gap: 28px; margin-bottom: 24px }
     .hero-copy__heading .hero-pretitle { display: flex; align-items: center; margin: 0; padding-right: 28px; border-right: 1px solid ${LIGHT} }
     @media (max-width: 768px) { .hero-copy__heading { flex-direction: column; gap: 12px } .hero-copy__heading .hero-pretitle { justify-content: center; padding: 0; border: 0 } }`,
    text({ title: "52px" }),
    buttons(),
  ),

  opening(
    "corners",
    "Corner brackets",
    box("hero-copy hero-copy--corners", PRE, TITLE, SUB, BUTTONS),
    `.hero-copy--corners { position: relative; max-width: 780px; margin-inline: auto; padding: 56px 48px; text-align: center }
     .hero-copy--corners::before, .hero-copy--corners::after { content: ""; position: absolute; width: 64px; height: 64px; pointer-events: none }
     .hero-copy--corners::before { top: 0; left: 0; border-top: 2px solid ${ACCENT}; border-left: 2px solid ${ACCENT} }
     .hero-copy--corners::after { right: 0; bottom: 0; border-right: 2px solid ${ACCENT}; border-bottom: 2px solid ${ACCENT} }
     @media (max-width: 768px) { .hero-copy--corners { padding: 40px 20px } .hero-copy--corners::before, .hero-copy--corners::after { width: 40px; height: 40px } }`,
    text({ gap: "20px" }),
    buttons(),
  ),

  opening(
    "bold",
    "Bold with accent button",
    box("hero-copy hero-copy--bold", PRE, TITLE, SUB, BUTTONS),
    centered("bold", "900px"),
    text({ title: "68px", titleSm: "38px", gap: "20px" }),
    `.hero-title { font-weight: 700 !important; letter-spacing: 2px; text-shadow: 0 4px 24px ${shade(0.4)} }`,
    buttons({ fill: "accent" }),
  ),

  opening(
    "soft",
    "Light and airy",
    box("hero-copy hero-copy--soft", PRE, TITLE, SUB, BUTTONS),
    centered("soft", "820px"),
    text({ title: "60px", gap: "16px" }),
    `.hero-pretitle { letter-spacing: 9px }
     .hero-title { font-weight: 300 !important; letter-spacing: 4px }
     .hero-subtitle { font-style: italic }`,
    buttons({ radius: "999px", fill: "accent" }),
  ),

  opening(
    "badge",
    "Round logo badge",
    box("hero-copy hero-copy--badge", logo("300x300"), PRE, TITLE, BUTTONS),
    centered("badge", "820px"),
    `.agent-logo { display: block; width: 132px; height: 132px; margin: 0 auto 28px; border: 1px solid ${LIGHT}; border-radius: 50%; object-fit: cover }
     @media (max-width: 768px) { .agent-logo { width: 104px; height: 104px } }`,
    text({ title: "52px", gap: "32px", sub: false }),
    buttons(),
  ),

  opening(
    "statement",
    "Tagline as the headline",
    box(
      "hero-copy hero-copy--statement",
      `<h2 class="hero-title">Your Tagline Goes Here</h2>`,
      `<p class="hero-byline">%NAME% <span>|</span> Brokerage Name</p>`,
      BUTTONS,
    ),
    wide("statement", "left"),
    centerOnPhones("statement", `.hero-title { margin-inline: auto }`),
    text({ pre: false, sub: false, title: "64px", gap: "20px" }),
    `.hero-title { max-width: 780px }
     .hero-byline { margin: 0 0 32px; color: ${LIGHT}; font-size: 13px; letter-spacing: 4px; text-transform: uppercase }
     .hero-byline span { margin-inline: 12px; color: ${ACCENT} }
     @media (max-width: 768px) { .hero-byline { font-size: 11px; letter-spacing: 2px } .hero-byline span { margin-inline: 8px } }`,
    buttons({ align: "flex-start" }),
  ),

  opening(
    "side-label",
    "Vertical side label",
    box(
      "hero-copy hero-copy--side-label",
      `<span class="hero-pretitle">Brokerage Name</span>`,
      box("hero-copy__body", TITLE, SUB, BUTTONS),
    ),
    `.hero-copy--side-label { display: flex; align-items: stretch; gap: 32px; max-width: 1200px; margin-inline: auto; padding-inline: 20px; text-align: left }
     @media (max-width: 768px) { .hero-copy--side-label { flex-direction: column; align-items: center; gap: 16px; text-align: center } .hero-copy__body { width: 100% } }`,
    text({ title: "64px", gap: "20px" }),
    `.hero-copy--side-label .hero-pretitle { margin: 0; padding-left: 24px; border-left: 1px solid ${LIGHT}; writing-mode: vertical-rl; transform: rotate(180deg); text-align: center }
     @media (max-width: 768px) { .hero-copy--side-label .hero-pretitle { padding: 0; border: 0; writing-mode: horizontal-tb; transform: none } }`,
    buttons({ align: "flex-start" }),
  ),

  opening(
    "single",
    "One button and a text link",
    box(
      "hero-copy hero-copy--single",
      PRE,
      TITLE,
      SUB,
      wrap("div", "buttons", button("filled", "Find A Home", FIND)),
      `<p class="hero-alt"><a href="${SELL}">Or See What Your Home Is Worth</a></p>`,
    ),
    centered("single", "820px"),
    text({ title: "60px", gap: "20px" }),
    `.hero-alt { margin: 22px 0 0 }
     .hero-alt a { padding-bottom: 3px; border-bottom: 1px solid ${LIGHT}; color: ${LIGHT}; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; text-decoration: none !important; transition: 0.3s ease }
     .hero-alt a:hover { border-color: ${ACCENT}; color: ${ACCENT} }
     @media (max-width: 768px) { .hero-alt a { font-size: 11px; letter-spacing: 1.5px } }`,
    buttons({ width: "280px" }),
  ),

  opening(
    "band",
    "Full-width gradient band",
    box("hero-copy hero-copy--band", PRE, TITLE, SUB, BUTTONS),
    `.hero-copy--band { width: 100vw; margin-left: calc(50% - 50vw); padding: 56px max(20px, calc(50vw - 535px)); background: linear-gradient(90deg, ${shade(0.85)} 0%, ${shade(0.5)} 55%, ${shade(0)} 100%); border-left: 6px solid ${ACCENT}; text-align: left }
     @media (max-width: 768px) { .hero-copy--band { padding: 40px 20px; background: ${shade(0.7)}; border-left: 0; border-top: 3px solid ${ACCENT}; text-align: center } }`,
    text({ title: "56px", gap: "16px" }),
    buttons({ align: "flex-start" }),
  ),
];
