import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkContrast } from "../scripts/check-contrast.mjs";

type Row = { theme: string; fg: string; bg: string; ratio: number; min: number; ok: boolean };

describe("theme contrast (scripts/check-contrast.mjs)", () => {
  const css = readFileSync(new URL("../app/theme.css", import.meta.url), "utf8");
  const rows = checkContrast(css) as unknown as Row[];

  it("checks both themes", () => {
    expect(new Set(rows.map((row) => row.theme))).toEqual(new Set(["light", "dark"]));
    expect(rows.length).toBeGreaterThan(40);
  });

  it("has no text pair under 4.5:1 and no control edge under 3:1, in either theme", () => {
    const failing = rows
      .filter((row) => !row.ok)
      .map((row) => `${row.theme}: ${row.fg} on ${row.bg} is ${row.ratio.toFixed(2)}, needs ${row.min}`);
    expect(failing).toEqual([]);
  });
});
