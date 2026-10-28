import { LIMITS } from "@/lib/quiz-schema";
import { FULL_EXAMPLE, MINIMAL_EXAMPLE } from "./examples";
import { FORMAT_NAME, FORMAT_VERSION } from "./types";

// The words an AI needs to turn someone's questions into an Ageno Quiz file. One source for the skill's
// SKILL.md and for the "Copy AI instructions" button (for an AI that can't install a skill), so the two
// say the same thing and the numbers always come from `LIMITS`.

export const SKILL_NAME = "ageno-quiz-format";

export const SKILL_DESCRIPTION =
  "Turns a set of quiz questions (from a document, spreadsheet, past paper, notes or a photo of them) into a validated Ageno Quiz file, quiz.ageno.json, ready to import into Ageno Quiz. Use whenever someone wants to convert, format or write questions for Ageno Quiz, or mentions quiz.ageno.json or the Ageno Quiz format.";

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** The rules, as a numbered list. */
export function rules(): string {
  return [
    `1. **Ask only for what is missing.** If the source doesn't say which difficulty level the questions belong to (easy, medium or hard), how many minutes people get, or whether to add a reason for each answer option, ask in one short message. Never ask for something the source already tells you.`,
    `2. **Never invent a correct answer.** Use the answer the source gives. If the source gives none and you have to work it out, still mark it, and put a short \`note\` on that question saying it is your inference ("Answer inferred, please check."). Tell the user how many questions have a note.`,
    `3. **Use \`"type": "multiple"\` only when the source says more than one answer is right** (select all that apply, choose two, ...). Everything else is \`"single"\` with exactly one option marked \`isCorrect\`. You may leave \`type\` out: it is then decided by how many options are correct.`,
    `4. **Options:** 3 to 5 unless the source has more (${LIMITS.minOptions} to ${LIMITS.maxOptions} are allowed). Don't pad with silly choices to reach a number. Don't write "all of the above" or "none of the above". Keep the source's own order; if you write the options yourself, vary which position is correct.`,
    `5. **Reasons are optional.** Add \`rationale\` (why one option is right or wrong, up to ${LIMITS.rationale} characters) and \`explanation\` (a note on the whole question, up to ${LIMITS.explanation} characters) when the user asks for them or the source provides them. Never make up facts to fill them in.`,
    `6. **Stay inside the limits:** question text up to ${LIMITS.questionText} characters, an option up to ${LIMITS.optionText}, at most ${LIMITS.maxQuestionsPerLevel} questions per level, and about ${Math.round(LIMITS.maxLevelBytes / 1000)} KB of text per level. If there is more, split it into several files (for example one per level).`,
    `7. **Keep the user's wording** and fix only obvious typos. \`text\` and \`explanation\` may use a small Markdown subset: a blank line between paragraphs, \`**bold**\`, \`_italic_\`, inline code between single backticks, a list (lines that start with \`- \` or \`1. \`, at least two in a row), a code block (a line with three backticks, the code, a line with three backticks) and a table (rule 8). Option \`text\` and \`rationale\` are one line: bold, italic and code only. **No HTML** (never \`<br>\`: use a blank line, or \`\\n\` inside the JSON string), no links, no images, no headings. \`imageUrl\` must be a full https:// link the source gave you; never invent one.`,
    `8. **Keep a table as a table.** When a question depends on a table, a schedule, a price list or any grid of data, write it as a Markdown table inside \`text\`. Never flatten it into a sentence and never replace it with an \`imageUrl\`. Put the scenario first, then the table, then the question, each separated by a blank line. Every row has the same number of cells as the header, and the line under the header is required (\`|---|---|\`; \`---:\` right-aligns a column, so use it for numbers; write a literal pipe in a cell as \`\\|\`). In JSON a line break is \`\\n\`. Keep a table to about 6 columns and 12 rows: split a bigger one into two questions, or say so in a \`note\`. Don't invent cells the source doesn't have; write \`-\` and add a \`note\`.`,
    `9. **Check before you hand it over.** Save the JSON as \`quiz.ageno.json\`, run \`node validate.mjs quiz.ageno.json\`, fix every error it reports and run it again until it says the file is ready. If you cannot run code, check the file against schema.json yourself and say that you could not run the validator. Warnings don't block an import, but a warning about a table or about HTML means a question will not look the way you meant: fix those, and mention any other that matters.`,
    `10. **Hand over the file itself** (no commentary inside it), then say in a few lines: how many questions per level, how many have a note, and anything you couldn't convert.`,
  ].join("\n");
}

