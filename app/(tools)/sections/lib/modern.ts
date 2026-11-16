// The modern set: frosted, rounded panels over the photo, a pill label, tight
// medium-weight headlines, and fully rounded buttons with one solid call to action.

import * as O from "./openings";
import * as P from "./profiles";
import {
  ACCENT,
  BODY_FONT,
  CARD,
  CARD_TEXT,
  DARK,
  HEADING_FONT,
  LIGHT,
  LIGHT_BG,
  LINE_ON_DARK,
  SOFT_ON_DARK,
  SOFT_ON_LIGHT,
  box,
  shade,
  tint,
  wrap,
  type Snippet,
} from "./shared";

// =====================================================================
// Headings
// =====================================================================

const BLUR = (px: number) => `-webkit-backdrop-filter: blur(${px}px); backdrop-filter: blur(${px}px)`;
/** A frosted panel: a light wash over the photo behind it. */
const GLASS = `background: ${tint(0.14)}; border: 1px solid ${LINE_ON_DARK}; ${BLUR(14)}`;

// The solid button comes first: it's the main call to action.
const BUTTONS = wrap(
  "div",
  "buttons",
  O.button("filled", "Find A Home", O.FIND),
  O.button("outline", "Sell A Home", O.SELL),
);
const ARROWS = wrap(
  "div",
  "buttons",
  O.button("arrow", "Find A Home", O.FIND),
  O.button("arrow", "Sell A Home", O.SELL),
);
const HERO_STATS = wrap(
  "ul",
  "hero-stats",
  `<li><strong>000+</strong><span>Homes Sold</span></li>`,
  `<li><strong>$000M</strong><span>Total Sales</span></li>`,
  `<li><strong>00</strong><span>Years Experience</span></li>`,
);

type ModText = {
  title?: string | false;
  titleSm?: string;
  gap?: string;
  /** "chip" puts the brokerage name in a frosted pill; "plain" leaves it as small caps. */
  pre?: "chip" | "plain" | false;
  sub?: boolean;
};

function modText(options: ModText = {}): string {
  const { title = "64px", titleSm = "36px", gap = "18px", pre = "chip", sub = true } = options;
  const rules: string[] = [];
  if (pre === "chip") {
    rules.push(
      `.hero-pretitle { display: inline-block; margin-bottom: 14px; padding: 8px 18px; ${GLASS}; border-radius: 999px; color: ${LIGHT}; font-family: ${BODY_FONT}; font-size: 12px; font-weight: 600; line-height: 1.4; letter-spacing: 2px; text-transform: uppercase }`,
    );
  } else if (pre) {
    rules.push(
      `.hero-pretitle { display: block; margin-bottom: 14px; color: ${LIGHT}; font-family: ${BODY_FONT}; font-size: 13px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; opacity: 0.9 }`,
    );
  }
  if (title) {
    rules.push(
      `.hero-title { color: ${LIGHT}; font-size: ${title}; font-weight: 600 !important; line-height: 1.05; letter-spacing: -1px; margin: 0 0 ${gap} }`,
    );
  }
  if (sub) {
    rules.push(
      `.hero-subtitle { color: ${LIGHT}; margin: 0 0 32px; font-size: 18px; line-height: 1.6; letter-spacing: 0; opacity: 0.9 }`,
    );
  }
  const small = [
    pre && `.hero-pretitle { font-size: 11px; letter-spacing: 1.5px }`,
    title && `.hero-title { font-size: ${titleSm}; letter-spacing: -0.5px }`,
    sub && `.hero-subtitle { font-size: 16px }`,
  ].filter(Boolean);
  if (small.length) rules.push(`@media (max-width: 768px) { ${small.join(" ")} }`);
  return rules.join("\n");
}

