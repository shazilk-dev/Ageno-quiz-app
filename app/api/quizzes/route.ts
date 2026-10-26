import { listPublicQuizzes } from "@/lib/server/quizzes";
import { errorResponse, json } from "@/lib/server/request";
import { ServerTiming } from "@/lib/server/timing";

export const runtime = "nodejs";

/**
 * The quizzes people can pick from. Public, never includes access codes. Cached on the server until an admin
 * changes a quiz; not cached by the CDN, which an admin save couldn't clear.
 */
export async function GET() {
  const timing = new ServerTiming();
  try {
    return timing.apply(json({ quizzes: await timing.time("db", listPublicQuizzes) }));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
