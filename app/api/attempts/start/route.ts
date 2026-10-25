import { startAttempt } from "@/lib/server/attempts";
import {
  errorResponse,
  getRequestUserId,
  json,
  readJsonBody,
} from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts an attempt: the server fixes the clock and returns the questions without their answers. */
export async function POST(request: Request) {
  try {
    const userId = await getRequestUserId(request);
    const body = await readJsonBody(request);
    return json(await startAttempt(body.quizId, body.difficulty, userId), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
