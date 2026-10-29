import { requireAdmin } from "@/lib/server/admin-access";
import { getQuizInsights } from "@/lib/server/admin-insights";
import { errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ quizId: string }> };

/** How each question of a quiz performed, from its latest finished results. Admin only. */
export async function GET(request: Request, { params }: Context) {
  try {
    await requireAdmin(request);
    return json(await getQuizInsights((await params).quizId));
  } catch (error) {
    return errorResponse(error);
  }
}