function modButtons(options: { align?: "center" | "flex-start"; stack?: boolean; width?: string } = {}): string {
  const { align = "center", stack = false, width = "220px" } = options;
  return [
    `/* Buttons */`,
    `.opening-button { padding: 15px 28px; margin: 0 !important; border: 2px solid ${LIGHT}; border-radius: 999px; font-weight: 600 !important; letter-spacing: 1.5px; transition: 0.3s ease }`,
    `.opening-button::before, .opening-button::after { display: none }`,
    `.opening-button--filled { background-color: ${ACCENT} !important; color: ${LIGHT} !important; border-color: ${ACCENT} !important }`,
    `.opening-button--outline { background-color: ${tint(0.14)} !important; color: ${LIGHT} !important; border-color: ${LINE_ON_DARK} !important; ${BLUR(10)} }`,
    `.opening-button--filled:hover, .opening-button--outline:hover { background-color: ${LIGHT} !important; color: ${DARK} !important; border-color: ${LIGHT} !important }`,
    stack
      ? `.buttons { display: flex !important; flex-direction: column; align-items: stretch !important; gap: 12px }
         .buttons a { width: 100% !important; text-decoration: none !important; text-decoration-color: transparent !important }`
      : `.buttons { display: flex !important; justify-content: ${align} !important; align-items: center !important; gap: 12px }
         .buttons a { width: ${width} !important; text-decoration: none !important; text-decoration-color: transparent !important }
         @media (max-width: 768px) { .buttons { flex-direction: column; gap: 10px } .buttons a { width: 100% !important } }`,
  ].join("\n");
}

/** Text links that each end in a circled arrow. */
const ARROW_LINKS = `/* Buttons */
  .opening-button--arrow { min-width: 0; margin: 0 !important; padding: 0; background-color: transparent !important; border: 0 !important; color: ${LIGHT} !important; font-weight: 600 !important; letter-spacing: 1.5px }
  .opening-button--arrow::before, .opening-button--arrow::after { display: none }
  .opening-button--arrow .lp-btn__content { display: inline-flex; align-items: center; gap: 14px }
  .opening-button--arrow .lp-btn__content::after { content: "→"; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 1px solid ${LIGHT}; border-radius: 50%; font-size: 18px; letter-spacing: 0; transition: 0.3s ease }
  .opening-button--arrow:hover .lp-btn__content::after { background: ${LIGHT}; color: ${DARK}; transform: translateX(4px) }
  .buttons { display: flex !important; flex-wrap: wrap; justify-content: flex-start !important; gap: 16px 40px }
  .buttons a { text-decoration: none !important; text-decoration-color: transparent !important }
  @media (max-width: 768px) { .buttons { justify-content: center !important } }`;

const tile = (label: string, href: string) => O.button("tile", label, href);

