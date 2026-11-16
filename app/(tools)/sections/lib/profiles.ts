// Profile sections: an agent or team photo with their details and a button.
// Each design brings its own full-width background, so it looks the same in any
// section it's pasted into.

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
  LINE_ON_DARK,
  LINE_ON_LIGHT,
  box,
  formatCss,
  shade,
  wrap,
  type Snippet,
} from "./shared";

// ---------- HTML pieces ----------
// The %PLACEHOLDERS% are filled in for an individual agent or a team (see shared.ts).

export const img = (size = "800x1000", modifier = "") =>
  `<img class="profile__image${modifier}" src="https://placehold.co/${size}?text=%PHOTO%" alt="%NAME%" />`;
export const PRE = `<p class="profile__pretitle">%PRETITLE%</p>`;
export const HEAD = `<h2 class="profile__title">Your Headline Goes Here</h2>`;
export const NAME = `<h2 class="profile__title">%NAME%</h2>`;
export const ROLE = `<p class="profile__role">%ROLE%</p>`;
export const BIO = `<p class="profile__bio">%BIO%</p>`;
export const ACT = `<p class="profile__actions"><a class="lp-btn button-style-2 profile__btn" href="%HREF%"><span class="lp-btn__content">%BTN%</span></a></p>`;
export const PHONE = `<a href="tel:5551234567">(555) 123-4567</a>`;
export const EMAIL = `<a href="mailto:name@email.com">name@email.com</a>`;
export const INFO = wrap("ul", "profile__info", `<li>${PHONE}</li>`, `<li>${EMAIL}</li>`, `<li>License #0000000</li>`);
export const INFO_ROWS = wrap(
  "ul",
  "profile__info",
  `<li><span>Phone</span>${PHONE}</li>`,
  `<li><span>Email</span>${EMAIL}</li>`,
  `<li><span>License</span>#0000000</li>`,
);
export const STATS = wrap(
  "ul",
  "profile__stats",
  `<li><strong>00+</strong><span>Years Experience</span></li>`,
  `<li><strong>$000M</strong><span>In Sales</span></li>`,
  `<li><strong>000+</strong><span>Homes Sold</span></li>`,
);
export const POINTS = wrap(
  "ul",
  "profile__points",
  `<li>First highlight goes here</li>`,
  `<li>Second highlight goes here</li>`,
  `<li>Third highlight goes here</li>`,
);

export const root = (name: string, ...children: string[]) => box(`profile profile--${name}`, ...children);
export const inner = (...children: string[]) => box("profile__inner", ...children);
export const media = (...children: string[]) => box("profile__media", ...children);
export const content = (...children: string[]) => box("profile__content", ...children);

// ---------- CSS pieces ----------

export const TONES = {
  // On the card color the button color can be the same color (it is in Visionary), so
  // small accents there use the card's text color instead.
  light: { bg: LIGHT_BG, ink: DARK, line: LINE_ON_LIGHT, inverse: LIGHT },
  dark: { bg: DARK_BG, ink: LIGHT, line: LINE_ON_DARK, inverse: DARK },
  card: { bg: CARD, ink: CARD_TEXT, line: "rgba(from var(--typography-card) r g b / 0.3)", inverse: CARD },
};
export type Tone = keyof typeof TONES;

/** The colors a look's type is drawn in. `mark` is the small-accent color for the tone. */
export type Inks = { ink: string; line: string; mark: string };
export type ButtonStyle = "outline" | "accent" | "hairline" | "pill" | "block";

/**
 * The type and spacing each style set shares across its profiles. Every entry is
 * the declarations that follow the margin and color of its rule.
 */
