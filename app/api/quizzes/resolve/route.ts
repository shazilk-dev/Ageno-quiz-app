import { resolveQuizId } from "@/lib/server/quizzes";
import { errorResponse, json, readJsonBody } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Turns an access code into the quiz it belongs to. The code is checked again when an attempt starts. */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    return json({ quizId: await resolveQuizId(body.code) });
  } catch (error) {
    return errorResponse(error);
  }
}
