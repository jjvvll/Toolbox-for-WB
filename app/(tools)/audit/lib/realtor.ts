// REALTOR® is a trademark: it's written in capitals with the ® right after it
// ("REALTOR®", "REALTORS®", "REALTOR-ASSOCIATE®"). Anything else is flagged:
// "Realtor", "realtors", "REALTOR" without ®, "REALTOR ®", "REALTOR(R)", "REALTOR™", "REALTOR®s".
// Checked in the browser, so it costs nothing and doesn't wait for the spelling check.

import type { SpellHit } from "./store";

const WORD = /realtors?(?:-associates?)?/gi;

/** Every REALTOR in the text that isn't written as REALTOR®. Skips realtor.com and other URLs/emails. */
export function realtorIssues(text: string): SpellHit[] {
  const out: SpellHit[] = [];
  for (const m of text.matchAll(WORD)) {
    const start = m.index;
    let end = start + m[0].length;
    const before = text[start - 1] ?? "";
    const after = text.slice(end);
    // Part of a longer word, a URL, an email or a domain (realtor.com, nar.realtor).
    if (/[\p{L}\p{N}_@./\\-]/u.test(before) || /^[\p{L}\p{N}_@/\\-]|^\.[a-z]{2,}/iu.test(after)) continue;

    let word = m[0];
    let mark = after.match(/^(\s*®|\s*\((?:r|tm)\)|\s*™)/i)?.[0] ?? "";
    // "REALTOR®s": the plural s belongs before the ®.
    const pluralAfter = /^®s\b/i.test(after);
    if (pluralAfter) {
      mark = after.slice(0, 2);
      word += "s";
    }
    const caps = m[0] === m[0].toUpperCase();
    if (caps && mark === "®" && !pluralAfter) continue; // written correctly

    end += mark.length;
    out.push({ offset: start, length: end - start, word: text.slice(start, end), sugs: [`${word.toUpperCase()}®`] });
  }
  return out;
}