export const LOOKS = {
  normal: {
    pad: "96px 20px",
    padSm: "64px 20px",
    btn: "outline" as ButtonStyle,
    pretitle: ({ mark }: Inks) =>
      `margin: 0 0 16px; color: ${mark}; font-family: ${BODY_FONT}; font-size: 12px; letter-spacing: 4px; text-transform: uppercase`,
    titleGap: "16px",
    title: "font-size: 44px; line-height: 1.15",
    titleSm: "32px",
    role: "font-size: 13px; letter-spacing: 3px; text-transform: uppercase; opacity: 0.7",
    bio: { gap: "28px", rest: "line-height: 1.8; opacity: 0.85" },
  },
  // Luxury: lighter, more widely spaced, with more room around it.
  luxe: {
    pad: "120px 20px",
    padSm: "72px 20px",
    btn: "hairline" as ButtonStyle,
    pretitle: ({ mark }: Inks) =>
      `margin: 0 0 16px; color: ${mark}; font-family: ${BODY_FONT}; font-size: 11px; letter-spacing: 6px; text-transform: uppercase`,
    titleGap: "20px",
    title: "font-size: 46px; font-weight: 300 !important; line-height: 1.2; letter-spacing: 2px",
    titleSm: "30px",
    role: "font-size: 11px; letter-spacing: 5px; text-transform: uppercase; opacity: 0.7",
    bio: { gap: "32px", rest: "line-height: 2; opacity: 0.85" },
  },
  // Modern: a pill label, tight medium-weight headlines and rounded buttons.
  modern: {
    pad: "104px 20px",
    padSm: "64px 20px",
    btn: "pill" as ButtonStyle,
    pretitle: ({ ink, line }: Inks) =>
      `display: inline-block; margin: 0 0 20px; padding: 7px 16px; border: 1px solid ${line}; border-radius: 999px; color: ${ink}; font-family: ${BODY_FONT}; font-size: 12px; font-weight: 600; line-height: 1.4; letter-spacing: 1.5px; text-transform: uppercase`,
    titleGap: "16px",
    title: "font-size: 46px; font-weight: 600 !important; line-height: 1.1; letter-spacing: -0.5px",
    titleSm: "32px",
    role: "font-size: 15px; font-weight: 500; letter-spacing: 0.3px; opacity: 0.7",
    bio: { gap: "28px", rest: "line-height: 1.75; opacity: 0.8" },
  },
  // Bold: heavy uppercase headlines, thick rules and square solid buttons.
  bold: {
    pad: "96px 20px",
    padSm: "64px 20px",
    btn: "block" as ButtonStyle,
    pretitle: ({ ink, mark }: Inks) =>
      `display: inline-block; margin: 0 0 22px; padding-bottom: 8px; border-bottom: 4px solid ${mark}; color: ${ink}; font-family: ${BODY_FONT}; font-size: 13px; font-weight: 700; line-height: 1.4; letter-spacing: 3px; text-transform: uppercase`,
    titleGap: "18px",
    title: "font-size: 54px; font-weight: 700 !important; line-height: 1; letter-spacing: -0.5px; text-transform: uppercase !important",
    titleSm: "36px",
    role: "font-size: 14px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase",
    bio: { gap: "30px", rest: "line-height: 1.7; opacity: 0.9" },
  },
};

export type Look = keyof typeof LOOKS;

/**
 * The rules for a section's button in one of the styles' shapes. `solid` is the
 * fill of the filled shapes; the others are drawn in the text color.
 */
export function buttonCss(
  selector: string,
  style: ButtonStyle,
  { ink, inverse, solid }: { ink: string; inverse: string; solid: { bg: string; text: string } },
): string {
  const noArrow = `${selector}::before, ${selector}::after { display: none }`;
  const toOutline = `${selector}:hover { background: transparent !important; border-color: ${ink} !important; color: ${ink} !important }`;
  const toFilled = `${selector}:hover { background: ${ink} !important; color: ${inverse} !important }`;
  const rules: Record<ButtonStyle, string[]> = {
    hairline: [
      `${selector} { min-width: 220px; padding: 16px 34px; background: transparent !important; border: 1px solid ${ink} !important; color: ${ink} !important; font-size: 12px; font-weight: 500 !important; letter-spacing: 4px; text-decoration: none !important; transition: 0.5s ease }`,
      toFilled,
    ],
    pill: [
      `${selector} { min-width: 210px; padding: 15px 30px; background: ${solid.bg} !important; border: 2px solid ${solid.bg} !important; border-radius: 999px; color: ${solid.text} !important; font-weight: 600 !important; letter-spacing: 1.5px; text-decoration: none !important; transition: 0.3s ease }`,
      toOutline,
    ],
    block: [
      `${selector} { min-width: 240px; padding: 18px 32px; background: ${solid.bg} !important; border: 3px solid ${solid.bg} !important; color: ${solid.text} !important; font-size: 14px; font-weight: 700 !important; letter-spacing: 2px; text-decoration: none !important; transition: 0.2s ease }`,
      toOutline,
    ],
    accent: [
      `${selector} { min-width: 230px; padding: 14px 28px; background: ${ACCENT} !important; border: 2px solid ${ACCENT} !important; color: ${LIGHT} !important; font-weight: 600 !important; letter-spacing: 2.5px; text-decoration: none !important; transition: 0.3s ease }`,
      toOutline,
    ],
    outline: [
      `${selector} { min-width: 230px; padding: 14px 28px; background: transparent !important; border: 2px solid ${ink} !important; color: ${ink} !important; font-weight: 600 !important; letter-spacing: 2.5px; text-decoration: none !important; transition: 0.3s ease }`,
      toFilled,
    ],
  };
  const [base, hover] = rules[style];
  return [base, noArrow, hover].join("\n");
}