export const MODERN_OPENINGS: Snippet[] = [
  O.opening(
    "mod-chip",
    "Pill label and rounded buttons",
    box("hero-copy hero-copy--chip", O.PRE, O.TITLE, O.SUB, BUTTONS),
    O.centered("chip", "860px"),
    modText(),
    modButtons(),
  ),

  O.opening(
    "mod-lead",
    "Large and left-aligned",
    box("hero-copy hero-copy--lead", O.PRE, O.TITLE, O.SUB, BUTTONS),
    O.wide("lead", "left"),
    `.hero-copy--lead .hero-title { max-width: 820px }
     .hero-copy--lead .hero-subtitle { max-width: 520px }`,
    O.centerOnPhones("lead", `.hero-copy--lead .hero-subtitle { margin-inline: auto }`),
    modText({ title: "clamp(56px, 6.5vw, 88px)", titleSm: "40px", gap: "20px" }),
    modButtons({ align: "flex-start" }),
  ),

  O.opening(
    "mod-glass",
    "Rounded glass card",
    box("hero-copy hero-copy--glass-card", O.PRE, O.TITLE, O.SUB, BUTTONS),
    `.hero-copy--glass-card { max-width: 720px; margin-inline: auto; padding: 56px 48px; ${GLASS}; border-radius: 32px; text-align: center }
     @media (max-width: 768px) { .hero-copy--glass-card { padding: 40px 22px; border-radius: 24px } }`,
    modText({ title: "52px", titleSm: "34px", pre: "plain" }),
    modButtons(),
  ),

  O.opening(
    "mod-side",
    "Dark rounded panel on the left",
    box("hero-copy hero-copy--side", box("hero-copy__panel", O.PRE, O.TITLE, O.SUB, BUTTONS)),
    O.wide("side", "left"),
    `.hero-copy__panel { max-width: 460px; padding: 44px 40px; background: ${shade(0.55)}; border: 1px solid ${LINE_ON_DARK}; border-radius: 28px; ${BLUR(14)} }`,
    O.centerOnPhones("side", `.hero-copy__panel { margin-inline: auto; padding: 36px 22px }`),
    modText({ title: "44px", titleSm: "32px", gap: "14px" }),
    modButtons({ stack: true }),
  ),

  O.opening(
    "mod-tiles",
    "Copy beside two action tiles",
    box(
      "hero-copy hero-copy--tiles",
      box("hero-copy__lead", O.PRE, O.TITLE, O.SUB),
      wrap("div", "buttons", tile("Find A Home", O.FIND), tile("Sell A Home", O.SELL)),
    ),
    `.hero-copy--tiles { display: grid; grid-template-columns: 1.3fr 1fr; align-items: center; gap: 56px; max-width: 1200px; margin-inline: auto; padding-inline: 20px; text-align: left }
     @media (max-width: 992px) { .hero-copy--tiles { grid-template-columns: 1fr; gap: 28px; text-align: center } }`,
    modText({ title: "60px" }),
    `.hero-subtitle { margin: 0 }`,
    `/* Buttons */
     .opening-button--tile { display: block; width: 100% !important; margin: 0 !important; padding: 24px 24px 24px 28px; background: ${tint(0.14)} !important; border: 1px solid ${LINE_ON_DARK} !important; border-radius: 22px; ${BLUR(14)}; color: ${LIGHT} !important; font-size: 15px; font-weight: 600 !important; letter-spacing: 1.5px; text-align: left; text-decoration: none !important; transition: 0.3s ease }
     .opening-button--tile::before, .opening-button--tile::after { display: none }
     .opening-button--tile .lp-btn__content { display: flex; align-items: center; justify-content: space-between; gap: 20px }
     .opening-button--tile .lp-btn__content::after { content: "→"; display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; width: 44px; height: 44px; background: ${LIGHT}; border-radius: 50%; color: ${DARK}; font-size: 18px; letter-spacing: 0; transition: 0.3s ease }
     .opening-button--tile:hover { background: ${LIGHT} !important; border-color: ${LIGHT} !important; color: ${DARK} !important }
     .opening-button--tile:hover .lp-btn__content::after { background: ${ACCENT}; color: ${LIGHT} }
     .buttons { display: flex !important; flex-direction: column; gap: 14px }
     @media (max-width: 992px) { .buttons { width: 100%; max-width: 440px; margin-inline: auto } }`,
  ),

  O.opening(
    "mod-stats",
    "Copy over stat chips",
    box("hero-copy hero-copy--stats", O.PRE, O.TITLE, O.SUB, BUTTONS, HERO_STATS),
    O.centered("stats", "900px"),
    modText({ title: "58px" }),
    `.hero-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; max-width: 700px; margin: 44px auto 0; padding: 0; list-style: none }
     .hero-stats li { margin: 0; padding: 20px 14px; ${GLASS}; border-radius: 20px }
     .hero-stats strong { display: block; color: ${LIGHT}; font-family: ${HEADING_FONT}; font-size: 30px; font-weight: 600; line-height: 1.1; letter-spacing: 0 }
     .hero-stats span { color: ${LIGHT}; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; opacity: 0.85 }
     @media (max-width: 768px) { .hero-stats { gap: 8px; margin-top: 32px } .hero-stats li { padding: 14px 4px; border-radius: 16px } .hero-stats strong { font-size: 20px } .hero-stats span { font-size: 9px; letter-spacing: 0.5px } }`,
    modButtons(),
  ),

  O.opening(
    "mod-dock",
    "Floating bar",
    box("hero-copy hero-copy--dock", box("hero-copy__lead", O.TITLE, O.SUB), BUTTONS),
    `.hero-copy--dock { display: flex; align-items: center; justify-content: space-between; gap: 32px; max-width: 1160px; margin-inline: auto; padding: 24px 28px 24px 44px; background: ${shade(0.55)}; border: 1px solid ${LINE_ON_DARK}; border-radius: 999px; ${BLUR(14)}; text-align: left }
     @media (max-width: 992px) { .hero-copy--dock { flex-direction: column; gap: 24px; max-width: 520px; padding: 36px 24px; border-radius: 28px; text-align: center } }`,
    modText({ pre: false, title: "34px", titleSm: "28px", gap: "4px" }),
    `.hero-subtitle { margin: 0; font-size: 15px }`,
    modButtons({ width: "190px" }),
    `.buttons { flex-shrink: 0 }
     @media (max-width: 992px) { .buttons { width: 100% } }`,
  ),

  O.opening(
    "mod-tags",
    "Service areas as tags",
    box(
      "hero-copy hero-copy--tags",
      O.PRE,
      O.TITLE,
      O.SUB,
      wrap("ul", "hero-tags", `<li>Neighborhood One</li>`, `<li>Neighborhood Two</li>`, `<li>Neighborhood Three</li>`),
      BUTTONS,
    ),
    O.centered("tags", "860px"),
    modText({ title: "60px", pre: "plain" }),
    `.hero-subtitle { margin-bottom: 22px }
     .hero-tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin: 0 0 34px; padding: 0; list-style: none }
     .hero-tags li { margin: 0; padding: 7px 18px; ${GLASS}; border-radius: 999px; color: ${LIGHT}; font-size: 13px; letter-spacing: 0.5px }`,
    modButtons(),
  ),

  O.opening(
    "mod-arrows",
    "Details line and arrow links",
    box(
      "hero-copy hero-copy--arrows",
      `<p class="hero-meta"><span>Brokerage Name</span><span>City, State</span><span>Est. 0000</span></p>`,
      O.TITLE,
      O.SUB,
      ARROWS,
    ),
    O.wide("arrows", "left"),
    `.hero-meta { display: flex; flex-wrap: wrap; align-items: center; margin: 0 0 18px; color: ${LIGHT}; font-size: 13px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase }
     .hero-meta span { display: inline-flex; align-items: center }
     .hero-meta span + span::before { content: ""; width: 5px; height: 5px; margin-inline: 14px; background: ${LIGHT}; border-radius: 50%; opacity: 0.7 }
     .hero-copy--arrows .hero-subtitle { max-width: 520px; margin-bottom: 36px }`,
    O.centerOnPhones(
      "arrows",
      `.hero-meta { justify-content: center; font-size: 11px; letter-spacing: 1px } .hero-meta span + span::before { margin-inline: 9px } .hero-copy--arrows .hero-subtitle { margin-inline: auto }`,
    ),
    modText({ pre: false, title: "clamp(52px, 6vw, 80px)", titleSm: "38px", gap: "20px" }),
    ARROW_LINKS,
  ),

  O.opening(
    "mod-logo",
    "Logo in a rounded tile",
    box("hero-copy hero-copy--logo-tile", O.logo("300x300"), O.TITLE, O.SUB, BUTTONS),
    O.centered("logo-tile", "820px"),
    `.agent-logo { display: block; width: 116px; height: 116px; margin: 0 auto 28px; padding: 16px; ${GLASS}; border-radius: 30px; object-fit: contain }
     @media (max-width: 768px) { .agent-logo { width: 96px; height: 96px; border-radius: 24px } }`,
    modText({ pre: false, title: "56px" }),
    modButtons(),
  ),
];

