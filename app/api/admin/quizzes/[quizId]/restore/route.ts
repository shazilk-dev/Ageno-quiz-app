import { requireAdmin } from "@/lib/server/admin-access";
import { restoreQuiz } from "@/lib/server/admin-quizzes";
import { invalidateQuiz } from "@/lib/server/cache";
import { errorResponse, json } from "@/lib/server/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ quizId: string }> };

/** Takes a quiz out of the trash. Admin only. */
export async function POST(request: Request, { params }: Context) {
  try {
    await requireAdmin(request);
    const { quizId } = await params;
    await restoreQuiz(quizId);
    invalidateQuiz(quizId);
    return json({ restored: true });
  } catch (error) {
    return errorResponse(error);
  }
}
