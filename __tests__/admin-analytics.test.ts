import { describe, expect, it } from "vitest";
import {
  csvCell,
  formatDuration,
  scoreBands,
  secondsTaken,
  summarizeReports,
  timeBands,
  toCsv,
} from "@/lib/admin-analytics";
import type { ReportRow } from "@/lib/admin-types";

let n = 0;
const row = (over: Partial<ReportRow> = {}): ReportRow => ({
  id: `r${++n}`,
  quizId: "q",
  quizTitle: "Quiz",
  userId: "u",
  userName: "Ada",
  score: 50,
  startedAt: 0,
  submittedAt: 120_000,
  tabSwitchCount: 0,
  fullscreenExits: 0,
  blurCount: 0,
  difficulty: "medium",
  ...over,
});

describe("scoreBands", () => {
  it("puts each score in its fifth, edges included, and counts 0% and 100%", () => {
    const bands = scoreBands([0, 20, 21, 40, 41, 60, 61, 80, 81, 100].map((score) => ({ score })));
    expect(bands.map((b) => b.count)).toEqual([2, 2, 2, 2, 2]);
  });

  it("leaves out unscored results and clamps odd values", () => {
    const bands = scoreBands([{ score: null }, { score: 150 }, { score: -5 }]);
    expect(bands.map((b) => b.count)).toEqual([1, 0, 0, 0, 1]);
  });
});

describe("timeBands", () => {
  it("groups by how long it took and skips rows missing a time or out of order", () => {
    const at = (sec: number) => ({ startedAt: 0, submittedAt: sec * 1000 });
    const bands = timeBands([
      at(59), at(60), at(179), at(299), at(599), at(600), at(5000),
      { startedAt: null, submittedAt: 10 }, { startedAt: 10_000, submittedAt: 5_000 },
    ]);
    expect(bands.map((b) => b.count)).toEqual([1, 2, 1, 1, 2]);
  });
});

describe("summarizeReports", () => {
  it("counts a 0% result and ignores unscored ones for the score numbers only", () => {
    const summary = summarizeReports([row({ score: 0 }), row({ score: 100 }), row({ score: null })]);
    expect(summary).toMatchObject({ attempts: 3, average: 50, highest: 100, lowest: 0 });
  });

  it("averages the time over rows that have both times", () => {
    const summary = summarizeReports([
      row({ submittedAt: 60_000 }), row({ submittedAt: 180_000 }), row({ startedAt: null }),
    ]);
    expect(summary.averageSeconds).toBe(120);
  });

  it("returns nulls for no data", () => {
    expect(summarizeReports([])).toEqual({
      attempts: 0, average: null, highest: null, lowest: null, averageSeconds: null,
    });
  });
});

describe("formatDuration and secondsTaken", () => {
  it("formats minutes, hours and unknowns", () => {
    expect(formatDuration(245)).toBe("4m 05s");
    expect(formatDuration(3725)).toBe("1h 02m");
    expect(formatDuration(null)).toBe("—");
    expect(secondsTaken(row({ startedAt: null }))).toBeNull();
  });
});

describe("CSV export", () => {
  it("doubles quotes", () => {
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
  });

  it("stops a spreadsheet running a name or title as a formula", () => {
    for (const evil of ["=HYPERLINK(\"x\")", "+1", "-2", "@SUM(A1)"]) {
      expect(csvCell(evil).startsWith("\"'")).toBe(true);
    }
    expect(csvCell(-3 as unknown as string)).toBe("\"'-3\"");
    expect(csvCell("safe")).toBe('"safe"');
  });

  it("writes a header and one line per result with ISO times and empty cells for unknowns", () => {
    const end = Date.UTC(2026, 9, 1, 12);
    const csv = toCsv([row({ quizTitle: 'A, "B"', score: null, startedAt: null, submittedAt: end })]);
    const [header, line] = csv.split("\r\n");
    expect(header.startsWith('"Quiz","Player","Score (%)"')).toBe(true);
    expect(line).toBe('"A, ""B""","Ada","","","2026-10-01T12:00:00.000Z","0","0","0"');
  });
});
