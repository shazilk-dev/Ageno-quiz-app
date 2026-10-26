import { resolveQuizId } from "@/lib/server/quizzes";
import { errorResponse, json, readJsonBody } from "@/lib/server/request";
import { ServerTiming } from "@/lib/server/timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Turns an access code into the quiz it belongs to. The code is checked again when an attempt starts. */
export async function POST(request: Request) {
  const timing = new ServerTiming();
  try {
    const body = await readJsonBody(request);
    return timing.apply(json({ quizId: await timing.time("db", () => resolveQuizId(body.code)) }));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
