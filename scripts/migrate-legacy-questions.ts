// Moves quizzes that keep their questions in the old shared `questions` collection into the per-level
// collections (`questions_easy|medium|hard`). Dry run by default: it prints what it would do.
//
//   npm run migrate:questions             # report only
//   npm run migrate:questions -- --apply  # make the change
//
// Needs FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY (it reads .env.local).
import { db } from "@/firebase/admin";
import { migrateLegacyQuestions } from "@/lib/server/legacy-questions";

async function main() {
  const apply = process.argv.includes("--apply");
  const report = await migrateLegacyQuestions(db, { apply });

  if (report.quizzes.length === 0) {
    console.log("No quiz keeps questions in the old shared collection. Nothing to do.");
    return;
  }
  for (const row of report.quizzes) {
    const copied = Object.entries(row.copied)
      .map(([level, count]) => `${level}: ${count}`)
      .join(", ");
    console.log(
      `${row.quizId}: ${row.legacyCount} old question(s) -> ${copied || "nothing"}; ` +
        `${row.removed} removed, ${row.unplaced} left alone`
    );
  }
  console.log(
    apply
      ? // The site caches quiz data (lib/server/cache.ts); a script can't clear that cache.
        "Done. The live site picks this up within 5 minutes (or at once after an admin saves the quiz)."
      : "Dry run: nothing was changed. Run again with --apply to make the change."
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
