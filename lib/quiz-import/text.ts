import { LEVELS, isLevel, type EditorQuestion, type Level } from "@/lib/quiz-schema";
import {
  MAX_IMPORT_BYTES,
  addRow,
  emptyImport,
  error,
  warning,
  type ImportRow,
  type ParsedImport,
} from "@/lib/quiz-format/types";

// The plain-text format, for people typing a quiz by hand:
//
//   # Network basics                      the quiz title
//   ## Easy | 20 min | x1                 a level: its name, minutes and points multiplier (all but the name optional)
//
//   1. Which protocol encrypts web traffic?
//      - HTTP                             an option
//        ~ Sends data in plain text.      the reason for the option above
//      - [x] HTTPS                        [x] marks a correct option
//        ~ Adds TLS on top of HTTP.
//      > The S stands for secure.         the overall explanation
//      ! https://example.com/image.png    an image
//
// Each question starts with a number and a dot. More than one [x] makes it a select-all question. A line
// that starts with none of the marks continues the line before it (long questions can wrap). Indentation
// does not matter and a blank line ends the continuation.

const QUESTION = /^(?:q\s*)?(\d+)\s*[.):]\s+(.*)$/i;
const OPTION = /^[-*]\s+(?:\[([ xX])\]\s*)?(.*)$/;
const LEVEL_HEADER = /^##\s*(.+)$/;
const TITLE = /^#\s+(.+)$/;

type Continues = "question" | "option" | "reason" | "explanation" | null;

export function parseQuizText(input: string): ParsedImport {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const parsed = emptyImport("questions");
  if (!text.trim()) {
    parsed.issues.push(error("There is nothing to import."));
    return parsed;
  }
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    parsed.issues.push(error(`That is more than ${MAX_IMPORT_BYTES / 1_000_000} MB. Split the questions into several files.`));
    return parsed;
  }

  let level: Level | null = null;
  let row: ImportRow | null = null;
  let last: Continues = null;
  let sawStructure = false;

  const question = (): EditorQuestion => (row as ImportRow).question;
  const lastOption = () => question().options[question().options.length - 1];
  const append = (base: string | undefined, more: string) => (base ? `${base} ${more}` : more);
  const stray = (number: number, line: string) =>
    parsed.issues.push(warning(`Line ${number} was ignored (it isn't part of a question): ${line.length > 60 ? `${line.slice(0, 60)}...` : line}`));

  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const number = index + 1;
    const line = raw.trim();
    if (!line) {
      last = null;
      return;
    }

    const heading = LEVEL_HEADER.exec(line);
    if (heading) {
      sawStructure = true;
      last = null;
      row = null;
      const [name, ...parts] = heading[1].split("|").map((part) => part.trim());
      const named = name.toLowerCase();
      if (!isLevel(named)) {
        parsed.issues.push(error(`Line ${number}: "${name}" isn't a level. Use ${LEVELS.join(", ")}.`));
        level = null;
        return;
      }
      level = named;
      const settings = (parsed.levels[level] ??= { rows: [] });
      for (const part of parts) {
        const minutes = /^(\d+)\s*(?:min|mins|minutes?|m)?$/i.exec(part);
        const multiplier = /^[x×]\s*(\d+(?:\.\d+)?)$/i.exec(part);
        if (multiplier) settings.pointsMultiplier = Number(multiplier[1]);
        else if (minutes) settings.duration = Number(minutes[1]);
        else if (part) parsed.issues.push(warning(`Line ${number}: "${part}" in the level line wasn't understood (write minutes as "20 min" and the multiplier as "x1.5").`));
      }
      return;
    }

    const title = TITLE.exec(line);
    if (title) {
      if (parsed.settings.title) parsed.issues.push(warning(`Line ${number}: there is more than one title; the first is used.`));
      else parsed.settings.title = title[1].trim();
      last = null;
      return;
    }

    const start = QUESTION.exec(line);
    if (start) {
      sawStructure = true;
      row = {
        question: { type: "single", text: start[2].trim(), options: [] },
        source: `Line ${number}`,
        issues: [],
      };
      addRow(parsed, level, row);
      last = "question";
      return;
    }

    const option = OPTION.exec(line);
    if (option) {
      if (!row) return stray(number, line);
      question().options.push({ text: option[2].trim(), isCorrect: option[1] === "x" || option[1] === "X" });
      last = "option";
      return;
    }

    const mark = line[0];
    if (mark === "~" || mark === ">" || mark === "!") {
      const body = line.slice(1).trim();
      if (!row) return stray(number, line);
      if (mark === "~") {
        if (question().options.length === 0) {
          row.issues.push(error(`line ${number}: a reason ("~") must come after the option it explains.`));
          last = null;
          return;
        }
        lastOption().rationale = body;
        last = "reason";
      } else if (mark === ">") {
        question().explanation = body;
        last = "explanation";
      } else {
        question().imageUrl = body;
        last = null;
      }
      return;
    }

    // No mark: the line before goes on.
    if (!row || !last) return stray(number, line);
    if (last === "question") question().text = append(question().text, line);
    else if (last === "option") lastOption().text = append(lastOption().text, line);
    else if (last === "reason") lastOption().rationale = append(lastOption().rationale, line);
    else question().explanation = append(question().explanation, line);
  });

  // More than one [x] makes a select-all question.
  for (const item of [...LEVELS.flatMap((name) => parsed.levels[name]?.rows ?? []), ...parsed.unplaced]) {
    item.question.type = item.question.options.filter((o) => o.isCorrect).length > 1 ? "multiple" : "single";
  }
  const total = LEVELS.reduce((sum, name) => sum + (parsed.levels[name]?.rows.length ?? 0), 0) + parsed.unplaced.length;
  if (total === 0) {
    parsed.issues.push(
      error(sawStructure ? "No questions were found." : 'No questions were found. Start each question with a number and a dot, like "1. What is ...?".')
    );
  }
  if (parsed.settings.title || LEVELS.some((name) => parsed.levels[name])) parsed.shape = "quiz";
  return parsed;
}
