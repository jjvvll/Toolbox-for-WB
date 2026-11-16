// The bold set: heavy uppercase headlines, thick bars in the button color, solid
// blocks of color, hard offset shadows, and square buttons with thick borders.

import * as O from "./openings";
import * as P from "./profiles";
import {
  ACCENT,
  BODY_FONT,
  CARD,
  CARD_TEXT,
  DARK,
  DARK_BG,
  HEADING_FONT,
  LIGHT,
  LIGHT_BG,
  box,
  shade,
  wrap,
  type Snippet,
} from "./shared";

// =====================================================================
// Headings
// =====================================================================

const BUTTONS = wrap(
  "div",
  "buttons",
  O.button("filled", "Find A Home", O.FIND),
  O.button("outline", "Sell A Home", O.SELL),
);
const HERO_STATS = wrap(
  "ul",
  "hero-stats",
  `<li><strong>000+</strong><span>Homes Sold</span></li>`,
  `<li><strong>$000M</strong><span>Total Sales</span></li>`,
  `<li><strong>00</strong><span>Years Experience</span></li>`,
);

type BoldText = {
  /** Text color, and the color of the bar under the brokerage name. */
  ink?: string;
  mark?: string;
  title?: string | false;
  titleSm?: string;
  gap?: string;
  /** "bar" underlines the brokerage name with a thick bar; "plain" leaves it bare. */
  pre?: "bar" | "plain" | false;
  sub?: boolean;
};

function boldText(options: BoldText = {}): string {
  const { ink = LIGHT, mark = ACCENT, title = "72px", titleSm = "40px", gap = "20px", pre = "bar", sub = true } = options;
  const rules: string[] = [];
  if (pre) {
    rules.push(
      `.hero-pretitle { display: inline-block; margin-bottom: 14px;${pre === "bar" ? ` padding-bottom: 8px; border-bottom: 4px solid ${mark};` : ""} color: ${ink}; font-family: ${BODY_FONT}; font-size: 13px; font-weight: 700; line-height: 1.4; letter-spacing: 4px; text-transform: uppercase }`,
    );
  }
  if (title) {
    rules.push(
      `.hero-title { color: ${ink}; font-size: ${title}; font-weight: 700 !important; line-height: 1; letter-spacing: -1px; text-transform: uppercase !important; margin: 0 0 ${gap} }`,
    );
  }
  if (sub) {
    rules.push(
      `.hero-subtitle { color: ${ink}; margin: 0 0 32px; font-size: 18px; font-weight: 600; line-height: 1.5; letter-spacing: 1px }`,
    );
  }
  const small = [
    pre && `.hero-pretitle { font-size: 11px; letter-spacing: 3px }`,
    title && `.hero-title { font-size: ${titleSm} }`,
    sub && `.hero-subtitle { font-size: 16px }`,
  ].filter(Boolean);
  if (small.length) rules.push(`@media (max-width: 768px) { ${small.join(" ")} }`);
  return rules.join("\n");
}

type BoldButtons = {
  /** Text and border color, and the text color once a button fills on hover. */
  ink?: string;
  on?: string;
  /** The solid button's fill and text. */
  solid?: string;
  solidText?: string;
  align?: "center" | "flex-start";
  stack?: boolean;
  width?: string;
};

function boldButtons(options: BoldButtons = {}): string {
  const { ink = LIGHT, on = DARK, solid = ACCENT, solidText = LIGHT, align = "center", stack = false, width = "240px" } = options;
  return [
    `/* Buttons */`,
    `.opening-button { padding: 18px 26px; margin: 0 !important; border: 3px solid ${ink}; font-size: 14px; font-weight: 700 !important; letter-spacing: 2px; transition: 0.2s ease }`,
    `.opening-button::before, .opening-button::after { display: none }`,
    `.opening-button--filled { background-color: ${solid} !important; color: ${solidText} !important; border-color: ${solid} !important }`,
    `.opening-button--filled:hover { background-color: transparent !important; color: ${ink} !important; border-color: ${ink} !important }`,
    `.opening-button--outline { background-color: transparent !important; color: ${ink} !important; border-color: ${ink} !important }`,
    `.opening-button--outline:hover { background-color: ${ink} !important; color: ${on} !important }`,
    stack
      ? `.buttons { display: flex !important; flex-direction: column; align-items: stretch !important; gap: 12px }
         .buttons a { width: 100% !important; text-decoration: none !important; text-decoration-color: transparent !important }`
      : `.buttons { display: flex !important; justify-content: ${align} !important; align-items: center !important; gap: 12px }
         .buttons a { width: ${width} !important; text-decoration: none !important; text-decoration-color: transparent !important }
         @media (max-width: 768px) { .buttons { flex-direction: column; gap: 10px } .buttons a { width: 100% !important } }`,
  ].join("\n");
}