/**
 * A second button for a section that has one: filled where the first is outlined,
 * outlined where the first is filled, with room between them. `block` is the
 * section's class, such as "profile".
 */
export function secondButton(
  block: string,
  html: string,
  style: ButtonStyle,
  { ink, inverse, solid }: { ink: string; inverse: string; solid: { bg: string; text: string } },
) {
  const sel = `.${block}__btn--alt`;
  const filled = style === "outline" || style === "hairline";
  const look = filled
    ? `${sel} { background: ${solid.bg} !important; border-color: ${solid.bg} !important; color: ${solid.text} !important }
       ${sel}:hover { background: transparent !important; border-color: ${ink} !important; color: ${ink} !important }`
    : `${sel} { background: transparent !important; border-color: ${ink} !important; color: ${ink} !important }
       ${sel}:hover { background: ${ink} !important; border-color: ${ink} !important; color: ${inverse} !important }`;
  return {
    html,
    // A 6px margin round each button, taken back by the row, keeps them lined up with
    // the text however they wrap.
    css: `/* Second button */
      .${block}__actions { margin-inline: -6px }
      .${block}__actions .${block}__btn { margin: 6px }
      ${look}
      @media (max-width: 768px) { .${block}__actions { margin-inline: 0 } .${block}__actions .${block}__btn { margin: 0 } .${block}__actions ${sel} { margin-top: 12px } }`,
  };
}

export type Design = {
  id: string;
  name: string;
  /** Which background and text colors the copy sits on. */
  tone: Tone;
  /** Background of the full-width wrapper, when it differs from the tone's. */
  bg?: string;
  /** Wrapper padding on desktop and on phones. */
  pad?: string;
  padSm?: string;
  /** Extra declarations for the wrapper. */
  wrapper?: string;
  /** The style set's type and spacing. Normal when left out. */
  look?: Look;
  /** Defaults to the look's own button. */
  btn?: ButtonStyle;
  html: string;
  /** Layout rules, then the rules for smaller screens. */
  css: string;
  responsive?: string;
};

export function profile(design: Design): Snippet {
  const { id, name, html, tone } = design;
  const look = LOOKS[design.look ?? "normal"];
  const btn = design.btn ?? look.btn;
  const pad = design.pad ?? look.pad;
  const padSm = design.padSm ?? look.padSm;
  const { bg, ink, line, inverse } = TONES[tone];
  // On the card color the button color may be the card color itself, so solid
  // buttons there are filled with the text color instead.
  const solid = tone === "card" ? { bg: ink, text: inverse } : { bg: ACCENT, text: LIGHT };
  const has = (part: string) => html.includes(`profile__${part}`);
  const rules = [
    `section { padding-top: 0 !important; padding-bottom: 0 !important; overflow-x: hidden }`,
    `.profile { width: 100vw; margin-left: calc(50% - 50vw); padding: ${pad}; background: ${design.bg ?? bg}; color: ${ink}; text-align: left; white-space: normal${design.wrapper ? `; ${design.wrapper}` : ""} }`,
    `.profile__image { display: block; width: 100%; height: auto; object-fit: cover }`,
    has("pretitle") && `.profile__pretitle { ${look.pretitle({ ink, line, mark: tone === "card" ? ink : ACCENT })} }`,
    has("title") && `.profile__title { margin: 0 0 ${look.titleGap}; color: ${ink}; ${look.title} }`,
    has("role") && `.profile__role { margin: 0 0 20px; color: ${ink}; ${look.role} }`,
    has("bio") && `.profile__bio { margin: 0 0 ${look.bio.gap}; color: ${ink}; ${look.bio.rest} }`,
    has("info") &&
      `.profile__info { margin: 0 0 28px; padding: 0; color: ${ink}; list-style: none }
       .profile__info li { margin: 0 0 6px }
       .profile__info a { color: inherit; text-decoration: none }`,
    `.profile__actions { margin: 0 }`,
    design.css,
    `/* Button */`,
    buttonCss(`.profile__btn`, btn, { ink, inverse, solid }),
    `/* Smaller screens */`,
    design.responsive,
    `@media (max-width: 768px) { .profile { padding: ${padSm}; text-align: center } ${has("title") ? `.profile__title { font-size: ${look.titleSm} }` : ""} .profile__btn { width: 100% } }`,
  ];
  return {
    id,
    name,
    html,
    css: formatCss(rules.filter(Boolean).join("\n")),
    extraButton: secondButton(
      "profile",
      `<a class="lp-btn button-style-2 profile__btn profile__btn--alt" href="%HREF2%"><span class="lp-btn__content">%BTN2%</span></a>`,
      btn,
      { ink, inverse, solid },
    ),
  };
}

