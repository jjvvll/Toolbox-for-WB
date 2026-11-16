// Content sections: layouts for the copy and photos a client sends over. The
// same layouts are built for every style set, in that set's type and buttons.
// Everything in them is a placeholder to replace.

import * as P from "./profiles";
import {
  ACCENT,
  CARD,
  HEADING_FONT,
  LIGHT,
  LIGHT_BG,
  LINE_ON_DARK,
  SOFT_ON_LIGHT,
  box,
  formatCss,
  shade,
  wrap,
  type Snippet,
} from "./shared";

// ---------- HTML pieces ----------

const PRE = `<p class="content-block__pretitle">Section Label</p>`;
const HEAD = `<h2 class="content-block__title">Your Headline Goes Here</h2>`;
const SUB = `<h3 class="content-block__subtitle">Subheading Goes Here</h3>`;
const LEAD = `<p class="content-block__lead">An opening sentence goes here, set larger to introduce the text that follows.</p>`;
const TEXT = `<p class="content-block__text">Paragraph text goes here. Replace it with the content the client provides, and add or remove paragraphs as needed.</p>`;
const MORE = `<p class="content-block__text">A second paragraph goes here. Keep each paragraph to a few sentences so the section stays easy to read.</p>`;
const SHORT = `<p class="content-block__text">A short description goes here, in two or three sentences.</p>`;
const LONG = `<p class="content-block__text">Paragraph text goes here. Replace it with the content the client provides. Longer copy suits this layout, because the text runs beside the image and then carries on at full width below it.</p>`;
const LONGER = `<p class="content-block__text">Another paragraph goes here. Add as many as the content needs; each one follows the last with the same spacing, so the section grows with the text.</p>`;
const LAST = `<p class="content-block__text">A closing paragraph goes here. Once the text passes the bottom of the image it uses the full width again, so a long piece of copy never leaves an empty gap beside it.</p>`;
const ACT = `<p class="content-block__actions"><a class="lp-btn button-style-2 content-block__btn" href="#"><span class="lp-btn__content">Button Text</span></a></p>`;
const POINTS = wrap(
  "ul",
  "content-block__points",
  `<li>First key point goes here</li>`,
  `<li>Second key point goes here</li>`,
  `<li>Third key point goes here</li>`,
  `<li>Fourth key point goes here</li>`,
);

const image = (size = "1200x900", modifier = "") =>
  `<img class="content-block__image${modifier}" src="https://placehold.co/${size}?text=Image" alt="Describe the image here" />`;

/** An image with a caption under it. */
const figure = (size = "1200x700", modifier = "") =>
  wrap(
    "figure",
    `content-block__figure${modifier}`,
    image(size),
    `<figcaption class="content-block__caption">Image caption goes here</figcaption>`,
  );

// Long layouts need many paragraphs; these take turns so neighbors differ.
const COPY = [
  "Paragraph text goes here. Replace it with the content the client provides, and add or remove paragraphs as needed.",
  "A second paragraph goes here. Keep each paragraph to a few sentences so the section stays easy to read.",
  "Another paragraph goes here. Add as many as the content needs; each one follows the last with the same spacing, so the section grows with the text.",
  "More paragraph text goes here. Long copy reads best when it is broken up with a subheading, an image or a quote every few paragraphs.",
  "Keep going with the next paragraph here. Links, bold text and lists can be used inside the text wherever the content calls for them.",
  "A closing paragraph goes here. End on the point the reader should remember, or lead into the button below.",
];
/** `count` placeholder paragraphs, starting `from` a point in the cycle. */
const paras = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => `<p class="content-block__text">${COPY[(from + i) % COPY.length]}</p>`);

const root = (name: string, ...children: string[]) => box(`content-block content-block--${name}`, ...children);
const part = (name: string) => (...children: string[]) => box(`content-block__${name}`, ...children);
const inner = part("inner");
const header = part("header");
const body = part("body");
const media = part("media");
const columns = part("columns");

// ---------- CSS pieces ----------

/** What each style set adds to the type it shares with its profiles. */
const EXTRAS: Record<P.Look, { subtitle: string; lead: string; quote: string; radius: string }> = {
  normal: {
    subtitle: "font-size: 21px; font-weight: 600 !important; line-height: 1.3",
    lead: "font-size: 20px; line-height: 1.6",
    quote: "font-size: 34px; font-style: italic; line-height: 1.4",
    radius: "",
  },
  luxe: {
    subtitle: "font-size: 20px; font-weight: 300 !important; line-height: 1.4; letter-spacing: 1.5px",
    lead: `font-family: ${HEADING_FONT}; font-size: 22px; font-style: italic; line-height: 1.6`,
    quote: "font-size: 34px; font-style: italic; font-weight: 300; line-height: 1.5; letter-spacing: 1px",
    radius: "",
  },
  modern: {
    subtitle: "font-size: 21px; font-weight: 600 !important; line-height: 1.3; letter-spacing: -0.2px",
    lead: "font-size: 20px; font-weight: 500; line-height: 1.55",
    quote: "font-size: 34px; font-weight: 500; line-height: 1.35; letter-spacing: -0.3px",
    radius: "20px",
  },
  bold: {
    subtitle: "font-size: 20px; font-weight: 700 !important; line-height: 1.2; letter-spacing: 0.5px; text-transform: uppercase !important",
    lead: "font-size: 21px; font-weight: 700; line-height: 1.5",
    quote: "font-size: 34px; font-weight: 700; line-height: 1.2; text-transform: uppercase",
    radius: "",
  },
};

