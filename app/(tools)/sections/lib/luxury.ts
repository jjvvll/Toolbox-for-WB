// The luxury set: the same two kinds of section, styled for high-end listings.
// Light type with wide letter-spacing, italic serif taglines, hairline rules and
// frames, small ornaments in the button color, and thin, slow-fading buttons.

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
  LINE_ON_LIGHT,
  box,
  shade,
  wrap,
  type Snippet,
} from "./shared";

// =====================================================================
// Openings
// =====================================================================

const DIAMOND = `<div class="hero-divider"><span></span></div>`;
const DIAMOND_CSS = `.hero-divider { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 0 0 26px }
  .hero-divider::before, .hero-divider::after { content: ""; width: 72px; height: 1px; background: ${LIGHT} }
  .hero-divider span { width: 7px; height: 7px; background: ${ACCENT}; transform: rotate(45deg) }`;

const BUTTONS = wrap(
  "div",
  "buttons",
  O.button("outline", "Find A Home", O.FIND),
  O.button("filled", "Sell A Home", O.SELL),
);
const LINKS = wrap(
  "div",
  "buttons",
  O.button("line", "Find A Home", O.FIND),
  O.button("line", "Sell A Home", O.SELL),
);

type LuxText = { title?: string | false; titleSm?: string; gap?: string; pre?: boolean; sub?: boolean };

function luxText(options: LuxText = {}): string {
  const { title = "58px", titleSm = "32px", gap = "22px", pre = true, sub = true } = options;
  const rules: string[] = [];
  if (pre) {
    rules.push(
      `.hero-pretitle { display: block; color: ${LIGHT}; font-family: ${BODY_FONT}; font-size: 11px; letter-spacing: 7px; text-transform: uppercase; margin-bottom: 18px }`,
    );
  }
  if (title) {
    rules.push(
      `.hero-title { color: ${LIGHT}; font-size: ${title}; font-weight: 300 !important; line-height: 1.1; letter-spacing: 6px; margin: 0 0 ${gap} }`,
    );
  }
  if (sub) {
    rules.push(
      `.hero-subtitle { color: ${LIGHT}; margin: 0 0 34px; font-family: ${HEADING_FONT}; font-size: 22px; font-style: italic; line-height: 1.5; letter-spacing: 1px }`,
    );
  }
  const small = [
    pre && `.hero-pretitle { font-size: 10px; letter-spacing: 5px }`,
    title && `.hero-title { font-size: ${titleSm}; letter-spacing: 3px }`,
    sub && `.hero-subtitle { font-size: 18px }`,
  ].filter(Boolean);
  if (small.length) rules.push(`@media (max-width: 768px) { ${small.join(" ")} }`);
  return rules.join("\n");
}

function luxButtons(options: { align?: "center" | "flex-start"; stack?: boolean } = {}): string {
  const { align = "center", stack = false } = options;
  return [
    `/* Buttons */`,
    `.opening-button { padding: 16px 30px; margin-inline: ${stack ? "0" : "8px"} !important; border: 1px solid ${LIGHT}; font-size: 12px; font-weight: 500 !important; letter-spacing: 4px; transition: 0.5s ease }`,
    `.opening-button::before, .opening-button::after { display: none }`,
    `.opening-button--outline { background-color: transparent !important; color: ${LIGHT} !important; border-color: ${LIGHT} !important }`,
    `.opening-button--outline:hover { background-color: ${LIGHT} !important; color: ${DARK} !important }`,
    `.opening-button--filled { background-color: ${LIGHT} !important; color: ${DARK} !important; border-color: ${LIGHT} !important }`,
    `.opening-button--filled:hover { background-color: transparent !important; color: ${LIGHT} !important }`,
    stack
      ? `.buttons { display: flex !important; flex-direction: column; align-items: stretch !important; gap: 14px }
         .buttons a { width: 100% !important; text-decoration: none !important; text-decoration-color: transparent !important }`
      : `.buttons { display: flex !important; justify-content: ${align} !important; align-items: center !important }
         .buttons a { width: 220px !important; text-decoration: none !important; text-decoration-color: transparent !important }
         @media (max-width: 768px) { .buttons { flex-direction: column; gap: 12px } .buttons a { width: 100% !important; margin-inline: 0 !important } }`,
  ].join("\n");
}

