import { getLeaderboard } from "@/lib/server/leaderboard";
import { errorResponse, json, requireUserId } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Leaderboard rows with display names and quiz titles already resolved. Signed-in users only. */
export async function GET(request: Request) {
  try {
    await requireUserId(request);
    const params = new URL(request.url).searchParams;
    return json(
      await getLeaderboard({
        timeFrame: params.get("timeFrame") ?? undefined,
        quizId: params.get("quizId") ?? undefined,
        difficulty: params.get("difficulty") ?? undefined,
      }),
      200,
      "private, max-age=30, stale-while-revalidate=60"
    );
  } catch (error) {
    return errorResponse(error);
  }
}