/** The colors a layout draws its own details in, for its tone and style. */
type Colors = {
  ink: string;
  line: string;
  /** The small-accent color: rules, numbers and check marks. */
  mark: string;
  /** Rounded corners for photos and cards, in the styles that have them. Appended to a rule. */
  round: string;
};

type Layout = {
  id: string;
  name: string;
  /** Made for several paragraphs of copy, rather than a short block. */
  long?: boolean;
  /** Which background and text colors the copy sits on. */
  tone: P.Tone;
  /** Background of the full-width wrapper, when it differs from the tone's. */
  bg?: string;
  /** Wrapper padding on desktop and on phones. Defaults to the style's own. */
  pad?: string;
  padSm?: string;
  /** Extra declarations for the wrapper. */
  wrapper?: string;
  /** In the Normal style, use the filled button rather than the outlined one. */
  filled?: boolean;
  /** A part of the layout stays in view while the rest scrolls past it. */
  sticky?: boolean;
  html: string;
  /** Layout rules, then the rules for smaller screens. */
  css: (colors: Colors) => string;
  responsive?: string;
};

function build(layout: Layout, lookId: P.Look): Snippet {
  const { id, name, html, tone } = layout;
  const look = P.LOOKS[lookId];
  const extra = EXTRAS[lookId];
  const { bg, ink, line, inverse } = P.TONES[tone];
  // As in the profiles: on the card color, accents and filled buttons use the text color.
  const mark = tone === "card" ? ink : ACCENT;
  const solid = tone === "card" ? { bg: ink, text: inverse } : { bg: ACCENT, text: LIGHT };
  const btn = lookId === "normal" && layout.filled ? "accent" : look.btn;
  const round = extra.radius ? `; border-radius: ${extra.radius}` : "";
  const has = (name: string) => html.includes(`content-block__${name}`);
  const rules = [
    // `hidden` would turn the section into a scrolling box, which stops anything inside
    // it from sticking to the screen; `clip` trims the overflow without doing that.
    `section { padding-top: 0 !important; padding-bottom: 0 !important; overflow-x: ${layout.sticky ? "clip" : "hidden"} }`,
    `.content-block { width: 100vw; margin-left: calc(50% - 50vw); padding: ${layout.pad ?? look.pad}; background: ${layout.bg ?? bg}; color: ${ink}; text-align: left; white-space: normal${layout.wrapper ? `; ${layout.wrapper}` : ""} }`,
    has("image") && `.content-block__image { display: block; width: 100%; height: auto; object-fit: cover }`,
    has("figure") && `.content-block__figure { margin: 0 }`,
    has("caption") && `.content-block__caption { margin-top: 12px; color: ${ink}; font-size: 13px; line-height: 1.5; opacity: 0.7 }`,
    has("pretitle") && `.content-block__pretitle { ${look.pretitle({ ink, line, mark })} }`,
    has("title") && `.content-block__title { margin: 0 0 ${look.titleGap}; color: ${ink}; ${look.title} }`,
    has("subtitle") && `.content-block__subtitle { margin: 0 0 10px; color: ${ink}; ${extra.subtitle} }`,
    has("lead") && `.content-block__lead { margin: 0 0 20px; color: ${ink}; ${extra.lead} }`,
    has("text") &&
      `.content-block__text { margin: 0 0 16px; color: ${ink}; ${look.bio.rest} }
       .content-block__text:last-child { margin-bottom: 0 }`,
    has("quote") && `.content-block__quote { margin: 0 0 32px; color: ${ink}; font-family: ${HEADING_FONT}; ${extra.quote} }`,
    // The paragraph above the button already leaves 16px.
    has("actions") && `.content-block__actions { margin: ${parseInt(look.bio.gap) - 4}px 0 0 }`,
    layout.css({ ink, line, mark, round }),
    has("btn") && `/* Button */`,
    has("btn") && P.buttonCss(`.content-block__btn`, btn, { ink, inverse, solid }),
    `/* Smaller screens */`,
    layout.responsive,
    `@media (max-width: 768px) { .content-block { padding: ${layout.padSm ?? look.padSm} } ${has("title") ? `.content-block__title { font-size: ${look.titleSm} }` : ""} ${has("lead") ? `.content-block__lead { font-size: 18px }` : ""} ${has("quote") ? `.content-block__quote { font-size: 24px }` : ""} ${has("btn") ? `.content-block__btn { width: 100% }` : ""} }`,
  ];
  return {
    id,
    name,
    html,
    css: formatCss(rules.filter(Boolean).join("\n")),
    length: layout.long ? "long" : "short",
    extraButton: has("btn")
      ? P.secondButton(
          "content-block",
          `<a class="lp-btn button-style-2 content-block__btn content-block__btn--alt" href="#"><span class="lp-btn__content">Second Button</span></a>`,
          btn,
          { ink, inverse, solid },
        )
      : undefined,
  };
}