/** Text links, each followed by a short rule that lengthens on hover. */
function luxLinks(align: "center" | "flex-start" | "flex-end" = "flex-start"): string {
  return `/* Buttons */
    .opening-button--line { min-width: 0; margin: 0 !important; padding: 6px 0; background-color: transparent !important; border: 0 !important; color: ${LIGHT} !important; font-size: 12px; font-weight: 500 !important; letter-spacing: 4px; transition: 0.5s ease }
    .opening-button--line::before, .opening-button--line::after { display: none }
    .opening-button--line .lp-btn__content { display: inline-flex; align-items: center; gap: 14px }
    .opening-button--line .lp-btn__content::after { content: ""; width: 36px; height: 1px; background: ${ACCENT}; transition: width 0.5s ease }
    .opening-button--line:hover .lp-btn__content::after { width: 64px }
    .buttons { display: flex !important; flex-wrap: wrap; justify-content: ${align} !important; gap: 16px 44px }
    .buttons a { text-decoration: none !important; text-decoration-color: transparent !important }
    @media (max-width: 768px) { .buttons { justify-content: center !important } }`;
}

export const LUXURY_OPENINGS: Snippet[] = [
  O.opening(
    "lux-diamond",
    "Diamond divider",
    box("hero-copy hero-copy--diamond", O.PRE, O.TITLE, DIAMOND, O.SUB, BUTTONS),
    O.centered("diamond", "880px"),
    luxText({ gap: "26px" }),
    DIAMOND_CSS,
    luxButtons(),
  ),

  O.opening(
    "lux-crest",
    "Ringed crest",
    box("hero-copy hero-copy--crest", O.logo("300x300"), O.PRE, O.TITLE, O.SUB, BUTTONS),
    O.centered("crest", "880px"),
    `.agent-logo { display: block; width: 124px; height: 124px; margin: 0 auto 34px; padding: 6px; border: 1px solid ${ACCENT}; border-radius: 50%; outline: 1px solid ${LIGHT}; outline-offset: 7px; object-fit: cover }
     @media (max-width: 768px) { .agent-logo { width: 100px; height: 100px } }`,
    luxText({ title: "52px" }),
    luxButtons(),
  ),

  O.opening(
    "lux-editorial",
    "Editorial with side rule",
    box(
      "hero-copy hero-copy--editorial",
      box(
        "hero-copy__body",
        O.SUB,
        O.TITLE,
        `<p class="hero-meta">Brokerage Name <span></span> Est. 0000</p>`,
        LINKS,
      ),
    ),
    O.wide("editorial", "left"),
    `.hero-copy__body { max-width: 720px; padding-left: 44px; border-left: 1px solid ${ACCENT} }`,
    O.centerOnPhones(
      "editorial",
      `.hero-copy__body { margin-inline: auto; padding: 28px 0 0; border-left: 0; border-top: 1px solid ${ACCENT} }`,
    ),
    luxText({ pre: false, title: "72px", titleSm: "36px", gap: "24px" }),
    `.hero-subtitle { margin-bottom: 14px }
     .hero-meta { display: flex; align-items: center; gap: 16px; margin: 0 0 38px; color: ${LIGHT}; font-size: 11px; letter-spacing: 6px; text-transform: uppercase }
     .hero-meta span { width: 28px; height: 1px; background: ${LIGHT} }
     @media (max-width: 768px) { .hero-meta { justify-content: center; gap: 10px; font-size: 10px; letter-spacing: 3px } .hero-meta span { width: 16px } }`,
    luxLinks(),
  ),

  O.opening(
    "lux-notch",
    "Frame with a title notch",
    box(
      "hero-copy hero-copy--notch",
      `<div class="hero-notch"><span class="hero-pretitle">Brokerage Name</span></div>`,
      box("hero-copy__body", O.TITLE, O.SUB, BUTTONS),
    ),
    `.hero-copy--notch { max-width: 820px; margin-inline: auto; border: 1px solid ${LIGHT}; border-top: 0; text-align: center }
     .hero-notch { display: flex; align-items: center; gap: 22px; transform: translateY(-50%) }
     .hero-notch::before, .hero-notch::after { content: ""; flex: 1; height: 1px; background: ${LIGHT} }
     .hero-copy__body { padding: 30px 56px 62px }
     @media (max-width: 768px) { .hero-notch { gap: 12px } .hero-copy__body { padding: 20px 20px 44px } }`,
    luxText(),
    `.hero-notch .hero-pretitle { margin: 0; white-space: nowrap }`,
    luxButtons(),
  ),

  O.opening(
    "lux-pillars",
    "Between two pillars",
    box("hero-copy hero-copy--pillars", O.PRE, O.TITLE, O.SUB, BUTTONS),
    `.hero-copy--pillars { position: relative; max-width: 820px; margin-inline: auto; padding: 34px 60px; border-inline: 1px solid ${LIGHT}; text-align: center }
     .hero-copy--pillars::before, .hero-copy--pillars::after { content: ""; position: absolute; top: 50%; width: 9px; height: 9px; background: ${ACCENT}; transform: translateY(-50%) rotate(45deg) }
     .hero-copy--pillars::before { left: -5px }
     .hero-copy--pillars::after { right: -5px }
     @media (max-width: 768px) { .hero-copy--pillars { padding: 28px 20px } }`,
    luxText(),
    luxButtons(),
  ),

  O.opening(
    "lux-rules",
    "Name between gold rules",
    box("hero-copy hero-copy--rules", O.PRE, O.TITLE, O.SUB, BUTTONS),
    O.centered("rules", "880px"),
    luxText({ title: "62px", gap: "28px" }),
    `.hero-title { display: inline-block; padding: 28px 44px; border-block: 1px solid ${ACCENT} }
     @media (max-width: 768px) { .hero-title { padding: 22px 12px } }`,
    luxButtons(),
  ),

  O.opening(
    "lux-credentials",
    "Name with specialties",
    box(
      "hero-copy hero-copy--credentials",
      O.PRE,
      O.TITLE,
      O.SUB,
      wrap("ul", "hero-tags", `<li>Luxury Estates</li>`, `<li>Waterfront</li>`, `<li>New Developments</li>`),
      BUTTONS,
    ),
    O.centered("credentials", "920px"),
    luxText({ gap: "18px" }),
    `.hero-subtitle { margin-bottom: 26px }
     .hero-tags { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 0; margin: 0 0 38px; padding: 18px 0; border-block: 1px solid ${LINE_ON_DARK}; color: ${LIGHT}; font-size: 11px; letter-spacing: 5px; text-transform: uppercase; list-style: none }
     .hero-tags li { display: flex; align-items: center; margin: 0 }
     .hero-tags li + li::before { content: ""; width: 5px; height: 5px; margin-inline: 22px; background: ${ACCENT}; transform: rotate(45deg) }
     @media (max-width: 768px) { .hero-tags { flex-direction: column; align-items: center; font-size: 10px; letter-spacing: 4px } .hero-tags li + li::before { display: none } }`,
    luxButtons(),
  ),

  O.opening(
    "lux-ledger",
    "Copy over a stats ledger",
    box(
      "hero-copy hero-copy--ledger",
      box("hero-copy__body", O.PRE, O.TITLE, O.SUB, BUTTONS),
      wrap(
        "ul",
        "hero-stats",
        `<li><strong>$000M</strong><span>Total Sales</span></li>`,
        `<li><strong>000+</strong><span>Homes Sold</span></li>`,
        `<li><strong>00</strong><span>Years Experience</span></li>`,
      ),
    ),
    O.wide("ledger", "left"),
    `.hero-stats { display: grid; grid-template-columns: repeat(3, 1fr); margin: 52px 0 0; padding: 0; border-top: 1px solid ${LIGHT}; list-style: none }
     .hero-stats li { margin: 0; padding: 24px 28px 0; border-left: 1px solid ${LINE_ON_DARK} }
     .hero-stats li:first-child { padding-left: 0; border-left: 0 }
     .hero-stats strong { display: block; color: ${LIGHT}; font-family: ${HEADING_FONT}; font-size: 36px; font-weight: 300; line-height: 1.1; letter-spacing: 2px }
     .hero-stats span { color: ${LIGHT}; font-size: 10px; letter-spacing: 4px; text-transform: uppercase; opacity: 0.85 }`,
    O.centerOnPhones(
      "ledger",
      `.hero-stats { margin-top: 36px } .hero-stats li { padding: 18px 6px 0; border-left: 0 } .hero-stats strong { font-size: 24px } .hero-stats span { letter-spacing: 2px }`,
    ),
    luxText({ title: "60px" }),
    luxButtons({ align: "flex-start" }),
  ),

  O.opening(
    "lux-letterhead",
    "Letterhead",
    box("hero-copy hero-copy--letterhead", O.logo("360x120"), box("hero-copy__row", O.SUB, LINKS)),
    `.hero-copy--letterhead { max-width: 1100px; margin-inline: auto; padding-inline: 20px; text-align: center }
     .agent-logo { display: block; width: 320px; max-width: 70%; height: auto; margin: 0 auto 38px }
     .hero-copy__row { display: flex; align-items: center; justify-content: space-between; gap: 40px; padding-top: 30px; border-top: 1px solid ${LIGHT}; text-align: left }
     @media (max-width: 768px) { .hero-copy__row { flex-direction: column; gap: 24px; text-align: center } }`,
    luxText({ pre: false, title: false }),
    `.hero-subtitle { margin: 0 }`,
    luxLinks("flex-end"),
  ),

  O.opening(
    "lux-arch",
    "Inside an arch",
    box("hero-copy hero-copy--arch", O.PRE, O.TITLE, DIAMOND, O.SUB, BUTTONS),
    `.hero-copy--arch { max-width: 500px; margin-inline: auto; padding: 96px 44px 52px; border: 1px solid ${LIGHT}; border-radius: 999px 999px 0 0; text-align: center }
     @media (max-width: 768px) { .hero-copy--arch { max-width: 340px; padding: 80px 26px 40px } }`,
    luxText({ title: "42px", titleSm: "28px", gap: "24px" }),
    `.hero-title { letter-spacing: 4px }`,
    DIAMOND_CSS,
    `.hero-divider::before, .hero-divider::after { width: 44px }`,
    luxButtons({ stack: true }),
  ),

  O.opening(
    "lux-panel",
    "Dark panel with double rules",
    box("hero-copy hero-copy--panel", O.PRE, O.TITLE, O.SUB, BUTTONS),
    `.hero-copy--panel { position: relative; max-width: 760px; margin-inline: auto; padding: 66px 48px 62px; background: ${shade(0.62)}; border-block: 1px solid ${ACCENT}; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); text-align: center }
     .hero-copy--panel::before, .hero-copy--panel::after { content: ""; position: absolute; left: 0; right: 0; height: 1px; background: ${ACCENT}; opacity: 0.5 }
     .hero-copy--panel::before { top: 6px }
     .hero-copy--panel::after { bottom: 6px }
     @media (max-width: 768px) { .hero-copy--panel { padding: 48px 20px 44px } }`,
    luxText({ title: "50px" }),
    luxButtons(),
  ),

  O.opening(
    "lux-wordmark",
    "Small wordmark, large tagline",
    box(
      "hero-copy hero-copy--wordmark",
      O.TITLE,
      `<p class="hero-statement">Your Tagline Goes Here</p>`,
      LINKS,
    ),
    O.centered("wordmark", "900px"),
    luxText({ pre: false, sub: false, title: "15px", titleSm: "13px", gap: "30px" }),
    `.hero-title { font-weight: 400 !important; letter-spacing: 12px }
     .hero-statement { margin: 0 0 40px; color: ${LIGHT}; font-family: ${HEADING_FONT}; font-size: 56px; font-style: italic; font-weight: 300; line-height: 1.2; letter-spacing: 1px }
     @media (max-width: 768px) { .hero-title { letter-spacing: 8px } .hero-statement { font-size: 32px } }`,
    luxLinks("center"),
  ),
];

