import { startAttempt } from "@/lib/server/attempts";
import {
  errorResponse,
  json,
  readJsonBody,
  requireUserId,
} from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts an attempt: the server checks the access code, fixes the clock and returns the questions
 * without their answers. Needs a signed-in user.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);
    const body = await readJsonBody(request);
    return json(
      await startAttempt(body.quizId, body.difficulty, userId, {
        accessCode: body.accessCode,
      }),
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}
