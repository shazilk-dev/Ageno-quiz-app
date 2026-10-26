// Gives results written before the answer sheet existed a `sheet` (and `schemaVersion: 2`), built from their
// `responses/{id}/answers/*` documents. Dry run by default: it prints what it would write.
//
//   npm run backfill:sheets             # report only
//   npm run backfill:sheets -- --apply  # write it
//
// Safe to run again at any time, and while people are taking quizzes (new results already have a sheet).
// The old answer documents are left in place. Needs FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and
// FIREBASE_PRIVATE_KEY (it reads .env.local).
import { db } from "@/firebase/admin";
import { backfillSheets } from "@/lib/server/response-sheets";

async function main() {
  const apply = process.argv.includes("--apply");
  const report = await backfillSheets(db, { apply });

  console.log(
    `${report.responses} result(s): ${report.alreadyDone} already have a sheet, ` +
      `${report.built} ${apply ? "got one" : "would get one"}, ` +
      `${report.unreadable} answered questions but have no answer documents to read.`
  );
  console.log(
    apply
      ? "Done. Per-question reports can read one document per result."
      : "Dry run: nothing was changed. Run again with --apply to write it."
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