/** Photo and copy side by side, stacking on tablets. `tablet` adds rules to the stacked layout. */
export function twoCol(options: { template?: string; gap?: string; align?: string; tablet?: string } = {}) {
  const { template = "minmax(0, 5fr) minmax(0, 6fr)", gap = "72px", align = "center", tablet = "" } = options;
  return {
    css: `.profile__inner { display: grid; grid-template-columns: ${template}; align-items: ${align}; gap: ${gap}; max-width: 1200px; margin-inline: auto }`,
    responsive: `@media (max-width: 992px) { .profile__inner { grid-template-columns: 1fr; gap: 40px } .profile__media { width: 100%; max-width: 480px; margin-inline: auto } ${tablet} }`,
  };
}

export const PORTRAIT = `.profile__image { aspect-ratio: 4 / 5 }`;
export const COLS = twoCol();
// The photo moves to the second column, so the column widths swap with it.
const reversed = twoCol({
  template: "minmax(0, 6fr) minmax(0, 5fr)",
  tablet: `.profile__media { order: 0 }`,
});
export const COLS_REVERSED = { css: `${reversed.css}\n.profile__media { order: 2 }`, responsive: reversed.responsive };

/** A photo that fills one half of the screen edge to edge, with the copy in the other half. */
export const HALF = {
  css: `.profile__inner { display: grid; grid-template-columns: 1fr 1fr }
        .profile__media { position: relative; min-height: 640px }
        .profile__image { position: absolute; inset: 0; height: 100% }
        .profile__content { align-self: center; max-width: 640px; padding: 96px 72px }`,
  responsive: `@media (max-width: 992px) { .profile__inner { grid-template-columns: 1fr } .profile__media { min-height: 0; order: 0 } .profile__image { position: static; height: auto; aspect-ratio: 4 / 3; clip-path: none } .profile__content { max-width: none; padding: 64px 20px } }`,
};

/** A photo behind the whole section with a dark wash over it. */
export const backdrop = (wash: number) =>
  `.profile__media { position: absolute; inset: 0 }
   .profile__media::after { content: ""; position: absolute; inset: 0; background: ${shade(wash)} }
   .profile__image { height: 100% }`;

// ---------- The designs ----------

