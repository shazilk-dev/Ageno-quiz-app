import { getMyAttempts } from "@/lib/server/history";
import { errorResponse, json, requireUserId } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's own finished attempts, with quiz titles. */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request);
    return json({ attempts: await getMyAttempts(userId) }, 200, "private, max-age=10");
  } catch (error) {
    return errorResponse(error);
  }
}