// =====================================================================
// Profiles
// =====================================================================

const LEAD = `<p class="profile__lead">A short, elegant opening line goes here.</p>`;
const SIGN = `<p class="profile__signature">%NAME%</p>`;
const DIVIDER = `<div class="profile__divider"><span></span></div>`;

const lead = (ink: string) =>
  `.profile__lead { margin: 0 0 20px; color: ${ink}; font-family: ${HEADING_FONT}; font-size: 22px; font-style: italic; line-height: 1.5 }`;
const signature = (ink: string) =>
  `.profile__signature { margin: 0 0 34px; color: ${ink}; font-family: ${HEADING_FONT}; font-size: 30px; font-style: italic; line-height: 1.2 }`;
const divider = (line: string, align: "center" | "flex-start") =>
  `.profile__divider { display: flex; align-items: center; justify-content: ${align}; gap: 14px; margin: 0 0 28px }
   .profile__divider::before, .profile__divider::after { content: ""; width: 56px; height: 1px; background: ${line} }
   .profile__divider span { width: 6px; height: 6px; background: ${ACCENT}; transform: rotate(45deg) }`;
const CENTER_DIVIDER_ON_PHONES = `@media (max-width: 768px) { .profile__divider { justify-content: center } }`;

/** A hairline drawn inside the photo's edges. */
const insetFrame = (color: string) =>
  `.profile__media { position: relative }
   .profile__media::after { content: ""; position: absolute; inset: 16px; border: 1px solid ${color}; pointer-events: none }`;

