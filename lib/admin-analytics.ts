import type { AttentionItem, ReportRow } from "@/lib/admin-types";

/** One bar of a distribution. */
export interface Band {
  label: string;
  count: number;
}

const SCORE_BANDS: { label: string; max: number }[] = [
  { label: "0–20%", max: 20 },
  { label: "21–40%", max: 40 },
  { label: "41–60%", max: 60 },
  { label: "61–80%", max: 80 },
  { label: "81–100%", max: 100 },
];

const TIME_BANDS: { label: string; maxSec: number }[] = [
  { label: "Under 1 min", maxSec: 60 },
  { label: "1–3 min", maxSec: 180 },
  { label: "3–5 min", maxSec: 300 },
  { label: "5–10 min", maxSec: 600 },
  { label: "Over 10 min", maxSec: Infinity },
];

/** Seconds from start to submit, or null when either time is missing or they are out of order. */
export function secondsTaken(row: Pick<ReportRow, "startedAt" | "submittedAt">): number | null {
  if (row.startedAt === null || row.submittedAt === null) return null;
  const seconds = Math.floor((row.submittedAt - row.startedAt) / 1000);
  return seconds >= 0 ? seconds : null;
}

/** How many results fall in each fifth of the score range. Results with no score are left out. */
export function scoreBands(rows: Pick<ReportRow, "score">[]): Band[] {
  const bands = SCORE_BANDS.map(({ label }) => ({ label, count: 0 }));
  for (const { score } of rows) {
    if (score === null) continue;
    const clamped = Math.max(0, Math.min(100, score));
    const index = SCORE_BANDS.findIndex((band) => clamped <= band.max);
    bands[index].count += 1;
  }
  return bands;
}

/** How many results took roughly how long. Results without both times are left out. */
export function timeBands(rows: Pick<ReportRow, "startedAt" | "submittedAt">[]): Band[] {
  const bands = TIME_BANDS.map(({ label }) => ({ label, count: 0 }));
  for (const row of rows) {
    const seconds = secondsTaken(row);
    if (seconds === null) continue;
    bands[TIME_BANDS.findIndex((band) => seconds < band.maxSec)].count += 1;
  }
  return bands;
}

export interface ReportSummary {
  attempts: number;
  /** Over the scored results only; null when none was scored. */
  average: number | null;
  highest: number | null;
  lowest: number | null;
  averageSeconds: number | null;
}

export function summarizeReports(rows: ReportRow[]): ReportSummary {
  const scores = rows.flatMap((row) => (row.score === null ? [] : [row.score]));
  const times = rows.flatMap((row) => {
    const seconds = secondsTaken(row);
    return seconds === null ? [] : [seconds];
  });
  return {
    attempts: rows.length,
    average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    highest: scores.length ? Math.max(...scores) : null,
    lowest: scores.length ? Math.min(...scores) : null,
    averageSeconds: times.length ? Math.floor(times.reduce((a, b) => a + b, 0) / times.length) : null,
  };
}

/** "4m 05s" (or "1h 02m"); a dash when unknown. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/**
 * One CSV cell. Quotes are doubled, and a cell that starts with = + - or @ gets a leading apostrophe so a
 * spreadsheet shows it as text instead of running it as a formula (a quiz title or name is user input).
 */
export function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(rows: ReportRow[]): string {
  const header = [
    "Quiz",
    "Player",
    "Score (%)",
    "Time taken (s)",
    "Submitted (UTC)",
    "Tab switches",
    "Left fullscreen",
    "Focus lost",
  ];
  const lines = rows.map((row) =>
    [
      row.quizTitle || "Unknown quiz",
      row.userName || "Unknown user",
      row.score ?? "",
      secondsTaken(row) ?? "",
      row.submittedAt === null ? "" : new Date(row.submittedAt).toISOString(),
      row.tabSwitchCount,
      row.fullscreenExits,
      row.blurCount,
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.map(csvCell).join(","), ...lines].join("\r\n");
}

// ---- the dashboard's trend and "needs attention" strip --------------------------------------------------

/** A quiz with at least this many results and an average under this is worth a look. */
export const LOW_AVERAGE_BELOW = 50;
export const LOW_AVERAGE_MIN_RESULTS = 5;
/** Tab switches, lost focus and fullscreen exits together, in one result, at which it is listed. */
export const INTEGRITY_ALERT_AT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last `days` UTC days ending with the day of `now`, oldest first: `YYYY-MM-DD` and the half-open range in epoch ms. */
export function dayWindows(now: number, days = 30): { day: string; start: number; end: number }[] {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  return Array.from({ length: days }, (_, i) => {
    const start = today - (days - 1 - i) * DAY_MS;
    return { day: new Date(start).toISOString().slice(0, 10), start, end: start + DAY_MS };
  });
}

/** Quizzes that finished people did badly on. Lowest average first. */
export function lowAverageAlerts(
  stats: { quizId: string; title: string; results: number; average: number | null }[],
  max = 5
): AttentionItem[] {
  return stats
    .filter(
      (quiz): quiz is typeof quiz & { average: number } =>
        quiz.average !== null && quiz.results >= LOW_AVERAGE_MIN_RESULTS && quiz.average < LOW_AVERAGE_BELOW
    )
    .sort((a, b) => a.average - b.average)
    .slice(0, max)
    .map((quiz) => ({
      kind: "low_average",
      quizId: quiz.quizId,
      title: quiz.title,
      average: Math.round(quiz.average),
      results: quiz.results,
    }));
}

/** Results where the browser recorded a lot happening. Most events first. */
export function integrityAlerts(rows: ReportRow[], max = 5): AttentionItem[] {
  return rows
    .map((row) => ({ row, events: row.tabSwitchCount + row.fullscreenExits + row.blurCount }))
    .filter(({ events }) => events >= INTEGRITY_ALERT_AT)
    .sort((a, b) => b.events - a.events)
    .slice(0, max)
    .map(({ row, events }) => ({
      kind: "integrity",
      attemptId: row.id,
      userName: row.userName || "Unknown user",
      quizTitle: row.quizTitle || "Unknown quiz",
      events,
    }));
}
