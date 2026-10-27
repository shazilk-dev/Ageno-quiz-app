// Reads app/theme.css and checks the colour pairs that carry text or a control, for both themes.
// Text pairs need 4.5:1 (WCAG 1.4.3), control edges and decoration 3:1 (1.4.11).
//   node scripts/check-contrast.mjs        prints the table and exits 1 on a failure
// __tests__/theme-contrast.test.ts runs `checkContrast` so a token change cannot quietly break it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const AA_TEXT = 4.5;
const AA_UI = 3;

/** [foreground token, background token, minimum ratio, what it is] */
const PAIRS = [
  ["text", "bg", AA_TEXT, "headings and questions"],
  ["text", "surface", AA_TEXT, "text on a card"],
  ["text-body", "bg", AA_TEXT, "option and reason text"],
  ["text-body", "surface", AA_TEXT, "option text on a card"],
  ["text-muted", "bg", AA_TEXT, "labels and meta"],
  ["text-muted", "surface", AA_TEXT, "labels on a card"],
  ["text-muted", "bg-alt", AA_TEXT, "labels on the alternate band"],
  ["link", "bg", AA_TEXT, "links and small accent text"],
  ["link", "surface", AA_TEXT, "links on a card"],
  ["error", "bg", AA_TEXT, "error text"],
  ["error", "surface", AA_TEXT, "error text on a card"],
  ["error", "error-soft", AA_TEXT, "wrong-answer text on its tint"],
  ["success", "bg", AA_TEXT, "success text"],
  ["success", "surface", AA_TEXT, "success text on a card"],
  ["success", "success-soft", AA_TEXT, "right-answer text on its tint"],
  ["warning", "surface", AA_TEXT, "warning text on a card"],
  ["warm-text", "bg", AA_TEXT, "amber text"],
  ["warm-text", "surface", AA_TEXT, "amber text on a card"],
  ["text-body", "success-soft", AA_TEXT, "body text on the right-answer tint"],
  ["text-body", "error-soft", AA_TEXT, "body text on the wrong-answer tint"],
  ["text-body", "accent-soft", AA_TEXT, "body text on the picked tint"],
  ["text-faint", "surface", AA_UI, "placeholders (not for anything essential)"],
  ["control-border", "bg", AA_UI, "edge of a control on the page"],
  ["control-border", "surface", AA_UI, "edge of a control on a card"],
  ["accent", "bg", AA_UI, "focus ring, picked border, progress bar"],
  ["accent", "surface", AA_UI, "picked border on a card"],
  ["success-line", "success-soft", 1, "decorative edge (text carries the meaning)"],
  ["ink", "teal", AA_TEXT, "text on the primary button"],
];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `name -> value` for the declarations in one `{ ... }` block. */
function declarations(block) {
  const out = {};
  for (const match of block.matchAll(/--color-([a-z-]+):\s*([^;]+);/g)) {
    out[match[1]] = match[2].trim();
  }
  return out;
}

/** The text between the braces of the first rule that starts a line with `selector` (comments mention them too). */
function blockOf(css, selector) {
  const escaped = selector.replace(/[[\]]/g, "\\$&");
  const start = css.search(new RegExp(`^${escaped}\\s*\\{`, "m"));
  if (start < 0) throw new Error(`theme.css has no ${selector} block`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`${selector} block is not closed`);
}

function resolve(name, tokens, seen = new Set()) {
  const value = tokens[name];
  if (value === undefined) throw new Error(`no token --color-${name}`);
  const ref = value.match(/^var\(--color-([a-z-]+)\)$/);
  if (ref) {
    if (seen.has(name)) throw new Error(`token loop at ${name}`);
    return resolve(ref[1], tokens, new Set(seen).add(name));
  }
  if (!HEX.test(value)) {
    throw new Error(`--color-${name} is "${value}": use a hex so it can be checked`);
  }
  return value.length === 4
    ? `#${[...value.slice(1)].map((c) => c + c).join("")}`
    : value.toLowerCase();
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** One row per theme and pair: { theme, fg, bg, ratio, min, what, ok }. */
export function checkContrast(css) {
  const base = declarations(blockOf(css, "@theme static"));
  const themes = {
    light: { ...base, ...declarations(blockOf(css, '[data-theme="light"]')) },
    dark: { ...base, ...declarations(blockOf(css, '[data-theme="dark"]')) },
  };
  const rows = [];
  for (const [theme, tokens] of Object.entries(themes)) {
    for (const [fg, bg, min, what] of PAIRS) {
      const value = ratio(resolve(fg, tokens), resolve(bg, tokens));
      rows.push({ theme, fg, bg, ratio: value, min, what, ok: value >= min });
    }
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const css = readFileSync(new URL("../app/theme.css", import.meta.url), "utf8");
  const rows = checkContrast(css);
  for (const row of rows) {
    console.log(
      `${row.ok ? "ok  " : "FAIL"} ${row.theme.padEnd(5)} ${row.fg} on ${row.bg}: ${row.ratio.toFixed(2)} (needs ${row.min}) ${row.what}`
    );
  }
  const failed = rows.filter((row) => !row.ok);
  console.log(failed.length ? `\n${failed.length} failing` : "\nall pass");
  process.exit(failed.length ? 1 : 0);
}
