import { getLeaderboard } from "@/lib/server/leaderboard";
import { errorResponse, json, requireUserId } from "@/lib/server/request";
import { ServerTiming } from "@/lib/server/timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A ranked leaderboard with display names, and the caller's own place on it. Signed-in users only. */
export async function GET(request: Request) {
  const timing = new ServerTiming();
  try {
    const userId = await timing.time("auth", requireUserId(request));
    const params = new URL(request.url).searchParams;
    const board = await timing.time("db", () =>
      getLeaderboard(
        {
          timeFrame: params.get("timeFrame") ?? undefined,
          quizId: params.get("quizId") ?? undefined,
          difficulty: params.get("difficulty") ?? undefined,
        },
        userId
      )
    );
    return timing.apply(json(board, 200, "private, max-age=30, stale-while-revalidate=60"));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