// =====================================================================
// Profiles
// =====================================================================

const mod = (design: Omit<P.Design, "look">): Snippet => P.profile({ ...design, look: "modern" });

const ROUNDED = `.profile__image { aspect-ratio: 4 / 5; border-radius: 28px }`;

/** Contact details as a row of pills. */
const infoPills = (line: string, align: "center" | "flex-start") =>
  `.profile__info { display: flex; flex-wrap: wrap; justify-content: ${align}; gap: 10px }
   .profile__info li { margin: 0; padding: 8px 18px; border: 1px solid ${line}; border-radius: 999px; font-size: 14px }`;
const CENTER_INFO_ON_PHONES = `@media (max-width: 768px) { .profile__info { justify-content: center } }`;

const statTiles = (fill: string) =>
  `.profile__stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 0 0 32px; padding: 0; list-style: none }
   .profile__stats li { margin: 0; padding: 20px 18px; background: ${fill}; border-radius: 18px }
   .profile__stats strong { display: block; margin-bottom: 4px; color: ${ACCENT}; font-family: ${HEADING_FONT}; font-size: 30px; font-weight: 600; line-height: 1.1 }
   .profile__stats span { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.75 }`;
const STAT_TILES_ON_PHONES = `@media (max-width: 768px) { .profile__stats { gap: 8px } .profile__stats li { padding: 14px 4px } .profile__stats strong { font-size: 22px } .profile__stats span { font-size: 9px; letter-spacing: 0.5px } }`;

