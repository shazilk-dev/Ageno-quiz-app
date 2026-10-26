import { listPublicQuizzes } from "@/lib/server/quizzes";
import { errorResponse, json } from "@/lib/server/request";
import { ServerTiming } from "@/lib/server/timing";

export const runtime = "nodejs";

/** The quizzes people can pick from. Public, never includes access codes, and fine to cache briefly. */
export async function GET() {
  const timing = new ServerTiming();
  try {
    return timing.apply(
      json(
        { quizzes: await timing.time("db", listPublicQuizzes) },
        200,
        "public, s-maxage=30, stale-while-revalidate=120"
      )
    );
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
