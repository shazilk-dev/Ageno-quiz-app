import { requireAdmin } from "@/lib/server/admin-access";
import { deleteQuizForever } from "@/lib/server/admin-quizzes";
import { invalidateQuiz } from "@/lib/server/cache";
import { errorResponse, json, readJsonBody } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ quizId: string }> };

/**
 * Deletes a quiz in the trash for good, with its questions and everyone's results. The body carries the
 * quiz's title, typed by the admin, which has to match. Admin only.
 */
export async function POST(request: Request, { params }: Context) {
  try {
    await requireAdmin(request);
    const { quizId } = await params;
    const body = await readJsonBody(request);
    const deleted = await deleteQuizForever(quizId, body.title);
    invalidateQuiz(quizId);
    return json(deleted);
  } catch (error) {
    return errorResponse(error);
  }
}
