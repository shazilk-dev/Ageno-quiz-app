import { requireAdmin } from "@/lib/server/admin-access";
import { getQuestionResultsCsv } from "@/lib/server/admin-insights";
import { errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ quizId: string }> };

/** The quiz's latest results as CSV text, one row per person and question: `{ filename, csv, rows, truncated, results }`. Admin only. */
export async function GET(request: Request, { params }: Context) {
  try {
    await requireAdmin(request);
    return json(await getQuestionResultsCsv((await params).quizId));
  } catch (error) {
    return errorResponse(error);
  }
}
