// Builds the precomputed leaderboard (`leaderboard`, `userTotals`) and each quiz's `responseCount` from
// every result in `responses`. Dry run by default: it prints what it would write.
//
//   npm run backfill:leaderboard             # report only
//   npm run backfill:leaderboard -- --apply  # write it
//
// Safe to run again at any time (it rebuilds from scratch). Run it while nobody is submitting a quiz.
// Needs FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY (it reads .env.local).
import { db } from "@/firebase/admin";
import { backfillLeaderboard } from "@/lib/server/leaderboard-store";

async function main() {
  const apply = process.argv.includes("--apply");
  const report = await backfillLeaderboard(db, { apply });

  console.log(
    `${report.responses} result(s), ${report.scored} with a score: ` +
      `${report.entries} leaderboard row(s) for ${report.people} people; ` +
      `${report.stale} old document(s) nothing supports.`
  );
  const counts = Object.entries(report.responseCounts);
  console.log(`Result counts for ${counts.length} quiz(zes):`);
  for (const [quizId, count] of counts) console.log(`  ${quizId}: ${count}`);
  if (report.top.length > 0) {
    console.log("Overall board, first rows:");
    report.top.forEach((row, index) =>
      console.log(
        `  ${index + 1}. ${row.name ?? row.userId}: ${row.points} points, ${row.quizCount} quiz(zes), ${row.attempts} attempt(s)`
      )
    );
  }
  console.log(
    apply
      ? "Done. The leaderboard and the admin quiz list now read these."
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