const INNER = (width = "1200px") => `.content-block__inner { max-width: ${width}; margin-inline: auto }`;
/** Two equal columns that stack on tablets. */
const HALVES = {
  css: `.content-block__inner { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 72px; max-width: 1200px; margin-inline: auto }`,
  responsive: `@media (max-width: 992px) { .content-block__inner { grid-template-columns: 1fr; gap: 40px } }`,
};
const HEADER_CENTERED = `.content-block__header { max-width: 760px; margin: 0 auto 56px; text-align: center }
  .content-block__title { margin: 0 }`;

/** Room above a subheading that follows paragraphs. */
const SUB_SPACED = `.content-block__text + .content-block__subtitle { margin-top: 36px }`;
/** Paragraphs that run down one column and carry on in the next, however many there are. */
const FLOW = (line: string) => `.content-block__flow { columns: 2; column-gap: 64px; column-rule: 1px solid ${line} }
  .content-block__flow .content-block__text { break-inside: avoid }`;

/** A question that opens to show its answer, without any script. */
const ENTRY = wrap(
  "details",
  "content-block__entry",
  `<summary class="content-block__question"><h3 class="content-block__subtitle">Question Or Topic Goes Here</h3></summary>`,
  `<p class="content-block__text">${COPY[0]}</p>`,
);
const DATE = `<p class="content-block__date">Year</p>`;

// ---------- Text only ----------