/** What the file looks like, with the two examples. */
export function formatSummary(): string {
  return [
    `The file is JSON, "Ageno Quiz Format" version ${FORMAT_VERSION}:`,
    "",
    "- `format` is `\"" + FORMAT_NAME + "\"` and `version` is `" + FORMAT_VERSION + "`.",
    "- `quiz` (optional): `title`, `description`, `duration` (default minutes), `examMode` (`practice` or `strict`), `showAnswerReview` (true or false).",
    "- `levels` (required): `easy`, `medium` and/or `hard`. Each has `questions`, and optionally `duration` (minutes for that level) and `pointsMultiplier` (" + `${LIMITS.minMultiplier} to ${LIMITS.maxMultiplier}` + ").",
    "- A question has `text` and `options` (each `{ \"text\", \"isCorrect\", \"rationale\"? }`), and optionally `type`, `explanation`, `imageUrl` and `note`. `note` is a message to the person importing: it is shown in the import preview and never saved.",
    "- Leave `id` out. Only a file exported from the app has ids, and an id means \"update this existing question\".",
    "",
    "Smallest valid file:",
    "",
    "```json",
    json(MINIMAL_EXAMPLE),
    "```",
    "",
    "A fuller one (settings, two levels, a select-all question, reasons, an explanation and a note, a scenario with a table, and a question with a list):",
    "",
    "```json",
    json(FULL_EXAMPLE),
    "```",
  ].join("\n");
}

/** The SKILL.md of the Agent Skill folder `skills/ageno-quiz-format/`. */
export function skillMarkdown(): string {
  return [
    "---",
    `name: ${SKILL_NAME}`,
    `description: ${SKILL_DESCRIPTION}`,
    "---",
    "",
    "# Ageno Quiz format",
    "",
    "Convert the user's questions into one JSON file that Ageno Quiz can import (Quizzes > Import), and check it before handing it over.",
    "",
    "Files in this folder: `schema.json` (JSON Schema of the format), `validate.mjs` (checks a file with the same rules the app uses; needs Node 18 or newer and nothing else), `examples/` (a minimal and a full file, and a CSV and text template for people who prefer a spreadsheet).",
    "",
    "## Rules",
    "",
    rules(),
    "",
    "## The format",
    "",
    formatSummary(),
    "",
    "## Checking",
    "",
    "```",
    "node validate.mjs quiz.ageno.json",
    "```",
    "",
    "It prints each problem with its place (for example `Easy · question 3: pick the correct answer.`) and ends with a line such as `46 questions: 44 ready, 2 need fixing`. Exit code 0 means the file can be imported; 1 means it has errors; add `--json` for a machine-readable report.",
    "",
  ].join("\n");
}

/** The same guidance as one block to paste into any AI chat, with the schema at the end. */
export function pasteInstructions(schema: string): string {
  return [
    "You are helping me prepare quiz questions for Ageno Quiz. Turn the questions I give you into one JSON file in the format below, following these rules.",
    "",
    "## Rules",
    "",
    rules().replace(/node validate\.mjs quiz\.ageno\.json/g, "the validator (if you have one)"),
    "",
    "## The format",
    "",
    formatSummary(),
    "",
    "## JSON Schema",
    "",
    "```json",
    schema.trim(),
    "```",
    "",
    "Now wait for my questions.",
  ].join("\n");
}