export const PROFILES: Snippet[] = [
  profile({
    id: "classic",
    name: "Photo left, light",
    tone: "light",
    html: root("classic", inner(media(img()), content(PRE, HEAD, BIO, ACT))),
    css: `${COLS.css}\n${PORTRAIT}`,
    responsive: COLS.responsive,
  }),

  profile({
    id: "classic-right",
    name: "Photo right, light",
    tone: "light",
    btn: "accent",
    html: root("classic-right", inner(media(img()), content(PRE, HEAD, BIO, ACT))),
    css: `${COLS_REVERSED.css}\n${PORTRAIT}`,
    responsive: COLS_REVERSED.responsive,
  }),

  profile({
    id: "classic-dark",
    name: "Photo left, dark",
    tone: "dark",
    btn: "accent",
    html: root("classic-dark", inner(media(img()), content(NAME, ROLE, BIO, INFO, ACT))),
    css: `${COLS.css}\n${PORTRAIT}`,
    responsive: COLS.responsive,
  }),

  profile({
    id: "classic-dark-right",
    name: "Photo right, dark",
    tone: "dark",
    html: root("classic-dark-right", inner(media(img()), content(PRE, HEAD, BIO, ACT))),
    css: `${COLS_REVERSED.css}\n${PORTRAIT}`,
    responsive: COLS_REVERSED.responsive,
  }),

  profile({
    id: "overlap",
    name: "Wide photo with overlapping card",
    tone: "card",
    bg: LIGHT_BG,
    pad: "0 0 96px",
    padSm: "0 0 64px",
    html: root("overlap", img("1600x700"), box("profile__card", PRE, HEAD, BIO, ACT)),
    css: `.profile__image { aspect-ratio: 16 / 7 }
          .profile__card { position: relative; width: 90%; max-width: 920px; margin: -80px auto 0; padding: 48px 56px; background: ${CARD}; border-top: 3px solid ${ACCENT}; box-shadow: 0 24px 60px ${shade(0.25)}; text-align: center }
          .profile__bio { max-width: 560px; margin-inline: auto }`,
    responsive: `@media (max-width: 768px) { .profile__image { aspect-ratio: 3 / 2 } .profile__card { width: calc(100% - 40px); margin-top: -40px; padding: 40px 24px } }`,
  }),

  profile({
    id: "offset-frame",
    name: "Offset accent frame",
    tone: "light",
    html: root("offset-frame", inner(media(img()), content(PRE, HEAD, BIO, ACT))),
    css: `${COLS.css}
          .profile__media { position: relative; margin: 0 24px 24px 0 }
          .profile__media::before { content: ""; position: absolute; inset: 24px -24px -24px 24px; border: 1px solid ${ACCENT} }
          .profile__image { position: relative; aspect-ratio: 4 / 5 }`,
    responsive: twoCol({ tablet: `.profile__media { width: calc(100% - 24px) }` }).responsive,
  }),

  profile({
    id: "circle",
    name: "Round portrait, centered",
    tone: "light",
    btn: "accent",
    html: root("circle", inner(img("600x600"), NAME, ROLE, BIO, INFO, ACT)),
    css: `.profile__inner { max-width: 720px; margin-inline: auto; text-align: center }
          .profile__image { width: 220px; height: 220px; margin: 0 auto 32px; border-radius: 50% }
          .profile__info { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 28px }
          .profile__info li { margin: 0 }`,
    responsive: `@media (max-width: 768px) { .profile__image { width: 168px; height: 168px } }`,
  }),

  profile({
    id: "arch",
    name: "Arched portrait",
    tone: "light",
    html: root("arch", inner(media(img("800x1100")), content(PRE, HEAD, BIO, ACT))),
    css: `${COLS.css}
          .profile__media { width: 100%; max-width: 440px; justify-self: center }
          .profile__image { aspect-ratio: 3 / 4; border-radius: 999px 999px 0 0 }`,
    responsive: twoCol({ tablet: `.profile__media { max-width: 360px }` }).responsive,
  }),

  profile({
    id: "half",
    name: "Half-screen photo, dark",
    tone: "dark",
    btn: "accent",
    pad: "0",
    padSm: "0",
    html: root("half", inner(media(img("1000x1200")), content(PRE, HEAD, BIO, ACT))),
    css: HALF.css,
    responsive: HALF.responsive,
  }),

  profile({
    id: "half-right",
    name: "Half-screen photo, light",
    tone: "light",
    pad: "0",
    padSm: "0",
    html: root("half-right", inner(media(img("1000x1200")), content(NAME, ROLE, BIO, INFO, ACT))),
    css: `${HALF.css}
          .profile__media { order: 2 }
          .profile__content { justify-self: end }`,
    responsive: HALF.responsive,
  }),

  profile({
    id: "backdrop-card",
    name: "Card over a full-width photo",
    tone: "card",
    bg: DARK_BG,
    wrapper: "position: relative; overflow: hidden",
    html: root("backdrop-card", media(img("1600x900")), inner(box("profile__card", PRE, HEAD, BIO, ACT))),
    css: `${backdrop(0.35)}
          .profile__inner { position: relative; max-width: 1200px; margin-inline: auto }
          .profile__card { max-width: 480px; margin-left: auto; padding: 56px 48px; background: ${CARD}; border-top: 3px solid ${ACCENT} }`,
    responsive: `@media (max-width: 768px) { .profile__card { margin-inline: auto; padding: 40px 24px } }`,
  }),

  profile({
    id: "quote",
    name: "Quote with small portrait",
    tone: "light",
    html: root(
      "quote",
      inner(
        `<p class="profile__quote">A short quote or personal motto goes here, in one or two lines.</p>`,
        box("profile__person", img("300x300"), box("profile__person-text", `<p class="profile__name">%NAME%</p>`, ROLE)),
        ACT,
      ),
    ),
    css: `.profile__inner { max-width: 860px; margin-inline: auto; text-align: center }
          .profile__quote { margin: 0 0 36px; color: ${DARK}; font-family: ${HEADING_FONT}; font-size: 34px; font-style: italic; line-height: 1.4 }
          .profile__quote::before { content: "“"; display: block; height: 44px; color: ${ACCENT}; font-size: 96px; font-style: normal; line-height: 1 }
          .profile__person { display: inline-flex; align-items: center; gap: 16px; margin-bottom: 36px; text-align: left }
          .profile__image { width: 72px; height: 72px; border-radius: 50% }
          .profile__name { margin: 0 0 2px; color: ${DARK}; font-size: 15px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase }
          .profile__role { margin: 0 }`,
    responsive: `@media (max-width: 768px) { .profile__quote { font-size: 24px } }`,
  }),

  profile({
    id: "stats",
    name: "Photo with stats, dark",
    tone: "dark",
    html: root("stats", inner(media(img()), content(PRE, HEAD, BIO, STATS, ACT))),
    css: `${COLS.css}
          ${PORTRAIT}
          .profile__stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin: 0 0 32px; padding: 28px 0 0; border-top: 1px solid ${LINE_ON_DARK}; list-style: none }
          .profile__stats li { margin: 0 }
          .profile__stats strong { display: block; color: ${ACCENT}; font-family: ${HEADING_FONT}; font-size: 36px; font-weight: 400; line-height: 1.1 }
          .profile__stats span { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.75 }`,
    responsive: `${COLS.responsive}
          @media (max-width: 768px) { .profile__stats { gap: 12px } .profile__stats strong { font-size: 26px } }`,
  }),

  profile({
    id: "contact-rows",
    name: "Contact details in rows",
    tone: "light",
    btn: "accent",
    html: root("contact-rows", inner(media(img()), content(NAME, ROLE, BIO, INFO_ROWS, ACT))),
    css: `${COLS.css}
          ${PORTRAIT}
          .profile__info li { display: flex; justify-content: space-between; gap: 16px; margin: 0; padding: 14px 0; border-bottom: 1px solid ${LINE_ON_LIGHT} }
          .profile__info li:first-child { border-top: 1px solid ${LINE_ON_LIGHT} }
          .profile__info span { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; opacity: 0.6 }`,
    responsive: COLS.responsive,
  }),

  profile({
    id: "strip",
    name: "Compact strip",
    tone: "card",
    pad: "40px 20px",
    padSm: "40px 20px",
    html: root("strip", inner(img("300x300"), content(NAME, ROLE), ACT)),
    css: `.profile__inner { display: flex; align-items: center; gap: 32px; max-width: 1200px; margin-inline: auto }
          .profile__image { flex-shrink: 0; width: 120px; height: 120px }
          .profile__content { flex: 1 }
          .profile__title { margin-bottom: 4px; font-size: 30px }
          .profile__role { margin: 0 }`,
    responsive: `@media (max-width: 768px) { .profile__inner { flex-direction: column; gap: 20px } .profile__actions { width: 100% } }`,
  }),

  profile({
    id: "polaroid",
    name: "Tilted photo print",
    tone: "light",
    html: root("polaroid", inner(media(img("800x800")), content(PRE, HEAD, BIO, ACT))),
    css: `${COLS.css}
          .profile__media { width: 100%; max-width: 420px; justify-self: center; padding: 14px 14px 56px; background: var(--primary-light); box-shadow: 0 24px 60px ${shade(0.2)}; transform: rotate(-3deg) }
          .profile__image { aspect-ratio: 1 / 1 }`,
    responsive: twoCol({ tablet: `.profile__media { max-width: 340px }` }).responsive,
  }),

  profile({
    id: "split-block",
    name: "Photo across a color split",
    tone: "light",
    bg: `linear-gradient(90deg, ${DARK_BG} 34%, ${LIGHT_BG} 34%)`,
    btn: "accent",
    html: root("split-block", inner(media(img()), content(PRE, HEAD, BIO, ACT))),
    css: `${COLS.css}\n${PORTRAIT}`,
    responsive: `${COLS.responsive}
          @media (max-width: 992px) { .profile { background: linear-gradient(180deg, ${DARK_BG} 280px, ${LIGHT_BG} 280px) } }`,
  }),

  profile({
    id: "side-label",
    name: "Vertical label beside the photo",
    tone: "dark",
    html: root(
      "side-label",
      inner(media(`<p class="profile__label">%PRETITLE%</p>`, img()), content(HEAD, BIO, INFO, ACT)),
    ),
    css: `${COLS.css}
          .profile__media { display: flex; align-items: stretch; gap: 20px }
          .profile__label { margin: 0; color: ${ACCENT}; font-size: 12px; letter-spacing: 6px; text-transform: uppercase; text-align: center; writing-mode: vertical-rl; transform: rotate(180deg) }
          .profile__image { flex: 1; min-width: 0; aspect-ratio: 4 / 5 }`,
    responsive: COLS.responsive,
  }),

  profile({
    id: "stacked",
    name: "Photo on top, centered",
    tone: "light",
    html: root("stacked", inner(img("1200x800"), PRE, HEAD, BIO, ACT)),
    css: `.profile__inner { max-width: 760px; margin-inline: auto; text-align: center }
          .profile__image { aspect-ratio: 3 / 2; margin-bottom: 40px }`,
  }),

  profile({
    id: "caption",
    name: "Name over the photo",
    tone: "dark",
    btn: "accent",
    html: root(
      "caption",
      inner(media(img(), box("profile__caption", NAME, ROLE)), content(PRE, BIO, INFO, ACT)),
    ),
    css: `${COLS.css}
          .profile__media { position: relative }
          ${PORTRAIT}
          .profile__caption { position: absolute; inset: auto 0 0; padding: 96px 28px 24px; background: linear-gradient(${shade(0)}, ${shade(0.9)}); text-align: left }
          .profile__caption .profile__title { margin: 0 0 4px; color: ${LIGHT}; font-size: 30px }
          .profile__caption .profile__role { margin: 0; color: ${LIGHT} }`,
    responsive: `${COLS.responsive}
          @media (max-width: 768px) { .profile__caption .profile__title { font-size: 26px } }`,
  }),

  profile({
    id: "accent-rule",
    name: "Card color with rule",
    tone: "card",
    html: root("accent-rule", inner(media(img()), content(PRE, HEAD, BIO, ACT))),
    css: `${COLS.css}
          ${PORTRAIT}
          .profile__title::after { content: ""; display: block; width: 56px; height: 3px; margin-top: 20px; background: ${CARD_TEXT} }`,
    responsive: `${COLS.responsive}
          @media (max-width: 768px) { .profile__title::after { margin-inline: auto } }`,
  }),

  profile({
    id: "collage",
    name: "Two-photo collage",
    tone: "light",
    btn: "accent",
    html: root(
      "collage",
      inner(media(img(), img("600x600", " profile__image--small")), content(PRE, HEAD, BIO, ACT)),
    ),
    css: `${twoCol({ template: "minmax(0, 6fr) minmax(0, 5fr)" }).css}
          .profile__media { position: relative; padding: 0 22% 48px 0 }
          ${PORTRAIT}
          .profile__image--small { position: absolute; right: 0; bottom: 0; width: 46%; aspect-ratio: 1 / 1; border: 8px solid ${LIGHT_BG} }`,
    responsive: COLS.responsive,
  }),

  profile({
    id: "wide",
    name: "Wide photo, two columns below",
    tone: "light",
    html: root(
      "wide",
      inner(img("1680x720"), box("profile__columns", box("profile__lead", PRE, HEAD), content(BIO, ACT))),
    ),
    css: `.profile__inner { max-width: 1200px; margin-inline: auto }
          .profile__image { aspect-ratio: 21 / 9; margin-bottom: 48px }
          .profile__columns { display: grid; grid-template-columns: 1fr 1fr; align-items: start; gap: 64px }
          .profile__title { margin: 0 }`,
    responsive: `@media (max-width: 992px) { .profile__columns { grid-template-columns: 1fr; gap: 20px } }
          @media (max-width: 768px) { .profile__image { aspect-ratio: 3 / 2; margin-bottom: 32px } }`,
  }),

  profile({
    id: "overlay",
    name: "Copy over a full-width photo",
    tone: "dark",
    pad: "140px 20px",
    padSm: "96px 20px",
    wrapper: "position: relative; overflow: hidden",
    html: root("overlay", media(img("1600x900")), inner(PRE, HEAD, BIO, ACT)),
    css: `${backdrop(0.6)}
          .profile__inner { position: relative; max-width: 760px; margin-inline: auto; text-align: center }
          .profile__pretitle { color: ${LIGHT} }`,
  }),

  profile({
    id: "tag",
    name: "Photo with a tag",
    tone: "light",
    html: root("tag", inner(media(img(), `<p class="profile__tag">%ROLE%</p>`), content(PRE, HEAD, BIO, ACT))),
    css: `${COLS.css}
          .profile__media { position: relative }
          ${PORTRAIT}
          .profile__tag { position: absolute; left: -16px; bottom: 32px; margin: 0; padding: 10px 18px; background: var(--accent-tag); color: var(--typography-tag); font-size: 12px; letter-spacing: 3px; text-transform: uppercase }`,
    responsive: `${COLS.responsive}
          @media (max-width: 768px) { .profile__tag { left: 0 } }`,
  }),

  profile({
    id: "boxed",
    name: "Bordered box",
    tone: "light",
    btn: "accent",
    html: root("boxed", inner(media(img()), content(NAME, ROLE, BIO, INFO, ACT))),
    css: `${twoCol({ gap: "56px" }).css}
          .profile__inner { padding: 48px; border: 1px solid ${LINE_ON_LIGHT} }
          ${PORTRAIT}`,
    responsive: `${COLS.responsive}
          @media (max-width: 768px) { .profile__inner { padding: 24px } }`,
  }),

  profile({
    id: "headline",
    name: "Headline first",
    tone: "light",
    html: root(
      "headline",
      inner(
        box("profile__header", PRE, HEAD),
        box("profile__columns", media(img()), content(BIO, INFO, ACT)),
      ),
    ),
    css: `.profile__inner { max-width: 1200px; margin-inline: auto }
          .profile__header { margin-bottom: 48px; padding-bottom: 32px; border-bottom: 1px solid ${LINE_ON_LIGHT} }
          .profile__title { margin: 0; font-size: 64px }
          .profile__columns { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 7fr); align-items: start; gap: 64px }
          ${PORTRAIT}`,
    responsive: `@media (max-width: 992px) { .profile__title { font-size: 44px } .profile__columns { grid-template-columns: 1fr; gap: 32px } .profile__media { width: 100%; max-width: 480px; margin-inline: auto } }`,
  }),

  profile({
    id: "business-card",
    name: "Business card",
    tone: "light",
    bg: DARK_BG,
    btn: "accent",
    html: root("business-card", inner(img("800x800"), content(NAME, ROLE, INFO, ACT))),
    css: `.profile__inner { max-width: 400px; margin-inline: auto; background: ${LIGHT_BG}; box-shadow: 0 24px 60px ${shade(0.35)}; text-align: center }
          .profile__image { aspect-ratio: 1 / 1 }
          .profile__content { padding: 36px 32px 40px }
          .profile__title { margin-bottom: 8px; font-size: 32px }`,
  }),

  profile({
    id: "slant",
    name: "Slanted photo edge",
    tone: "dark",
    pad: "0",
    padSm: "0",
    html: root("slant", inner(media(img("1000x1200")), content(PRE, HEAD, BIO, ACT))),
    css: `${HALF.css}
          .profile__media { order: 2 }
          .profile__image { clip-path: polygon(18% 0, 100% 0, 100% 100%, 0 100%) }
          .profile__content { justify-self: end }`,
    responsive: HALF.responsive,
  }),

  profile({
    id: "points",
    name: "Photo with highlights",
    tone: "light",
    html: root("points", inner(media(img()), content(PRE, HEAD, BIO, POINTS, ACT))),
    css: `${COLS.css}
          ${PORTRAIT}
          .profile__points { margin: 0 0 32px; padding: 0; color: ${DARK}; list-style: none }
          .profile__points li { position: relative; margin: 0 0 12px; padding-left: 30px }
          .profile__points li::before { content: ""; position: absolute; left: 0; top: 0.8em; width: 14px; height: 2px; background: ${ACCENT} }`,
    responsive: `${COLS.responsive}
          @media (max-width: 768px) { .profile__points { display: inline-block; text-align: left } }`,
  }),
];
