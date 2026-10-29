import { requireAdmin } from "@/lib/server/admin-access";
import { getReportsPage } from "@/lib/server/admin-reports";
import { errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One page of finished results, newest first (`?limit=` up to 500, `?cursor=` from the previous page, `?quizId=` for one quiz, or `?userId=` for one person). Admin only. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const params = new URL(request.url).searchParams;
    const limit = params.get("limit");
    return json(
      await getReportsPage(
        limit === null ? undefined : Number(limit),
        params.get("cursor"),
        params.get("quizId"),
        params.get("userId")
      )
    );
  } catch (error) {
    return errorResponse(error);
  }
}