/** Text and buttons for copy that sits on the card color instead of the photo. */
const ON_CARD = { ink: CARD_TEXT, mark: CARD_TEXT };
const BUTTONS_ON_CARD = { ink: CARD_TEXT, on: CARD, solid: CARD_TEXT, solidText: CARD };

export const BOLD_OPENINGS: Snippet[] = [
  O.opening(
    "bold-impact",
    "Oversized uppercase name",
    box("hero-copy hero-copy--impact", O.PRE, O.TITLE, O.SUB, BUTTONS),
    O.centered("impact", "1160px"),
    boldText({ title: "clamp(64px, 9vw, 128px)", titleSm: "46px", gap: "24px" }),
    `.hero-title { line-height: 0.95 }`,
    boldButtons(),
  ),

  O.opening(
    "bold-block",
    "Solid color block",
    box("hero-copy hero-copy--block", box("hero-copy__block", O.PRE, O.TITLE, O.SUB, BUTTONS)),
    O.wide("block", "left"),
    `.hero-copy__block { max-width: 540px; padding: 52px 48px; background: ${CARD} }`,
    O.centerOnPhones("block", `.hero-copy__block { margin-inline: auto; padding: 40px 24px }`),
    boldText({ ...ON_CARD, title: "52px", titleSm: "36px" }),
    boldButtons({ ...BUTTONS_ON_CARD, stack: true }),
  ),

  O.opening(
    "bold-bar",
    "Thick bar on the left",
    box("hero-copy hero-copy--bar", box("hero-copy__body", O.PRE, O.TITLE, O.SUB, BUTTONS)),
    O.wide("bar", "left"),
    `.hero-copy__body { max-width: 820px; padding-left: 36px; border-left: 10px solid ${ACCENT} }`,
    O.centerOnPhones(
      "bar",
      `.hero-copy__body { margin-inline: auto; padding: 28px 0 0; border-left: 0; border-top: 10px solid ${ACCENT} }`,
    ),
    boldText({ title: "80px", titleSm: "42px", pre: "plain" }),
    boldButtons({ align: "flex-start" }),
  ),

  O.opening(
    "bold-highlight",
    "Highlighted name",
    box(
      "hero-copy hero-copy--highlight",
      O.PRE,
      `<h2 class="hero-title"><span>%NAME%</span></h2>`,
      O.SUB,
      BUTTONS,
    ),
    O.centered("highlight", "1000px"),
    boldText({ title: "76px", titleSm: "40px", gap: "24px", pre: "plain" }),
    `.hero-title { line-height: 1.3 }
     .hero-title span { padding: 0 0.2em; background: ${ACCENT}; -webkit-box-decoration-break: clone; box-decoration-break: clone }`,
    boldButtons({ solid: LIGHT, solidText: DARK }),
  ),

  O.opening(
    "bold-inverse",
    "Name with an inverted line",
    box(
      "hero-copy hero-copy--inverse",
      O.PRE,
      `<h2 class="hero-title"><span class="hero-title__first">%FIRST%</span> <span class="hero-title__last">Name</span></h2>`,
      O.SUB,
      BUTTONS,
    ),
    O.centered("inverse", "1160px"),
    boldText({ title: "clamp(72px, 9vw, 128px)", titleSm: "52px", gap: "28px" }),
    `.hero-title { line-height: 0.95 }
     .hero-title__first { display: block; margin-bottom: 0.08em }
     .hero-title__last { display: inline-block; padding: 0.04em 0.16em 0.06em; background: ${LIGHT}; color: ${DARK} }`,
    boldButtons(),
  ),

  O.opening(
    "bold-label",
    "Label strip and thick rule",
    box("hero-copy hero-copy--label", O.PRE, O.TITLE, O.SUB, BUTTONS),
    O.wide("label", "left"),
    `.hero-copy--label .hero-title { max-width: 820px }`,
    O.centerOnPhones("label", `.hero-title::after { margin-inline: auto }`),
    boldText({ title: "76px", titleSm: "40px", gap: "24px", pre: "plain" }),
    `.hero-pretitle { padding: 8px 16px; background: ${LIGHT}; color: ${DARK}; letter-spacing: 3px }
     .hero-title::after { content: ""; display: block; width: 96px; height: 8px; margin-top: 24px; background: ${ACCENT} }`,
    boldButtons({ align: "flex-start" }),
  ),

  O.opening(
    "bold-shadow",
    "Card with a hard shadow",
    box("hero-copy hero-copy--shadow", O.PRE, O.TITLE, O.SUB, BUTTONS),
    `.hero-copy--shadow { max-width: 720px; margin-inline: auto; padding: 52px 48px; background: ${CARD}; border: 3px solid ${CARD_TEXT}; box-shadow: 16px 16px 0 ${LIGHT}; text-align: center }
     @media (max-width: 768px) { .hero-copy--shadow { padding: 40px 20px; box-shadow: 10px 10px 0 ${LIGHT} } }`,
    boldText({ ...ON_CARD, title: "56px", titleSm: "36px" }),
    boldButtons(BUTTONS_ON_CARD),
  ),

  O.opening(
    "bold-split",
    "Name beside a color block",
    box(
      "hero-copy hero-copy--split",
      box("hero-copy__lead", O.PRE, O.TITLE),
      box("hero-copy__block", O.SUB, BUTTONS),
    ),
    `.hero-copy--split { display: grid; grid-template-columns: 1.3fr 1fr; align-items: center; gap: 56px; max-width: 1200px; margin-inline: auto; padding-inline: 20px; text-align: left }
     .hero-copy__block { padding: 44px 40px; background: ${CARD} }
     @media (max-width: 992px) { .hero-copy--split { grid-template-columns: 1fr; gap: 32px; text-align: center } .hero-copy__block { width: 100%; max-width: 480px; margin-inline: auto } }
     @media (max-width: 768px) { .hero-copy__block { padding: 32px 24px } }`,
    boldText({ title: "clamp(56px, 6.5vw, 88px)", titleSm: "44px", gap: "0", sub: false }),
    `.hero-subtitle { margin: 0 0 28px; color: ${CARD_TEXT}; font-size: 20px; font-weight: 700; line-height: 1.4; letter-spacing: 0.5px }`,
    boldButtons({ ...BUTTONS_ON_CARD, stack: true }),
  ),

  O.opening(
    "bold-band",
    "Solid full-width band",
    box("hero-copy hero-copy--band", box("hero-copy__lead", O.TITLE, O.SUB), BUTTONS),
    `.hero-copy--band { display: flex; align-items: center; justify-content: space-between; gap: 40px; width: 100vw; margin-left: calc(50% - 50vw); padding: 44px max(20px, calc(50vw - 580px)); background: ${DARK_BG}; border-top: 8px solid ${ACCENT}; text-align: left }
     @media (max-width: 992px) { .hero-copy--band { flex-direction: column; gap: 28px; padding: 40px 20px; text-align: center } }`,
    boldText({ pre: false, title: "52px", titleSm: "36px", gap: "8px" }),
    `.hero-subtitle { margin: 0 }`,
    boldButtons({ width: "220px" }),
    `.buttons { flex-shrink: 0 }
     @media (max-width: 992px) { .buttons { width: 100% } }`,
  ),

  O.opening(
    "bold-stats",
    "Copy over stat blocks",
    box("hero-copy hero-copy--stats", box("hero-copy__body", O.PRE, O.TITLE, O.SUB, BUTTONS), HERO_STATS),
    O.wide("stats", "left"),
    `.hero-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 52px 0 0; padding: 0; list-style: none }
     .hero-stats li { margin: 0; padding: 22px 24px; background: ${shade(0.7)}; border-top: 6px solid ${ACCENT} }
     .hero-stats strong { display: block; margin-bottom: 6px; color: ${LIGHT}; font-family: ${HEADING_FONT}; font-size: 44px; font-weight: 700; line-height: 1; letter-spacing: 0 }
     .hero-stats span { color: ${LIGHT}; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase }`,
    O.centerOnPhones(
      "stats",
      `.hero-stats { gap: 6px; margin-top: 36px } .hero-stats li { padding: 14px 4px } .hero-stats strong { font-size: 24px } .hero-stats span { font-size: 9px; letter-spacing: 0.5px }`,
    ),
    boldText({ title: "68px" }),
    boldButtons({ align: "flex-start" }),
  ),
];