const COLS = P.twoCol({ gap: "88px" });
const reversedCols = P.twoCol({
  template: "minmax(0, 6fr) minmax(0, 5fr)",
  gap: "88px",
  tablet: `.profile__media { order: 0 }`,
});
const COLS_REVERSED = {
  css: `${reversedCols.css}\n.profile__media { order: 2 }`,
  responsive: reversedCols.responsive,
};

const lux = (design: Omit<P.Design, "look" | "btn">): Snippet => P.profile({ ...design, look: "luxe" });

export const LUXURY_PROFILES: Snippet[] = [
  lux({
    id: "lux-editorial",
    name: "Editorial portrait",
    tone: "light",
    html: P.root(
      "lux-editorial",
      P.inner(P.media(P.img()), P.content(P.PRE, P.HEAD, LEAD, P.BIO, SIGN, P.ACT)),
    ),
    css: `${COLS.css}
          ${insetFrame(LIGHT)}
          ${P.PORTRAIT}
          .profile__pretitle { display: flex; align-items: center; gap: 16px }
          .profile__pretitle::before { content: ""; width: 40px; height: 1px; background: ${ACCENT} }
          ${lead(DARK)}
          ${signature(DARK)}`,
    responsive: `${COLS.responsive}
          @media (max-width: 768px) { .profile__pretitle { justify-content: center } }`,
  }),

  lux({
    id: "lux-noir",
    name: "Noir with gold frame",
    tone: "dark",
    html: P.root(
      "lux-noir",
      P.inner(P.media(P.img()), P.content(P.NAME, P.ROLE, DIVIDER, P.BIO, P.INFO, P.ACT)),
    ),
    css: `${COLS_REVERSED.css}
          ${insetFrame(ACCENT)}
          ${P.PORTRAIT}
          ${divider(LINE_ON_DARK, "flex-start")}
          .profile__info { letter-spacing: 1px }`,
    responsive: `${COLS_REVERSED.responsive}
          ${CENTER_DIVIDER_ON_PHONES}`,
  }),

  lux({
    id: "lux-crest",
    name: "Ringed portrait, centered",
    tone: "light",
    html: P.root("lux-crest", P.inner(P.img("600x600"), P.PRE, P.HEAD, DIVIDER, P.BIO, P.ACT)),
    css: `.profile__inner { max-width: 760px; margin-inline: auto; text-align: center }
          .profile__image { width: 208px; height: 208px; margin: 0 auto 40px; padding: 8px; border: 1px solid ${ACCENT}; border-radius: 50% }
          ${divider(LINE_ON_LIGHT, "center")}`,
    responsive: `@media (max-width: 768px) { .profile__image { width: 168px; height: 168px } }`,
  }),

  lux({
    id: "lux-overlap",
    name: "Copy panel over the photo",
    tone: "light",
    html: P.root(
      "lux-overlap",
      P.inner(P.content(P.PRE, P.HEAD, LEAD, P.BIO, P.ACT), P.media(P.img("1000x1200"))),
    ),
    css: `.profile__inner { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; max-width: 1200px; margin-inline: auto }
          .profile__content { position: relative; z-index: 1; margin-right: -96px; padding: 64px 60px; background: ${LIGHT_BG}; border: 1px solid ${LINE_ON_LIGHT} }
          .profile__image { aspect-ratio: 5 / 6 }
          ${lead(DARK)}`,
    responsive: `@media (max-width: 992px) { .profile__inner { grid-template-columns: 1fr } .profile__media { order: -1 } .profile__content { margin: -64px 20px 0; padding: 44px 28px } }`,
  }),

  lux({
    id: "lux-plate",
    name: "Matted photo with name plate",
    tone: "dark",
    html: P.root(
      "lux-plate",
      P.inner(
        P.media(P.img("800x900"), box("profile__plate", `<p class="profile__name">%NAME%</p>`, P.ROLE)),
        P.content(P.PRE, P.HEAD, P.BIO, P.ACT),
      ),
    ),
    css: `${COLS.css}
          .profile__media { width: 100%; max-width: 440px; justify-self: center; padding: 22px 22px 0; background: var(--primary-light); box-shadow: 0 30px 70px ${shade(0.45)} }
          .profile__image { aspect-ratio: 8 / 9 }
          .profile__plate { padding: 22px 0 24px; text-align: center }
          .profile__name { margin: 0 0 4px; color: ${DARK}; font-family: ${HEADING_FONT}; font-size: 22px; letter-spacing: 3px; text-transform: uppercase }
          .profile__role { margin: 0; color: ${DARK} }`,
    responsive: P.twoCol({ tablet: `.profile__media { max-width: 380px }` }).responsive,
  }),

  lux({
    id: "lux-ledger",
    name: "Portrait with a stats ledger",
    tone: "dark",
    html: P.root("lux-ledger", P.inner(P.media(P.img()), P.content(P.PRE, P.HEAD, P.BIO, P.STATS, P.ACT))),
    css: `${COLS.css}
          ${P.PORTRAIT}
          .profile__stats { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0 0 40px; padding: 0; border-block: 1px solid ${LINE_ON_DARK}; list-style: none }
          .profile__stats li { margin: 0; padding: 26px 22px; border-left: 1px solid ${LINE_ON_DARK} }
          .profile__stats li:first-child { padding-left: 0; border-left: 0 }
          .profile__stats strong { display: block; margin-bottom: 6px; color: ${ACCENT}; font-family: ${HEADING_FONT}; font-size: 38px; font-weight: 300; line-height: 1.1 }
          .profile__stats span { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; opacity: 0.8 }`,
    responsive: `${COLS.responsive}
          @media (max-width: 768px) { .profile__stats li { padding: 20px 6px; border-left: 0 } .profile__stats strong { font-size: 26px } .profile__stats span { letter-spacing: 2px } }`,
  }),

  lux({
    id: "lux-arch",
    name: "Arch with an outline",
    tone: "light",
    html: P.root("lux-arch", P.inner(P.media(P.img("800x1100")), P.content(P.NAME, P.ROLE, DIVIDER, P.BIO, P.ACT))),
    css: `${COLS.css}
          .profile__media { position: relative; width: 100%; max-width: 420px; margin: 14px; justify-self: center }
          .profile__media::before { content: ""; position: absolute; inset: -14px; border: 1px solid ${ACCENT}; border-radius: 999px 999px 0 0 }
          .profile__image { position: relative; aspect-ratio: 3 / 4; border-radius: 999px 999px 0 0 }
          ${divider(LINE_ON_LIGHT, "flex-start")}`,
    responsive: `${P.twoCol({ tablet: `.profile__media { width: calc(100% - 28px); max-width: 340px }` }).responsive}
          ${CENTER_DIVIDER_ON_PHONES}`,
  }),

  lux({
    id: "lux-half",
    name: "Half-screen photo with side rule",
    tone: "dark",
    pad: "0",
    padSm: "0",
    html: P.root(
      "lux-half",
      P.inner(P.media(P.img("1000x1200")), P.content(P.PRE, P.HEAD, LEAD, P.BIO, P.ACT)),
    ),
    css: `${P.HALF.css}
          .profile__media { min-height: 720px }
          .profile__content { margin: 96px 72px; padding: 12px 0 12px 48px; border-left: 1px solid ${ACCENT} }
          ${lead(LIGHT)}`,
    responsive: `${P.HALF.responsive}
          @media (max-width: 992px) { .profile__content { margin: 64px 20px; padding: 0 0 0 28px } }
          @media (max-width: 768px) { .profile__content { padding: 28px 0 0; border-left: 0; border-top: 1px solid ${ACCENT} } }`,
  }),

  lux({
    id: "lux-quote",
    name: "Quote between rules",
    tone: "dark",
    html: P.root(
      "lux-quote",
      P.inner(
        P.PRE,
        `<p class="profile__quote">A short quote or personal motto goes here, in one or two lines.</p>`,
        box("profile__person", P.img("300x300"), box("profile__person-text", SIGN, P.ROLE)),
        P.ACT,
      ),
    ),
    css: `.profile__inner { max-width: 900px; margin-inline: auto; text-align: center }
          .profile__quote { margin: 0 0 40px; padding: 44px 0; border-block: 1px solid ${LINE_ON_DARK}; color: ${LIGHT}; font-family: ${HEADING_FONT}; font-size: 38px; font-style: italic; font-weight: 300; line-height: 1.4 }
          .profile__person { display: inline-flex; align-items: center; gap: 20px; margin-bottom: 40px; text-align: left }
          .profile__image { width: 84px; height: 84px; padding: 4px; border: 1px solid ${ACCENT}; border-radius: 50% }
          ${signature(LIGHT)}
          .profile__signature { margin: 0 0 2px; font-size: 26px }
          .profile__role { margin: 0 }`,
    responsive: `@media (max-width: 768px) { .profile__quote { padding: 32px 0; font-size: 25px } }`,
  }),

  lux({
    id: "lux-card",
    name: "Double-bordered card",
    tone: "card",
    bg: LIGHT_BG,
    html: P.root(
      "lux-card",
      box("profile__card", P.img("600x800"), P.NAME, P.ROLE, DIVIDER, P.INFO, P.ACT),
    ),
    css: `.profile__card { max-width: 540px; margin-inline: auto; padding: 64px 52px 60px; background: ${CARD}; outline: 1px solid ${CARD_TEXT}; outline-offset: -12px; box-shadow: 0 30px 70px ${shade(0.25)}; text-align: center }
          .profile__image { width: 168px; height: 216px; margin: 0 auto 32px; border-radius: 50% }
          ${divider(CARD_TEXT, "center")}
          .profile__info { letter-spacing: 1px }`,
    responsive: `@media (max-width: 768px) { .profile__card { padding: 52px 28px 48px } }`,
  }),

  lux({
    id: "lux-letter",
    name: "A personal note",
    tone: "light",
    html: P.root(
      "lux-letter",
      P.inner(
        P.img("300x300"),
        `<p class="profile__pretitle">A Note From %NAME%</p>`,
        LEAD,
        P.BIO,
        SIGN,
        P.ROLE,
        P.ACT,
      ),
    ),
    css: `.profile__inner { max-width: 760px; margin-inline: auto; padding: 72px 64px; border: 1px solid ${LINE_ON_LIGHT}; text-align: center }
          .profile__image { width: 96px; height: 96px; margin: 0 auto 28px; border-radius: 50% }
          ${lead(DARK)}
          .profile__lead { font-size: 28px }
          ${signature(DARK)}
          .profile__signature { margin-bottom: 6px }
          .profile__role { margin-bottom: 34px }`,
    responsive: `@media (max-width: 768px) { .profile__inner { padding: 48px 24px } .profile__lead { font-size: 22px } }`,
  }),

  lux({
    id: "lux-cinematic",
    name: "Cinematic photo, three columns",
    tone: "dark",
    html: P.root(
      "lux-cinematic",
      P.inner(
        P.media(P.img("1680x720")),
        box(
          "profile__columns",
          box("profile__lead-column", P.PRE, P.HEAD),
          P.content(P.BIO),
          box("profile__contact", P.INFO, P.ACT),
        ),
      ),
    ),
    css: `.profile__inner { max-width: 1200px; margin-inline: auto }
          .profile__media { margin-bottom: 56px; padding: 14px 0; border-block: 1px solid ${ACCENT} }
          .profile__image { aspect-ratio: 21 / 9 }
          .profile__columns { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 5fr) minmax(0, 3fr); align-items: start; gap: 56px }
          .profile__title { margin: 0; font-size: 38px }
          .profile__bio { margin: 0 }
          .profile__info { letter-spacing: 1px }`,
    responsive: `@media (max-width: 992px) { .profile__columns { grid-template-columns: 1fr; gap: 28px } }
          @media (max-width: 768px) { .profile__media { margin-bottom: 36px } .profile__image { aspect-ratio: 3 / 2 } }`,
  }),
];
