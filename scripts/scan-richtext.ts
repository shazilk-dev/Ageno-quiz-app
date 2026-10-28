// Lists every stored question, option, reason and explanation that would look different once question text
// is shown as rich text (a table, a list, a code block, **bold**, _italic_, `code` or a \ escape), with the
// quiz, the level and the start of the text. Read-only: it never writes.
//
//   npm run scan:richtext
//
// Run it before releasing the rich-text display. The usual fix for a hit is to put a formula in backticks
// (`x**2`) or to write a backslash before the character. Needs FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL
// and FIREBASE_PRIVATE_KEY (it reads .env.local).
import { db } from "@/firebase/admin";
import { scanRichText } from "@/lib/server/richtext-scan";

async function main() {
  const report = await scanRichText(db);
  console.log(`${report.questions} question(s) in ${report.quizzes} quiz(zes) read.`);

  if (report.hits.length === 0) {
    console.log("Nothing would look different. Safe to release.");
    return;
  }
  let current = "";
  for (const hit of report.hits) {
    const heading = `${hit.quizTitle} (${hit.quizId})`;
    if (heading !== current) {
      console.log(`\n${heading}`);
      current = heading;
    }
    console.log(`  ${hit.level} / ${hit.questionId} / ${hit.field}: ${hit.changes.join(", ")}\n    ${hit.snippet}`);
  }
  console.log(`\n${report.hits.length} text(s) would look different. Check each one before release.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
