import { revalidateTag, unstable_cache } from "next/cache";

// Quiz data that is the same for every player (the public list, a quiz's lobby details, a level's question
// set) is kept in Next's data cache, so most requests never wait on Firestore. Each entry carries tags, and
// an admin create, save or delete clears that quiz's tags (`invalidateQuiz`), so an edit shows on the next
// request. `SAFETY_SECONDS` only matters for changes made outside the app (the Firebase console, scripts).
//
// Everything cached must survive JSON (no Timestamps, no Dates), and a cached function must not read
// cookies or headers. The cache lives on the server only: an answer key cached here never reaches a browser.

const SAFETY_SECONDS = 300;

/** Every public quiz list. */
export const QUIZZES_TAG = "quizzes";
/** Everything about one quiz: its public details, counts and question sets. */
export const quizTag = (quizId: string) => `quiz:${quizId}`;

/**
 * Runs `load` through the data cache under `key`, tagged with `tags`, for `seconds` at most. Outside a
 * Next.js server (scripts, tests that call the code directly) there is no cache, so it just loads.
 */
export function cached<T>(
  key: string[],
  tags: string[],
  load: () => Promise<T>,
  seconds = SAFETY_SECONDS
): Promise<T> {
  return unstable_cache(load, key, { tags, revalidate: seconds })().catch((error: unknown) => {
    if (error instanceof Error && error.message.startsWith("Invariant: incrementalCache missing")) {
      return load();
    }
    throw error;
  });
}

/** After an admin changes or deletes a quiz: the next request reads it fresh. Route handlers only. */
export function invalidateQuiz(quizId: string) {
  revalidateTag(QUIZZES_TAG);
  revalidateTag(quizTag(quizId));
}
