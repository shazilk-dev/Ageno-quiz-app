import { getAttemptResult } from "@/lib/server/attempts";
import { errorResponse, json, requireUserId } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The stored result of a finished attempt (score, answers, review), for the person who took it. */
export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const userId = await requireUserId(request);
    return json(await getAttemptResult(id, userId), 200, "private, max-age=30");
  } catch (error) {
    return errorResponse(error);
  }
}
