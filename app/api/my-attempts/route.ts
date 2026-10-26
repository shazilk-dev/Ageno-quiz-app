import { getMyAttempts } from "@/lib/server/history";
import { errorResponse, json, requireUserId } from "@/lib/server/request";
import { ServerTiming } from "@/lib/server/timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's own finished attempts, with quiz titles. */
export async function GET(request: Request) {
  const timing = new ServerTiming();
  try {
    const userId = await timing.time("auth", requireUserId(request));
    const attempts = await timing.time("db", () => getMyAttempts(userId));
    return timing.apply(json({ attempts }, 200, "private, max-age=10"));
  } catch (error) {
    return timing.apply(errorResponse(error));
  }
}
