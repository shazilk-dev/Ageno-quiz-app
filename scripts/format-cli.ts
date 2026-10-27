// The command-line wrapper around `validateQuizFile`. `npm run build:format` bundles it with the rules
// into `skills/ageno-quiz-format/validate.mjs`, a single file with no dependencies, so an AI (or a person)
// can check a quiz file with plain Node:
//
//   node validate.mjs quiz.ageno.json          # readable report
//   node validate.mjs quiz.ageno.json --json   # the same, as JSON
//
// Exit code: 0 the file can be imported, 1 it has errors, 2 it couldn't be read.
import { readFileSync } from "node:fs";
import { validateQuizFile } from "@/lib/quiz-format/validate";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const path = args.find((arg) => !arg.startsWith("--"));

if (!path) {
  console.error("Usage: node validate.mjs <file.ageno.json> [--json]");
  process.exit(2);
}

let text: string;
try {
  text = readFileSync(path, "utf8");
} catch (cause) {
  console.error(`Could not read ${path}: ${cause instanceof Error ? cause.message : cause}`);
  process.exit(2);
}

const report = validateQuizFile(text);
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const message of report.errors) console.log(`ERROR    ${message}`);
  for (const message of report.warnings) console.log(`warning  ${message}`);
  console.log(report.ok ? `Ready to import. ${report.summary}` : `Not ready. ${report.summary}`);
}
process.exit(report.ok ? 0 : 1);
