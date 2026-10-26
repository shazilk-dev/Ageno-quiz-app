import { startAttempt } from "@/lib/server/attempts";
import {
  errorResponse,
  json,
  readJsonBody,
  requireUserId,
} from "@/lib/server/request";
import { ServerTiming } from "@/lib/server/timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts an attempt: the server checks the access code, fixes the clock and returns the questions
 * without their answers. Needs a signed-in user.
 */
export async function POST(request: Request) {
  const timing = new ServerTiming();
  try {
    const userId = await timing.time("auth", requireUserId(request));
    const body = await readJsonBody(request);
    const attempt = await timing.time("db", () =>
      startAttempt(body.quizId, body.difficulty, userId, { accessCode: body.accessCode })
    );
    return timing.apply(json(attempt, 201));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