// =====================================================================
// Profiles
// =====================================================================

const bold = (design: Omit<P.Design, "look">): Snippet => P.profile({ ...design, look: "bold" });

const PERSON = box(
  "profile__person",
  P.img("300x300"),
  box("profile__person-text", `<p class="profile__name">%NAME%</p>`, P.ROLE),
);

export const BOLD_PROFILES: Snippet[] = [
  bold({
    id: "bold-shadow",
    name: "Photo with a hard shadow",
    tone: "light",
    html: P.root("bold-shadow", P.inner(P.media(P.img()), P.content(P.PRE, P.HEAD, P.BIO, P.ACT))),
    css: `${P.COLS.css}
          .profile__media { margin: 0 20px 20px 0 }
          .profile__image { aspect-ratio: 4 / 5; box-shadow: 20px 20px 0 ${ACCENT} }`,
    responsive: P.twoCol({ tablet: `.profile__media { width: calc(100% - 20px) }` }).responsive,
  }),

  bold({
    id: "bold-bar",
    name: "Thick bar beside the copy, dark",
    tone: "dark",
    html: P.root("bold-bar", P.inner(P.media(P.img()), P.content(P.NAME, P.ROLE, P.BIO, P.INFO, P.ACT))),
    css: `${P.COLS_REVERSED.css}
          ${P.PORTRAIT}
          .profile__content { padding-left: 36px; border-left: 10px solid ${ACCENT} }
          .profile__info { font-weight: 700; letter-spacing: 1px }`,
    responsive: `${P.COLS_REVERSED.responsive}
          @media (max-width: 768px) { .profile__content { padding: 28px 0 0; border-left: 0; border-top: 10px solid ${ACCENT} } }`,
  }),

  bold({
    id: "bold-banner",
    name: "Giant name above the photo",
    tone: "dark",
    html: P.root(
      "bold-banner",
      P.inner(
        box("profile__header", P.PRE, P.NAME),
        box("profile__columns", P.media(P.img("1200x800")), P.content(P.ROLE, P.BIO, P.INFO, P.ACT)),
      ),
    ),
    css: `.profile__inner { max-width: 1200px; margin-inline: auto }
          .profile__header { margin-bottom: 44px; padding-bottom: 28px; border-bottom: 8px solid ${ACCENT} }
          .profile__title { margin: 0; font-size: clamp(64px, 9vw, 120px); line-height: 0.95 }
          .profile__columns { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); align-items: start; gap: 56px }
          .profile__image { aspect-ratio: 3 / 2 }
          .profile__info { font-weight: 700; letter-spacing: 1px }`,
    responsive: `@media (max-width: 992px) { .profile__columns { grid-template-columns: 1fr; gap: 32px } }
          @media (max-width: 768px) { .profile__header { margin-bottom: 32px; padding-bottom: 20px } }`,
  }),

  bold({
    id: "bold-block",
    name: "Half photo, half color block",
    tone: "card",
    pad: "0",
    padSm: "0",
    html: P.root("bold-block", P.inner(P.media(P.img("1000x1200")), P.content(P.PRE, P.HEAD, P.BIO, P.ACT))),
    css: P.HALF.css,
    responsive: P.HALF.responsive,
  }),

  bold({
    id: "bold-stats",
    name: "Stats in solid blocks",
    tone: "light",
    html: P.root("bold-stats", P.inner(P.media(P.img()), P.content(P.PRE, P.HEAD, P.BIO, P.STATS, P.ACT))),
    css: `${P.COLS.css}
          ${P.PORTRAIT}
          .profile__stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0 0 32px; padding: 0; list-style: none }
          .profile__stats li { margin: 0; padding: 22px 18px; background: ${DARK_BG}; color: ${LIGHT} }
          .profile__stats strong { display: block; margin-bottom: 6px; font-family: ${HEADING_FONT}; font-size: 36px; font-weight: 700; line-height: 1 }
          .profile__stats span { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase }`,
    responsive: `${P.COLS.responsive}
          @media (max-width: 768px) { .profile__stats { gap: 6px } .profile__stats li { padding: 16px 4px } .profile__stats strong { font-size: 24px } .profile__stats span { font-size: 9px; letter-spacing: 0.5px } }`,
  }),

  bold({
    id: "bold-points",
    name: "Numbered highlights",
    tone: "light",
    html: P.root("bold-points", P.inner(P.media(P.img()), P.content(P.PRE, P.HEAD, P.BIO, P.POINTS, P.ACT))),
    css: `${P.COLS_REVERSED.css}
          ${P.PORTRAIT}
          .profile__points { margin: 0 0 32px; padding: 0; border-bottom: 3px solid ${DARK}; color: ${DARK}; list-style: none; counter-reset: point }
          .profile__points li { display: flex; align-items: baseline; gap: 18px; margin: 0; padding: 14px 0; border-top: 3px solid ${DARK}; font-weight: 700; text-align: left; counter-increment: point }
          .profile__points li::before { content: counter(point, decimal-leading-zero); color: ${ACCENT}; font-family: ${HEADING_FONT}; font-size: 26px; line-height: 1 }`,
    responsive: P.COLS_REVERSED.responsive,
  }),

  bold({
    id: "bold-overlay",
    name: "Giant name over a photo",
    tone: "dark",
    pad: "0",
    padSm: "0",
    wrapper: "position: relative; overflow: hidden",
    html: P.root(
      "bold-overlay",
      P.media(P.img("1600x900")),
      P.inner(box("profile__lead", P.PRE, P.NAME), P.content(P.BIO, P.ACT)),
    ),
    css: `${P.backdrop(0.72)}
          .profile__inner { position: relative; display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); align-items: end; gap: 56px; max-width: 1240px; min-height: 660px; margin-inline: auto; padding: 120px 20px 80px }
          .profile__title { margin: 0; font-size: clamp(64px, 8vw, 112px); line-height: 0.95 }
          .profile__content { padding-top: 28px; border-top: 8px solid ${ACCENT} }`,
    responsive: `@media (max-width: 992px) { .profile__inner { grid-template-columns: 1fr; gap: 32px; min-height: 0; padding: 96px 20px 64px } }`,
  }),

  bold({
    id: "bold-card",
    name: "Card with a hard shadow",
    tone: "card",
    bg: LIGHT_BG,
    html: P.root(
      "bold-card",
      box("profile__card", P.img("800x800"), box("profile__card-body", P.NAME, P.ROLE, P.INFO, P.ACT)),
    ),
    css: `.profile__card { max-width: 440px; margin-inline: auto; background: ${CARD}; border: 3px solid ${DARK}; box-shadow: 16px 16px 0 ${DARK}; text-align: center }
          .profile__image { aspect-ratio: 1 / 1; border-bottom: 3px solid ${DARK} }
          .profile__card-body { padding: 36px 32px 40px }
          .profile__title { margin-bottom: 8px; font-size: 36px }
          .profile__info { font-weight: 700; letter-spacing: 1px }`,
    responsive: `@media (max-width: 768px) { .profile__card { width: calc(100% - 10px); box-shadow: 10px 10px 0 ${DARK} } .profile__card-body { padding: 28px 22px 32px } }`,
  }),

  bold({
    id: "bold-quote",
    name: "Loud quote",
    tone: "dark",
    html: P.root(
      "bold-quote",
      P.inner(
        `<p class="profile__quote">A short quote or personal motto goes here, in one or two lines.</p>`,
        box("profile__footer", PERSON, P.ACT),
      ),
    ),
    css: `.profile__inner { max-width: 1040px; margin-inline: auto }
          .profile__quote { margin: 0 0 48px; padding-left: 36px; border-left: 10px solid ${ACCENT}; color: ${LIGHT}; font-family: ${HEADING_FONT}; font-size: 50px; font-weight: 700; line-height: 1.1; text-align: left; text-transform: uppercase }
          .profile__footer { display: flex; align-items: center; justify-content: space-between; gap: 32px }
          .profile__person { display: flex; align-items: center; gap: 18px; text-align: left }
          .profile__image { width: 84px; height: 84px }
          .profile__name { margin: 0 0 2px; color: ${LIGHT}; font-size: 17px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase }
          .profile__role { margin: 0 }`,
    responsive: `@media (max-width: 768px) { .profile__quote { margin-bottom: 36px; padding-left: 20px; border-left-width: 6px; font-size: 28px } .profile__footer { flex-direction: column; gap: 28px } .profile__actions { width: 100% } }`,
  }),

  bold({
    id: "bold-strip",
    name: "Loud strip",
    tone: "dark",
    pad: "44px 20px",
    padSm: "44px 20px",
    wrapper: `border-top: 8px solid ${ACCENT}`,
    html: P.root("bold-strip", P.inner(P.img("400x400"), P.content(P.NAME, P.ROLE), P.ACT)),
    css: `.profile__inner { display: flex; align-items: center; gap: 36px; max-width: 1200px; margin-inline: auto }
          .profile__image { flex-shrink: 0; width: 140px; height: 140px }
          .profile__content { flex: 1 }
          .profile__title { margin-bottom: 8px; font-size: 48px }
          .profile__role { margin: 0 }`,
    responsive: `@media (max-width: 768px) { .profile__inner { flex-direction: column; gap: 22px } .profile__actions { width: 100% } }`,
  }),
];
