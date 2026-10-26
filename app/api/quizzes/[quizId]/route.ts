import { getPublicQuiz } from "@/lib/server/quizzes";
import { errorResponse, json } from "@/lib/server/request";
import { ServerTiming } from "@/lib/server/timing";

export const runtime = "nodejs";

type Context = { params: Promise<{ quizId: string }> };

/**
 * One quiz for its lobby, with how many questions each level has. Public; no access code, no questions.
 * Cached on the server until an admin changes the quiz; not by the CDN (switching a quiz on must show at once).
 */
export async function GET(_request: Request, { params }: Context) {
  const timing = new ServerTiming();
  try {
    const { quizId } = await params;
    return timing.apply(json(await timing.time("db", () => getPublicQuiz(quizId))));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
