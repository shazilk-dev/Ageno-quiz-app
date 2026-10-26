import { getAttemptResult } from "@/lib/server/attempts";
import { errorResponse, json, requireUserId } from "@/lib/server/request";
import { ServerTiming } from "@/lib/server/timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The stored result of a finished attempt (score, answers, review), for the person who took it. */
export async function GET(request: Request, { params }: Context) {
  const timing = new ServerTiming();
  try {
    const { id } = await params;
    const userId = await timing.time("auth", requireUserId(request));
    const result = await timing.time("db", () => getAttemptResult(id, userId));
    return timing.apply(json(result, 200, "private, max-age=30"));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
