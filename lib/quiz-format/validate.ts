import { LEVELS, LEVEL_LABELS, LIMITS, levelBytes, type Level } from "@/lib/quiz-schema";
import { checkRows, summarize, type CheckedRow } from "./checks";
import { parseQuizJson } from "./read";
import type { ImportRow } from "./types";

// Checks a whole quiz file the way the import wizard does and reports in plain sentences. The generated
// `validate.mjs` of the AI skill is this function in a file of its own, so the AI's check and the app's
// agree by construction.

export interface FileReport {
  /** No errors (warnings are allowed). */
  ok: boolean;
  shape: "quiz" | "level" | "questions";
  errors: string[];
  warnings: string[];
  /** Questions that passed, per level. */
  counts: Partial<Record<Level, number>>;
  /** One line: "46 questions: 44 ready, 2 need fixing (Row 7, Row 31)". */
  summary: string;
}

export function validateQuizFile(text: string): FileReport {
  const parsed = parseQuizJson(text);
  const errors: string[] = [];
  const warnings: string[] = [];
  const push = (severity: "error" | "warning", message: string) =>
    (severity === "error" ? errors : warnings).push(message);

  for (const issue of parsed.issues) push(issue.severity, issue.message);
  if (parsed.shape === "quiz" && !parsed.settings.title && !parsed.issues.some((i) => i.severity === "error")) {
    warnings.push('The file has no "quiz.title"; you will be asked for one when you import it.');
  }

  const counts: FileReport["counts"] = {};
  const everything: CheckedRow[] = [];
  const checkGroup = (rows: ImportRow[], label: string, level: Level | null) => {
    if (rows.length === 0) return;
    const checked = checkRows(rows);
    everything.push(...checked);
    for (const item of checked) {
      for (const issue of item.issues) push(issue.severity, `${item.row.source}: ${issue.message}`);
    }
    if (rows.length > LIMITS.maxQuestionsPerLevel) {
      errors.push(`${label}: ${rows.length} questions is more than the ${LIMITS.maxQuestionsPerLevel} a level can have. Split it into several files.`);
    }
    const clean = checked.flatMap((item) => (item.clean ? [item.clean] : []));
    if (levelBytes(clean) > LIMITS.maxLevelBytes) {
      errors.push(`${label}: the questions hold too much text (the limit is about ${Math.round(LIMITS.maxLevelBytes / 1000)} KB per level). Split it into several files.`);
    }
    if (level) counts[level] = clean.length;
  };

  for (const level of LEVELS) {
    const entry = parsed.levels[level];
    if (entry) checkGroup(entry.rows, LEVEL_LABELS[level], level);
  }
  checkGroup(parsed.unplaced, "The questions", null);

  const summary = everything.length > 0 ? summarize(everything).text : "No questions found.";
  return { ok: errors.length === 0, shape: parsed.shape, errors, warnings, counts, summary };
}