const TEXT_LAYOUTS: Layout[] = [
  {
    id: "centered",
    name: "Centered headline and text",
    tone: "light",
    html: root("centered", inner(PRE, HEAD, TEXT, MORE, ACT)),
    css: () => `.content-block__inner { max-width: 760px; margin-inline: auto; text-align: center }`,
  },

  {
    id: "article",
    name: "Left-aligned with a large intro",
    tone: "light",
    filled: true,
    html: root("article", inner(HEAD, LEAD, TEXT, MORE, ACT)),
    css: ({ line }) => `${INNER("820px")}
      .content-block__title { margin-bottom: 28px; padding-bottom: 28px; border-bottom: 1px solid ${line} }`,
  },

  {
    id: "split",
    name: "Headline left, text right",
    tone: "light",
    html: root("split", inner(header(PRE, HEAD), body(TEXT, MORE, ACT))),
    css: () => `.content-block__inner { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); align-items: start; gap: 72px; max-width: 1200px; margin-inline: auto }
      .content-block__title { margin: 0 }`,
    responsive: `@media (max-width: 992px) { .content-block__inner { grid-template-columns: 1fr; gap: 24px } }`,
  },

  {
    id: "two-columns",
    name: "Headline over two text columns",
    tone: "dark",
    filled: true,
    html: root(
      "two-columns",
      inner(header(PRE, HEAD), columns(part("column")(TEXT, MORE), part("column")(TEXT, MORE)), ACT),
    ),
    css: ({ line }) => `${INNER()}
      ${HEADER_CENTERED}
      .content-block__columns { display: grid; grid-template-columns: 1fr 1fr; gap: 56px }
      .content-block__column + .content-block__column { padding-left: 56px; border-left: 1px solid ${line} }
      .content-block__actions { margin-top: 48px; text-align: center }`,
    responsive: `@media (max-width: 768px) { .content-block__header { margin-bottom: 32px } .content-block__columns { grid-template-columns: 1fr; gap: 16px } .content-block__column + .content-block__column { padding-left: 0; border-left: 0 } .content-block__actions { margin-top: 32px } }`,
  },

  {
    id: "three-columns",
    name: "Three columns with subheadings",
    tone: "light",
    html: root(
      "three-columns",
      inner(
        header(PRE, HEAD),
        columns(part("item")(SUB, SHORT), part("item")(SUB, SHORT), part("item")(SUB, SHORT)),
      ),
    ),
    css: ({ mark }) => `${INNER()}
      .content-block__header { max-width: 760px; margin-bottom: 56px }
      .content-block__title { margin: 0 }
      .content-block__columns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px }
      .content-block__item { padding-top: 28px; border-top: 2px solid ${mark} }`,
    responsive: `@media (max-width: 768px) { .content-block__header { margin-bottom: 36px } .content-block__columns { grid-template-columns: 1fr; gap: 32px } }`,
  },

  {
    id: "quote",
    name: "Pull quote",
    tone: "card",
    html: root(
      "quote",
      inner(
        `<p class="content-block__quote">A quote or key statement goes here, in one or two sentences.</p>`,
        `<p class="content-block__source">Name Or Source</p>`,
      ),
    ),
    css: ({ ink, mark }) => `.content-block__inner { max-width: 900px; margin-inline: auto; text-align: center }
      .content-block__source { margin: 0; color: ${ink}; font-size: 12px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase }
      .content-block__source::before { content: ""; display: block; width: 48px; height: 2px; margin: 0 auto 20px; background: ${mark} }`,
  },

  {
    id: "checklist",
    name: "Text with a checklist",
    tone: "light",
    filled: true,
    html: root("checklist", inner(body(PRE, HEAD, TEXT, ACT), POINTS)),
    css: ({ ink, line, mark }) => `${HALVES.css}
      .content-block__points { margin: 0; padding: 0; color: ${ink}; list-style: none }
      .content-block__points li { position: relative; margin: 0; padding: 18px 0 18px 40px; border-bottom: 1px solid ${line}; font-size: 17px; line-height: 1.5 }
      .content-block__points li:first-child { border-top: 1px solid ${line} }
      .content-block__points li::before { content: ""; position: absolute; left: 6px; top: 22px; width: 7px; height: 13px; border: solid ${mark}; border-width: 0 2px 2px 0; transform: rotate(45deg) }`,
    responsive: HALVES.responsive,
  },

  {
    id: "steps",
    name: "Numbered steps",
    tone: "dark",
    html: root(
      "steps",
      inner(
        header(PRE, HEAD),
        wrap(
          "ol",
          "content-block__steps",
          wrap("li", "content-block__step", SUB, SHORT),
          wrap("li", "content-block__step", SUB, SHORT),
          wrap("li", "content-block__step", SUB, SHORT),
        ),
      ),
    ),
    css: ({ mark }) => `${INNER()}
      ${HEADER_CENTERED}
      .content-block__steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 48px; margin: 0; padding: 0; list-style: none; counter-reset: step }
      .content-block__step { margin: 0; counter-increment: step }
      .content-block__step::before { content: counter(step, decimal-leading-zero); display: block; margin-bottom: 16px; color: ${mark}; font-family: ${HEADING_FONT}; font-size: 52px; line-height: 1 }`,
    responsive: `@media (max-width: 768px) { .content-block__header { margin-bottom: 36px } .content-block__steps { grid-template-columns: 1fr; gap: 36px } }`,
  },

  {
    id: "boxed",
    name: "Centered card",
    tone: "card",
    bg: LIGHT_BG,
    html: root("boxed", part("card")(PRE, HEAD, TEXT, ACT)),
    css: ({ line, round }) =>
      `.content-block__card { max-width: 860px; margin-inline: auto; padding: 64px 72px; background: ${CARD}; border: 1px solid ${line}; box-shadow: 0 24px 60px ${shade(0.15)}; text-align: center${round} }`,
    responsive: `@media (max-width: 768px) { .content-block__card { padding: 40px 24px } }`,
  },

  {
    id: "rows",
    name: "Subheadings in rows",
    tone: "light",
    html: root(
      "rows",
      inner(header(PRE, HEAD), part("row")(SUB, TEXT), part("row")(SUB, TEXT), part("row")(SUB, TEXT)),
    ),
    css: ({ line }) => `${INNER()}
      .content-block__header { max-width: 760px; margin-bottom: 48px }
      .content-block__title { margin: 0 }
      .content-block__row { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 8fr); gap: 40px; padding: 32px 0; border-top: 1px solid ${line} }
      .content-block__row:last-child { border-bottom: 1px solid ${line} }
      .content-block__subtitle { margin: 0 }`,
    responsive: `@media (max-width: 768px) { .content-block__header { margin-bottom: 32px } .content-block__row { grid-template-columns: 1fr; gap: 10px; padding: 24px 0 } }`,
  },

  // Long copy: several paragraphs, broken up with subheadings.

  {
    id: "long-article",
    name: "Long article with subheadings",
    long: true,
    tone: "light",
    html: root(
      "long-article",
      inner(PRE, HEAD, LEAD, ...paras(2), SUB, ...paras(2, 2), SUB, ...paras(2, 4), ACT),
    ),
    css: () => `${INNER("780px")}
      ${SUB_SPACED}`,
  },

  {
    id: "sticky-heading",
    name: "Headline stays in view beside long text",
    long: true,
    tone: "dark",
    filled: true,
    sticky: true,
    html: root(
      "sticky-heading",
      inner(header(PRE, HEAD, ACT), body(...paras(2), SUB, ...paras(2, 2), SUB, ...paras(2, 4))),
    ),
    css: () => `.content-block__inner { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 7fr); align-items: start; gap: 80px; max-width: 1200px; margin-inline: auto }
      .content-block__header { position: sticky; top: 96px }
      ${SUB_SPACED}`,
    responsive: `@media (max-width: 992px) { .content-block__inner { grid-template-columns: 1fr; gap: 40px } .content-block__header { position: static } }`,
  },

  {
    id: "flow-columns",
    name: "Long text flowing in two columns",
    long: true,
    tone: "light",
    html: root("flow-columns", inner(header(PRE, HEAD), part("flow")(...paras(6)))),
    css: ({ line }) => `${INNER()}
      .content-block__header { max-width: 760px; margin-bottom: 48px }
      .content-block__title { margin: 0 }
      ${FLOW(line)}`,
    responsive: `@media (max-width: 768px) { .content-block__header { margin-bottom: 32px } .content-block__flow { columns: 1 } }`,
  },

  {
    id: "article-quote",
    name: "Article with a pull quote",
    long: true,
    tone: "light",
    filled: true,
    html: root(
      "article-quote",
      inner(
        HEAD,
        ...paras(2),
        `<p class="content-block__quote">A quote or key statement goes here, in one or two sentences.</p>`,
        ...paras(3, 2),
        ACT,
      ),
    ),
    css: ({ mark }) => `${INNER("780px")}
      .content-block__quote { margin: 40px 0; padding-left: 32px; border-left: 3px solid ${mark}; font-size: 28px }`,
    responsive: `@media (max-width: 768px) { .content-block__quote { margin: 32px 0; padding-left: 20px } }`,
  },

  {
    id: "sidebar",
    name: "Long text with a side box",
    long: true,
    tone: "light",
    html: root(
      "sidebar",
      inner(body(PRE, HEAD, ...paras(4)), wrap("aside", "content-block__aside", SUB, POINTS, ACT)),
    ),
    css: ({ ink, line, round }) => `.content-block__inner { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 4fr); align-items: start; gap: 72px; max-width: 1200px; margin-inline: auto }
      .content-block__aside { padding: 36px; background: ${SOFT_ON_LIGHT}${round} }
      .content-block__points { margin: 0; padding: 0; color: ${ink}; list-style: none }
      .content-block__points li { margin: 0; padding: 12px 0; border-top: 1px solid ${line}; line-height: 1.5 }`,
    responsive: `@media (max-width: 992px) { .content-block__inner { grid-template-columns: 1fr; gap: 40px } }
      @media (max-width: 768px) { .content-block__aside { padding: 28px 24px } }`,
  },

  {
    id: "accordion",
    name: "Questions that open and close",
    long: true,
    tone: "light",
    html: root(
      "accordion",
      inner(header(PRE, HEAD), part("list")(ENTRY.replace("<details", "<details open"), ENTRY, ENTRY, ENTRY)),
    ),
    css: ({ line, mark }) => `${INNER("900px")}
      .content-block__header { margin-bottom: 40px; text-align: center }
      .content-block__title { margin: 0 }
      .content-block__entry { border-bottom: 1px solid ${line} }
      .content-block__entry:first-child { border-top: 1px solid ${line} }
      .content-block__question { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 22px 0; list-style: none; cursor: pointer }
      .content-block__question::-webkit-details-marker { display: none }
      .content-block__question::after { content: "+"; flex-shrink: 0; color: ${mark}; font-size: 28px; font-weight: 300; line-height: 1 }
      .content-block__entry[open] .content-block__question::after { content: "−" }
      .content-block__subtitle { margin: 0 }
      .content-block__entry .content-block__text { margin: 0; padding: 0 48px 26px 0 }`,
    responsive: `@media (max-width: 768px) { .content-block__header { margin-bottom: 28px } .content-block__entry .content-block__text { padding-right: 0 } }`,
  },
];

