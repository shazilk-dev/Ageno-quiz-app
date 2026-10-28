import { LEVELS, LEVEL_LABELS, type EditorQuestion, type ExamMode, type LevelInput, type Level } from "@/lib/quiz-schema";
import { OPTION_LETTERS } from "@/lib/quiz-import/spreadsheet";
import { writeMultiline } from "@/lib/quiz-import/multiline";
import { toCsvText } from "@/lib/quiz-import/table";
import { FORMAT_NAME, FORMAT_VERSION } from "./types";

// A quiz as a file: the JSON of Ageno Quiz Format (the backup, and the way to edit a quiz in an AI chat),
// a CSV for editing in Excel or Sheets, and the plain-text format. The JSON and CSV carry question ids, so
// importing an edited file with "update in place" changes the questions that were edited and nothing else.
// The text format has no ids and no per-level notes beyond minutes and multiplier; use it to replace a level.
// A question's text and explanation keep their line breaks in all three (tables, lists and code blocks
// survive); options and reasons are one line each.

export interface ExportableQuiz {
  title: string;
  description?: string;
  duration: number;
  examMode: ExamMode;
  showAnswerReview: boolean;
  levels: Partial<Record<Level, LevelInput>>;
}

const levelsWithQuestions = (quiz: ExportableQuiz): Level[] =>
  LEVELS.filter((level) => (quiz.levels[level]?.questions.length ?? 0) > 0);

function questionToJson(question: EditorQuestion) {
  return {
    ...(question.id ? { id: question.id } : {}),
    type: question.type,
    text: question.text,
    options: question.options.map((option) => ({
      text: option.text,
      isCorrect: option.isCorrect,
      ...(option.rationale ? { rationale: option.rationale } : {}),
    })),
    ...(question.explanation ? { explanation: question.explanation } : {}),
    ...(question.imageUrl ? { imageUrl: question.imageUrl } : {}),
  };
}

export function exportJson(quiz: ExportableQuiz): string {
  const levels: Record<string, unknown> = {};
  for (const level of levelsWithQuestions(quiz)) {
    const input = quiz.levels[level] as LevelInput;
    levels[level] = {
      duration: input.duration,
      pointsMultiplier: input.pointsMultiplier,
      questions: input.questions.map(questionToJson),
    };
  }
  return JSON.stringify(
    {
      format: FORMAT_NAME,
      version: FORMAT_VERSION,
      quiz: {
        title: quiz.title,
        ...(quiz.description ? { description: quiz.description } : {}),
        duration: quiz.duration,
        examMode: quiz.examMode,
        showAnswerReview: quiz.showAnswerReview,
      },
      levels,
    },
    null,
    2
  );
}

/** The header row of a CSV with room for `optionCount` options, with a reason column for each when asked. */
export function csvHeader(optionCount: number, withReasons: boolean): string[] {
  const letters = OPTION_LETTERS.slice(0, optionCount);
  return [
    "id",
    "level",
    "type",
    "question",
    ...letters.map((letter) => `option_${letter}`),
    "correct",
    "explanation",
    ...(withReasons ? letters.map((letter) => `${letter}_why`) : []),
    "image",
  ];
}

export function exportCsv(quiz: ExportableQuiz): string {
  const entries = levelsWithQuestions(quiz).flatMap((level) =>
    (quiz.levels[level] as LevelInput).questions.map((question) => ({ level, question }))
  );
  const optionCount = Math.max(4, ...entries.map(({ question }) => question.options.length));
  const withReasons = entries.some(({ question }) => question.options.some((option) => option.rationale));
  const rows = entries.map(({ level, question }) => {
    const cells = OPTION_LETTERS.slice(0, optionCount).map((_, index) => question.options[index]?.text ?? "");
    const reasons = OPTION_LETTERS.slice(0, optionCount).map((_, index) => question.options[index]?.rationale ?? "");
    const correct = question.options.flatMap((option, index) => (option.isCorrect ? [OPTION_LETTERS[index].toUpperCase()] : []));
    return [
      question.id ?? "",
      level,
      question.type,
      question.text,
      ...cells,
      correct.join(","),
      question.explanation ?? "",
      ...(withReasons ? reasons : []),
      question.imageUrl ?? "",
    ];
  });
  return "﻿" + toCsvText([csvHeader(optionCount, withReasons), ...rows]);
}

const oneLine = (text: string) => text.replace(/\s*\r?\n\s*/g, " ").trim();

/** The mark and the first line, then the rest indented (the lines of a code block stay at the left edge). */
function multiline(mark: string, text: string): string[] {
  return writeMultiline(text).map(({ line, inFence }, index) =>
    index === 0 ? `${mark}${line}` : inFence || line === "" ? line : `   ${line}`
  );
}

export function exportText(quiz: ExportableQuiz): string {
  const lines: string[] = [`# ${oneLine(quiz.title)}`, ""];
  for (const level of levelsWithQuestions(quiz)) {
    const input = quiz.levels[level] as LevelInput;
    lines.push(`## ${LEVEL_LABELS[level]} | ${input.duration} min | x${input.pointsMultiplier}`, "");
    input.questions.forEach((question, index) => {
      lines.push(...multiline(`${index + 1}. `, question.text));
      for (const option of question.options) {
        lines.push(`   - ${option.isCorrect ? "[x] " : ""}${oneLine(option.text)}`);
        if (option.rationale) lines.push(`     ~ ${oneLine(option.rationale)}`);
      }
      if (question.explanation) lines.push(...multiline("   > ", question.explanation));
      if (question.imageUrl) lines.push(`   ! ${question.imageUrl}`);
      lines.push("");
    });
  }
  return lines.join("\n");
}