export const MODERN_PROFILES: Snippet[] = [
  mod({
    id: "mod-rounded",
    name: "Rounded photo, light",
    tone: "light",
    html: P.root("mod-rounded", P.inner(P.media(P.img()), P.content(P.PRE, P.HEAD, P.BIO, P.ACT))),
    css: `${P.COLS.css}\n${ROUNDED}`,
    responsive: P.COLS.responsive,
  }),

  mod({
    id: "mod-rounded-dark",
    name: "Rounded photo right, dark",
    tone: "dark",
    html: P.root(
      "mod-rounded-dark",
      P.inner(P.media(P.img()), P.content(P.NAME, P.ROLE, P.BIO, P.INFO, P.ACT)),
    ),
    css: `${P.COLS_REVERSED.css}
          ${ROUNDED}
          ${infoPills(LINE_ON_DARK, "flex-start")}`,
    responsive: `${P.COLS_REVERSED.responsive}
          ${CENTER_INFO_ON_PHONES}`,
  }),

  mod({
    id: "mod-card",
    name: "Floating rounded card",
    tone: "card",
    bg: LIGHT_BG,
    html: P.root("mod-card", P.inner(P.media(P.img("800x900")), P.content(P.PRE, P.HEAD, P.BIO, P.ACT))),
    css: `.profile__inner { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 6fr); align-items: center; gap: 56px; max-width: 1100px; margin-inline: auto; padding: 28px; background: ${CARD}; border-radius: 36px; box-shadow: 0 30px 80px ${shade(0.18)} }
          .profile__image { aspect-ratio: 8 / 9; border-radius: 24px }
          .profile__content { padding: 20px 28px 20px 0 }`,
    responsive: `@media (max-width: 992px) { .profile__inner { grid-template-columns: 1fr; gap: 28px } .profile__content { padding: 0 12px 20px } }
          @media (max-width: 768px) { .profile__inner { padding: 16px; border-radius: 28px } .profile__image { border-radius: 18px } }`,
  }),

  mod({
    id: "mod-stats",
    name: "Photo with stat tiles",
    tone: "light",
    html: P.root("mod-stats", P.inner(P.media(P.img()), P.content(P.PRE, P.HEAD, P.BIO, P.STATS, P.ACT))),
    css: `${P.COLS.css}
          ${ROUNDED}
          ${statTiles(SOFT_ON_LIGHT)}`,
    responsive: `${P.COLS.responsive}
          ${STAT_TILES_ON_PHONES}`,
  }),

  mod({
    id: "mod-badge",
    name: "Photo with a floating badge",
    tone: "light",
    html: P.root(
      "mod-badge",
      P.inner(
        P.media(P.img(), `<p class="profile__badge"><strong>00+</strong><span>Years Experience</span></p>`),
        P.content(P.PRE, P.HEAD, P.BIO, P.ACT),
      ),
    ),
    css: `${P.COLS.css}
          .profile__media { position: relative }
          ${ROUNDED}
          .profile__badge { position: absolute; right: -28px; bottom: 40px; margin: 0; padding: 18px 26px; background: ${CARD}; border-radius: 22px; box-shadow: 0 18px 44px ${shade(0.28)}; color: ${CARD_TEXT}; text-align: left }
          .profile__badge strong { display: block; font-family: ${HEADING_FONT}; font-size: 32px; font-weight: 600; line-height: 1.1 }
          .profile__badge span { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase }`,
    responsive: `${P.COLS.responsive}
          @media (max-width: 992px) { .profile__badge { right: 16px; bottom: 16px } }`,
  }),

  mod({
    id: "mod-center",
    name: "Soft-cornered portrait, centered",
    tone: "light",
    html: P.root("mod-center", P.inner(P.img("600x600"), P.NAME, P.ROLE, P.BIO, P.INFO, P.ACT)),
    css: `.profile__inner { max-width: 720px; margin-inline: auto; text-align: center }
          .profile__image { width: 200px; height: 200px; margin: 0 auto 32px; border-radius: 48px }
          ${infoPills("var(--border-dark-inactive)", "center")}`,
    responsive: `@media (max-width: 768px) { .profile__image { width: 160px; height: 160px; border-radius: 40px } }`,
  }),

  mod({
    id: "mod-bento",
    name: "Tile grid, dark",
    tone: "dark",
    html: P.root(
      "mod-bento",
      P.inner(P.media(P.img("1000x1200")), P.content(P.PRE, P.HEAD, P.BIO, P.ACT), P.STATS),
    ),
    css: `.profile__inner { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 16px; max-width: 1200px; margin-inline: auto }
          .profile__media { position: relative; grid-row: 1 / 3; min-height: 540px }
          .profile__image { position: absolute; inset: 0; height: 100%; border-radius: 28px }
          .profile__content { padding: 52px 48px; background: ${SOFT_ON_DARK}; border-radius: 28px }
          .profile__stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 0; padding: 0; list-style: none }
          .profile__stats li { margin: 0; padding: 26px 24px; background: ${SOFT_ON_DARK}; border-radius: 28px }
          .profile__stats strong { display: block; margin-bottom: 4px; color: ${LIGHT}; font-family: ${HEADING_FONT}; font-size: 34px; font-weight: 600; line-height: 1.1 }
          .profile__stats span { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.75 }`,
    responsive: `@media (max-width: 992px) { .profile__inner { grid-template-columns: 1fr } .profile__media { grid-row: auto; min-height: 0 } .profile__image { position: static; height: auto; aspect-ratio: 4 / 3 } }
          @media (max-width: 768px) { .profile__inner { gap: 10px } .profile__content { padding: 36px 22px } .profile__stats { gap: 10px } .profile__stats li { padding: 18px 4px; border-radius: 20px } .profile__stats strong { font-size: 22px } .profile__stats span { font-size: 9px; letter-spacing: 0.5px } }`,
  }),

  mod({
    id: "mod-shape",
    name: "Soft shape behind the photo",
    tone: "light",
    html: P.root("mod-shape", P.inner(P.media(P.img()), P.content(P.PRE, P.HEAD, P.BIO, P.ACT))),
    css: `${P.COLS.css}
          .profile__media { position: relative; margin: 0 28px 28px 0 }
          .profile__media::before { content: ""; position: absolute; inset: 28px -28px -28px 28px; background: ${ACCENT}; border-radius: 36px; opacity: 0.22 }
          .profile__image { position: relative; aspect-ratio: 4 / 5; border-radius: 28px }`,
    responsive: P.twoCol({ tablet: `.profile__media { width: calc(100% - 28px) }` }).responsive,
  }),

  mod({
    id: "mod-banner",
    name: "Rounded banner",
    tone: "card",
    bg: LIGHT_BG,
    pad: "56px 20px",
    padSm: "48px 20px",
    html: P.root("mod-banner", P.inner(P.img("300x300"), P.content(P.NAME, P.ROLE), P.ACT)),
    css: `.profile__inner { display: flex; align-items: center; gap: 28px; max-width: 1100px; margin-inline: auto; padding: 24px 36px 24px 24px; background: ${CARD}; border-radius: 999px; box-shadow: 0 20px 50px ${shade(0.16)} }
          .profile__image { flex-shrink: 0; width: 108px; height: 108px; border-radius: 50% }
          .profile__content { flex: 1 }
          .profile__title { margin-bottom: 2px; font-size: 30px }
          .profile__role { margin: 0 }`,
    responsive: `@media (max-width: 768px) { .profile__inner { flex-direction: column; gap: 18px; padding: 32px 24px; border-radius: 32px } .profile__actions { width: 100% } }`,
  }),

  mod({
    id: "mod-half",
    name: "Half-screen photo, rounded corners",
    tone: "light",
    pad: "0",
    padSm: "0",
    html: P.root("mod-half", P.inner(P.media(P.img("1000x1200")), P.content(P.PRE, P.HEAD, P.BIO, P.STATS, P.ACT))),
    css: `${P.HALF.css}
          .profile__image { border-radius: 0 48px 48px 0 }
          ${statTiles(SOFT_ON_LIGHT)}`,
    responsive: `${P.HALF.responsive}
          @media (max-width: 992px) { .profile__image { border-radius: 0 0 32px 32px } }
          ${STAT_TILES_ON_PHONES}`,
  }),
];