// ---------- Text and image ----------

const IMAGE_LAYOUTS: Layout[] = [
  {
    id: "image-left",
    name: "Image left, text right",
    tone: "light",
    html: root("image-left", inner(media(image()), body(PRE, HEAD, TEXT, MORE, ACT))),
    css: ({ round }) => `${HALVES.css}
      .content-block__image { aspect-ratio: 4 / 3${round} }`,
    responsive: HALVES.responsive,
  },

  {
    id: "image-right",
    name: "Image right, text left",
    tone: "dark",
    filled: true,
    html: root("image-right", inner(media(image()), body(PRE, HEAD, TEXT, MORE, ACT))),
    css: ({ round }) => `${HALVES.css}
      .content-block__media { order: 2 }
      .content-block__image { aspect-ratio: 4 / 3${round} }`,
    responsive: `@media (max-width: 992px) { .content-block__inner { grid-template-columns: 1fr; gap: 40px } .content-block__media { order: 0 } }`,
  },

  {
    id: "image-top",
    name: "Wide image above centered text",
    tone: "light",
    html: root("image-top", inner(image("1600x700"), body(PRE, HEAD, TEXT, ACT))),
    css: ({ round }) => `${INNER()}
      .content-block__image { aspect-ratio: 16 / 7; margin-bottom: 48px${round} }
      .content-block__body { max-width: 760px; margin-inline: auto; text-align: center }`,
    responsive: `@media (max-width: 768px) { .content-block__image { aspect-ratio: 3 / 2; margin-bottom: 32px } }`,
  },

  {
    id: "half",
    name: "Half-screen image",
    tone: "light",
    pad: "0",
    padSm: "0",
    filled: true,
    html: root("half", inner(media(image("1000x1200")), body(PRE, HEAD, TEXT, MORE, ACT))),
    css: () => `.content-block__inner { display: grid; grid-template-columns: 1fr 1fr }
      .content-block__media { position: relative; min-height: 620px; order: 2 }
      .content-block__image { position: absolute; inset: 0; height: 100% }
      .content-block__body { align-self: center; justify-self: end; max-width: 640px; padding: 96px 72px }`,
    responsive: `@media (max-width: 992px) { .content-block__inner { grid-template-columns: 1fr } .content-block__media { min-height: 0; order: 0 } .content-block__image { position: static; height: auto; aspect-ratio: 4 / 3 } .content-block__body { justify-self: stretch; max-width: none; padding: 64px 20px } }`,
  },

  {
    id: "overlay",
    name: "Text over a full-width image",
    tone: "dark",
    pad: "140px 20px",
    padSm: "96px 20px",
    wrapper: "position: relative; overflow: hidden",
    html: root("overlay", media(image("1600x900")), inner(PRE, HEAD, TEXT, ACT)),
    css: () => `.content-block__media { position: absolute; inset: 0 }
      .content-block__media::after { content: ""; position: absolute; inset: 0; background: ${shade(0.6)} }
      .content-block__image { height: 100% }
      .content-block__inner { position: relative; max-width: 760px; margin-inline: auto; text-align: center }
      .content-block__pretitle { color: ${LIGHT} }`,
  },

  {
    id: "card-overlap",
    name: "Text card overlapping the image",
    tone: "card",
    bg: LIGHT_BG,
    html: root("card-overlap", inner(media(image()), part("card")(PRE, HEAD, TEXT, ACT))),
    css: ({ round }) => `.content-block__inner { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); align-items: center; max-width: 1200px; margin-inline: auto }
      .content-block__image { aspect-ratio: 4 / 3${round} }
      .content-block__card { position: relative; margin-left: -120px; padding: 56px 48px; background: ${CARD}; box-shadow: 0 24px 60px ${shade(0.2)}${round} }`,
    responsive: `@media (max-width: 992px) { .content-block__inner { grid-template-columns: 1fr } .content-block__card { margin: -48px 20px 0; padding: 40px 28px } }`,
  },

  {
    id: "collage",
    name: "Two images beside the text",
    tone: "light",
    filled: true,
    html: root(
      "collage",
      inner(
        body(PRE, HEAD, TEXT, MORE, ACT),
        media(image("800x1000"), image("600x600", " content-block__image--small")),
      ),
    ),
    css: ({ round }) => `${HALVES.css}
      .content-block__media { position: relative; padding: 0 22% 48px 0 }
      .content-block__image { aspect-ratio: 4 / 5${round} }
      .content-block__image--small { position: absolute; right: 0; bottom: 0; width: 46%; aspect-ratio: 1 / 1; border: 8px solid ${LIGHT_BG} }`,
    responsive: `@media (max-width: 992px) { .content-block__inner { grid-template-columns: 1fr; gap: 40px } .content-block__media { width: 100%; max-width: 520px; margin-inline: auto } }`,
  },

  {
    id: "wrap",
    name: "Text wrapping around an image",
    long: true,
    tone: "light",
    html: root("wrap", inner(HEAD, image("1000x800", " content-block__image--float"), LONG, LONGER, MORE, LAST, ACT)),
    css: ({ round }) => `${INNER("940px")}
      .content-block__inner::after { content: ""; display: block; clear: both }
      .content-block__image--float { float: right; width: 40%; margin: 6px 0 24px 48px; aspect-ratio: 5 / 4${round} }`,
    responsive: `@media (max-width: 768px) { .content-block__image--float { float: none; width: 100%; margin: 0 0 24px; aspect-ratio: 3 / 2 } }`,
  },

  {
    id: "cards",
    name: "Three image cards",
    tone: "dark",
    html: root(
      "cards",
      inner(
        header(PRE, HEAD),
        part("cards")(
          part("item")(image("800x600"), SUB, SHORT),
          part("item")(image("800x600"), SUB, SHORT),
          part("item")(image("800x600"), SUB, SHORT),
        ),
      ),
    ),
    css: ({ round }) => `${INNER()}
      ${HEADER_CENTERED}
      .content-block__cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 36px }
      .content-block__image { aspect-ratio: 4 / 3; margin-bottom: 24px${round} }`,
    responsive: `@media (max-width: 768px) { .content-block__header { margin-bottom: 36px } .content-block__cards { grid-template-columns: 1fr; gap: 40px; max-width: 480px; margin-inline: auto } }`,
  },

  {
    id: "alternating",
    name: "Alternating image and text rows",
    tone: "light",
    html: root(
      "alternating",
      inner(part("row")(media(image()), body(HEAD, TEXT, ACT)), part("row")(media(image()), body(HEAD, TEXT, ACT))),
    ),
    css: ({ round }) => `${INNER()}
      .content-block__row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 72px }
      .content-block__row + .content-block__row { margin-top: 80px }
      .content-block__row:nth-child(even) .content-block__media { order: 2 }
      .content-block__image { aspect-ratio: 3 / 2${round} }
      .content-block__title { font-size: 36px }`,
    responsive: `@media (max-width: 992px) { .content-block__row { grid-template-columns: 1fr; gap: 32px } .content-block__row + .content-block__row { margin-top: 56px } .content-block__row:nth-child(even) .content-block__media { order: 0 } }`,
  },

  // Long copy: several paragraphs with images set among them.

  {
    id: "article-lead",
    name: "Article under a lead image",
    long: true,
    tone: "light",
    html: root(
      "article-lead",
      inner(image("1600x800"), body(PRE, HEAD, LEAD, ...paras(2), SUB, ...paras(2, 2), ACT)),
    ),
    css: ({ round }) => `${INNER("1000px")}
      .content-block__image { aspect-ratio: 2 / 1; margin-bottom: 56px${round} }
      .content-block__body { max-width: 760px; margin-inline: auto }
      ${SUB_SPACED}`,
    responsive: `@media (max-width: 768px) { .content-block__image { aspect-ratio: 3 / 2; margin-bottom: 32px } }`,
  },

  {
    id: "article-inline",
    name: "Article with images between paragraphs",
    long: true,
    tone: "light",
    filled: true,
    html: root(
      "article-inline",
      inner(HEAD, ...paras(2), figure(), ...paras(2, 2), figure(), ...paras(2, 4), ACT),
    ),
    css: ({ round }) => `${INNER("780px")}
      .content-block__figure { margin: 36px 0 }
      .content-block__image { aspect-ratio: 12 / 7${round} }`,
  },

  {
    id: "article-breakout",
    name: "Article with images wider than the text",
    long: true,
    tone: "light",
    html: root(
      "article-breakout",
      inner(
        PRE,
        HEAD,
        ...paras(2),
        figure("1600x800", " content-block__figure--wide"),
        ...paras(2, 2),
        part("pair")(image("900x700"), image("900x700")),
        ...paras(2, 4),
      ),
    ),
    // The wide blocks reach 1100px, or the screen's width less its 20px gutters.
    css: ({ round }) => `${INNER("760px")}
      .content-block__figure--wide, .content-block__pair { margin: 48px calc(50% - min(550px, 50vw - 20px)) }
      .content-block__figure--wide .content-block__image { aspect-ratio: 2 / 1 }
      .content-block__pair { display: grid; grid-template-columns: 1fr 1fr; gap: 24px }
      .content-block__image { aspect-ratio: 9 / 7${round} }`,
    responsive: `@media (max-width: 768px) { .content-block__figure--wide, .content-block__pair { margin-block: 32px } .content-block__pair { gap: 12px } }`,
  },

  {
    id: "float-both",
    name: "Images set left and right in the text",
    long: true,
    tone: "light",
    html: root(
      "float-both",
      inner(
        HEAD,
        LEAD,
        image("900x700", " content-block__image--left"),
        ...paras(3),
        image("900x700", " content-block__image--right"),
        ...paras(3, 3),
        ACT,
      ),
    ),
    // The two images and their gaps are wider than the column together, so no line of
    // text can end up squeezed into the space between them.
    css: ({ round }) => `${INNER("1040px")}
      .content-block__inner::after { content: ""; display: block; clear: both }
      .content-block__image { width: 46%; aspect-ratio: 9 / 7${round} }
      .content-block__image--left { float: left; margin: 6px 44px 20px 0 }
      .content-block__image--right { float: right; clear: left; margin: 6px 0 20px 44px }`,
    responsive: `@media (max-width: 768px) { .content-block__image { float: none; width: 100%; margin: 8px 0 24px } }`,
  },

  {
    id: "sticky-image",
    name: "Image stays in view beside long text",
    long: true,
    tone: "light",
    filled: true,
    sticky: true,
    html: root(
      "sticky-image",
      inner(
        media(image("1000x1200")),
        body(PRE, HEAD, ...paras(2), SUB, ...paras(2, 2), SUB, ...paras(2, 4), ACT),
      ),
    ),
    css: ({ round }) => `.content-block__inner { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); align-items: start; gap: 72px; max-width: 1200px; margin-inline: auto }
      .content-block__media { position: sticky; top: 96px }
      .content-block__image { aspect-ratio: 4 / 5${round} }
      ${SUB_SPACED}`,
    responsive: `@media (max-width: 992px) { .content-block__inner { grid-template-columns: 1fr; gap: 40px } .content-block__media { position: static } .content-block__image { aspect-ratio: 3 / 2 } }`,
  },

  {
    id: "side-images",
    name: "Long text beside a column of images",
    long: true,
    tone: "dark",
    html: root(
      "side-images",
      inner(
        body(PRE, HEAD, ...paras(3), SUB, ...paras(3, 3), ACT),
        media(figure("900x600"), figure("900x600"), figure("900x600")),
      ),
    ),
    css: ({ round }) => `.content-block__inner { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 4fr); align-items: start; gap: 72px; max-width: 1200px; margin-inline: auto }
      .content-block__media { display: grid; gap: 28px }
      .content-block__image { aspect-ratio: 3 / 2${round} }
      ${SUB_SPACED}`,
    responsive: `@media (max-width: 992px) { .content-block__inner { grid-template-columns: 1fr; gap: 48px } .content-block__media { grid-template-columns: repeat(3, 1fr); gap: 16px } }
      @media (max-width: 768px) { .content-block__media { grid-template-columns: 1fr; gap: 24px } }`,
  },

  {
    id: "gallery-below",
    name: "Two text columns above a row of images",
    long: true,
    tone: "light",
    html: root(
      "gallery-below",
      inner(
        header(PRE, HEAD),
        part("flow")(...paras(4)),
        part("gallery")(image("800x800"), image("800x800"), image("800x800"), image("800x800")),
      ),
    ),
    css: ({ line, round }) => `${INNER()}
      .content-block__header { max-width: 760px; margin-bottom: 40px }
      .content-block__title { margin: 0 }
      ${FLOW(line)}
      .content-block__gallery { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 56px }
      .content-block__image { aspect-ratio: 1 / 1${round} }`,
    responsive: `@media (max-width: 768px) { .content-block__header { margin-bottom: 28px } .content-block__flow { columns: 1 } .content-block__gallery { grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 40px } }`,
  },

  {
    id: "chapters",
    name: "Numbered chapters, each with an image",
    long: true,
    tone: "light",
    html: root(
      "chapters",
      inner(
        header(PRE, HEAD),
        part("chapter")(media(image("900x700")), body(SUB, ...paras(2))),
        part("chapter")(media(image("900x700")), body(SUB, ...paras(2, 2))),
        part("chapter")(media(image("900x700")), body(SUB, ...paras(2, 4))),
      ),
    ),
    css: ({ line, mark, round }) => `${INNER()}
      .content-block__inner { counter-reset: chapter }
      .content-block__header { max-width: 760px; margin-bottom: 48px }
      .content-block__title { margin: 0 }
      .content-block__chapter { display: grid; grid-template-columns: 72px minmax(0, 4fr) minmax(0, 6fr); align-items: start; gap: 40px; padding: 48px 0; border-top: 1px solid ${line}; counter-increment: chapter }
      .content-block__chapter:last-child { padding-bottom: 0 }
      .content-block__chapter::before { content: counter(chapter, decimal-leading-zero); color: ${mark}; font-family: ${HEADING_FONT}; font-size: 40px; line-height: 1 }
      .content-block__image { aspect-ratio: 9 / 7${round} }`,
    responsive: `@media (max-width: 992px) { .content-block__chapter { grid-template-columns: 48px minmax(0, 1fr); gap: 24px } .content-block__chapter::before { font-size: 30px } .content-block__body { grid-column: 2 } }
      @media (max-width: 768px) { .content-block__header { margin-bottom: 32px } .content-block__chapter { grid-template-columns: 1fr; gap: 20px; padding: 36px 0 } .content-block__body { grid-column: auto } }`,
  },

  {
    id: "timeline",
    name: "Story timeline with images",
    long: true,
    tone: "dark",
    html: root(
      "timeline",
      inner(
        header(PRE, HEAD),
        part("entry")(DATE, body(SUB, ...paras(2)), media(image("900x600"))),
        part("entry")(DATE, body(SUB, ...paras(2, 2)), media(image("900x600"))),
        part("entry")(DATE, body(SUB, ...paras(2, 4)), media(image("900x600"))),
      ),
    ),
    css: ({ ink, line, mark, round }) => `${INNER()}
      ${HEADER_CENTERED}
      .content-block__entry { display: grid; grid-template-columns: 130px minmax(0, 1fr) minmax(0, 340px); column-gap: 40px }
      .content-block__date { margin: 0; color: ${ink}; font-family: ${HEADING_FONT}; font-size: 24px; line-height: 1.3 }
      .content-block__body { position: relative; padding: 0 0 56px 48px; border-left: 1px solid ${line} }
      .content-block__body::before { content: ""; position: absolute; left: -6px; top: 8px; width: 11px; height: 11px; border-radius: 50%; background: ${mark} }
      .content-block__media { padding-bottom: 56px }
      .content-block__entry:last-child .content-block__body, .content-block__entry:last-child .content-block__media { padding-bottom: 0 }
      .content-block__image { aspect-ratio: 3 / 2${round} }`,
    responsive: `@media (max-width: 992px) { .content-block__entry { grid-template-columns: 100px minmax(0, 1fr) } .content-block__body, .content-block__entry:last-child .content-block__body { padding-bottom: 24px } .content-block__media { grid-column: 2; padding-left: 48px; border-left: 1px solid ${LINE_ON_DARK} } }
      @media (max-width: 768px) { .content-block__header { margin-bottom: 36px } .content-block__entry { grid-template-columns: 1fr } .content-block__date { margin-bottom: 14px } .content-block__body, .content-block__media { grid-column: auto; padding-left: 24px } }`,
  },

  {
    id: "mosaic",
    name: "Long text beside three images",
    long: true,
    tone: "light",
    html: root(
      "mosaic",
      inner(
        part("mosaic")(image("900x1200", " content-block__image--tall"), image("800x600"), image("800x600")),
        body(PRE, HEAD, ...paras(4), ACT),
      ),
    ),
    css: ({ round }) => `${HALVES.css}
      .content-block__mosaic { display: grid; grid-template-columns: 1fr 1fr; gap: 16px }
      .content-block__image { aspect-ratio: 4 / 3${round} }
      .content-block__image--tall { grid-row: span 2; height: 100%; aspect-ratio: auto }`,
    responsive: HALVES.responsive,
  },
];

/** The text-only and text-with-image layouts, in one style set's look. */
export function contentSections(look: P.Look): { text: Snippet[]; media: Snippet[] } {
  return {
    text: TEXT_LAYOUTS.map((layout) => build(layout, look)),
    media: IMAGE_LAYOUTS.map((layout) => build(layout, look)),
  };
}
